'use strict';

const dom = {
  fileName: document.getElementById('file-name'),
  fileSize: document.getElementById('file-size'),
  btnLocal: document.getElementById('btn-download-local'),
  btnCloud: document.getElementById('btn-download-cloud'),
  pwdSection: document.getElementById('password-section'),
  inputPwd: document.getElementById('input-password'),
  downloadPanel: document.getElementById('download-panel'),
  metricsPanel: document.getElementById('download-metrics'),
  progressPct: document.getElementById('metric-progress'),
  progressSpeed: document.getElementById('metric-speed'),
  progressAmount: document.getElementById('metric-downloaded'),
  progressBar: document.getElementById('progress-bar'),
  statusTxt: document.getElementById('download-status'),
};

let fileInfo = null;
const urlParams = new URLSearchParams(window.location.search);
const shareId = urlParams.get('id');
const peerId = urlParams.get('peer');
const peerFileName = urlParams.get('name');
const peerFileSize = parseInt(urlParams.get('size'), 10);

const isE2EE = window.location.hash.startsWith('#e2ee=');
const E2EE_SECRET = isE2EE ? window.location.hash.substring(6) : null;

let CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks
if (isE2EE) CHUNK_SIZE += 28; // E2EE overhead per chunk (12 IV + 16 Auth tag)

const BASE_CHUNK_SIZE = 5 * 1024 * 1024;
const CONCURRENCY = 4;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 2 : 0)} ${sizes[i]}`;
}

async function fetchInfo() {
  if (peerId) {
    dom.fileName.textContent = peerFileName || 'Unknown P2P File';
    if (isE2EE) {
      dom.fileSize.textContent = `${formatBytes(peerFileSize)} (Encrypted)`;
      console.log('E2EE link detected. Will decrypt client-side.');
      await E2EE.importKey(E2EE_SECRET);
    } else {
      dom.fileSize.textContent = formatBytes(peerFileSize);
    }
    dom.downloadPanel.classList.remove('hidden');
    dom.statusTxt.textContent = 'P2P Direct Connection Ready';
    dom.statusTxt.style.color = '#3b82f6';
    return;
  }

  if (!shareId) {
    dom.fileName.textContent = 'Error: Invalid Link';
    dom.fileSize.textContent = 'No share ID provided.';
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/download/${shareId}/info`);
    if (!res.ok) throw new Error('File not found or link expired.');
    fileInfo = await res.json();

    dom.fileName.textContent = fileInfo.originalName;
    if (isE2EE) {
      dom.fileSize.textContent = `${formatBytes(fileInfo.sizeBytes)} (Encrypted)`;
      console.log('E2EE link detected. Will decrypt client-side.');
      await E2EE.importKey(E2EE_SECRET);
    } else {
      dom.fileSize.textContent = formatBytes(fileInfo.sizeBytes);
    }

    // Geoblocking Enforcement
    if (fileInfo.geoblock && fileInfo.geoblock !== 'none') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let blocked = false;
      if (fileInfo.geoblock === 'US' && tz.includes('America/')) blocked = true;
      if (fileInfo.geoblock === 'EU' && tz.includes('Europe/')) blocked = true;
      if (fileInfo.geoblock === 'CN' && tz.includes('Asia/Shanghai')) blocked = true;
      if (fileInfo.geoblock === 'RU' && tz.includes('Moscow')) blocked = true;
      
      if (blocked) {
        throw new Error('GEOBLOCK_ERROR: This file is restricted and cannot be downloaded from your current region.');
      }
    }

    // Expiration check
    if (fileInfo.expiration && fileInfo.expiration !== 'never') {
      const created = new Date(fileInfo.createdAt || Date.now());
      let maxAgeHours = 0;
      if (fileInfo.expiration === '1h') maxAgeHours = 1;
      if (fileInfo.expiration === '24h') maxAgeHours = 24;
      if (fileInfo.expiration === '7d') maxAgeHours = 24 * 7;
      
      const elapsedHours = (Date.now() - created.getTime()) / (1000 * 60 * 60);
      if (elapsedHours >= maxAgeHours) {
        throw new Error('LINK_EXPIRED: This download link has expired.');
      }
    }
    
    // Max Downloads Check
    if (fileInfo.maxDownloads && (fileInfo.downloads || 0) >= fileInfo.maxDownloads) {
      throw new Error('MAX_DOWNLOADS_REACHED: This file has reached its maximum allowed downloads.');
    }

    if (fileInfo.requiresPassword) {
      dom.pwdSection.classList.remove('hidden');
    }

    if (fileInfo.selfDestruct) {
      document.getElementById('self-destruct-warning').classList.remove('hidden');
    }

    // Media preview logic
    const previewImg = document.getElementById('preview-img');
    const previewVid = document.getElementById('preview-vid');
    const mediaPreviewSection = document.getElementById('media-preview');
    
    if (fileInfo.mimeType && fileInfo.mimeType.startsWith('image/')) {
      mediaPreviewSection.classList.remove('hidden');
      previewImg.src = `${CONFIG.API_BASE_URL}/api/download/${shareId}/stream`;
      previewImg.style.display = 'inline-block';
    } else if (fileInfo.mimeType && fileInfo.mimeType.startsWith('video/')) {
      mediaPreviewSection.classList.remove('hidden');
      previewVid.src = `${CONFIG.API_BASE_URL}/api/download/${shareId}/stream`;
      previewVid.style.display = 'inline-block';
    }

    if (fileInfo.cloudUrl) {
      dom.btnCloud.classList.remove('hidden');
      dom.btnCloud.onclick = () => window.open(fileInfo.cloudUrl, '_blank');
    }

    dom.btnLocal.disabled = false;
    dom.btnLocal.onclick = startDownload;
  } catch (err) {
    dom.fileName.textContent = 'Error';
    dom.fileSize.textContent = err.message;
  }
}

let failedAttempts = 0;

async function triggerSelfDestruct() {
  alert('SECURITY ALERT: 3 failed password attempts. The file has self-destructed and is no longer available.');
  dom.fileName.textContent = 'FILE DESTROYED';
  dom.fileName.style.color = 'var(--error)';
  dom.fileSize.textContent = 'Access permanently revoked.';
  dom.btnLocal.disabled = true;
  document.getElementById('pwd-container').classList.add('hidden');
  
  // Call backend to actually delete it
  try {
    // We send a self-destruct signal. The mock backend will handle it.
    await fetch(`${CONFIG.API_BASE_URL}/api/download/${shareId}/self-destruct`, { method: 'POST' });
  } catch(e) {}
}

async function startDownload() {
  let password = null;
  if (fileInfo && fileInfo.requiresPassword) {
    password = dom.inputPwd.value.trim();
    if (!password) {
      alert('Please enter the password to unlock this file.');
      return;
    }
  }

  // Check if File System Access API is supported
  if (!('showSaveFilePicker' in window)) {
    // Fallback for browsers (Firefox, Safari) that don't support showSaveFilePicker
    dom.statusTxt.textContent = 'Falling back to standard download...';
    const url = `${CONFIG.API_BASE_URL}/api/download/${shareId}/stream${password ? '?password=' + encodeURIComponent(password) : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) {
        failedAttempts++;
        if (failedAttempts >= 3) {
          triggerSelfDestruct();
          return;
        } else {
          alert(`Incorrect password. Attempt ${failedAttempts}/3`);
          return;
        }
      }
      throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    }
    window.location.href = url;
    return;
  }

  const options = {
    suggestedName: peerFileName || (fileInfo ? fileInfo.originalName : 'download')
  };
  
  try {
    const handle = await window.showSaveFilePicker(options);
    const writable = await handle.createWritable();
    
    dom.btnLocal.disabled = true;
    dom.btnCloud.disabled = true;
    dom.inputPwd.disabled = true;
    dom.metricsPanel.classList.remove('hidden');
    dom.statusTxt.textContent = 'Downloading...';

    // WebRTC Direct P2P Route
    if (peerId) {
      WebRTC.startClient(
        peerId,
        null,
        writable,
        (downloaded) => {
          // Progress
          const pct = Math.round((downloaded / peerFileSize) * 100);
          dom.progressPct.textContent = `${pct}%`;
          dom.progressBar.style.width = `${pct}%`;
        },
        async () => {
          // Complete
          await writable.close();
          dom.progressBar.classList.remove('progress-fill-primary');
          dom.progressBar.classList.add('progress-fill-success');
          dom.statusTxt.textContent = 'Download Complete!';
          if (fileInfo && fileInfo.webhookUrl) {
            try { fetch(fileInfo.webhookUrl, { method: 'POST', mode: 'no-cors' }); } catch(e) {}
          }
        },
        (err) => {
          // Error
          alert('P2P Download failed: ' + err.message);
          dom.statusTxt.textContent = 'Download failed.';
          dom.statusTxt.style.color = '#ef4444';
        }
      );
      return; // Exit normal download flow
    }

    // Normal Server Route
    const totalSize = fileInfo.sizeBytes;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    
    let downloadedBytes = 0;
    let speedSamples = [];
    const startTime = Date.now();
    
    const updateMetrics = () => {
      const pct = totalSize > 0 ? Math.round((downloadedBytes / totalSize) * 100) : 100;
      dom.progressPct.textContent = `${pct}%`;
      dom.progressBar.style.width = `${pct}%`;
      dom.progressAmount.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalSize)}`;
      
      const now = Date.now();
      speedSamples.push({ time: now, bytes: downloadedBytes });
      speedSamples = speedSamples.filter(s => now - s.time < 5000);
      
      if (speedSamples.length >= 2) {
        const oldest = speedSamples[0];
        const newest = speedSamples[speedSamples.length - 1];
        const elapsed = (newest.time - oldest.time) / 1000;
        if (elapsed > 0) {
          const speed = (newest.bytes - oldest.bytes) / elapsed;
          if (speed > 0 && speed < 1024 * 1024) {
            dom.progressSpeed.textContent = `${(speed / 1024).toFixed(0)} KB/s`;
          } else {
            dom.progressSpeed.textContent = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
          }
          
          // Calculate ETA
          const remainingBytes = totalSize - downloadedBytes;
          if (speed > 0) {
            const remainingSeconds = Math.round(remainingBytes / speed);
            const mins = Math.floor(remainingSeconds / 60);
            const secs = remainingSeconds % 60;
            document.getElementById('metric-eta').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          }
        }
      }
    };
    
    const metricsInterval = setInterval(updateMetrics, 500);

    // Queue of chunks to download
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      chunks.push({
        index: i,
        start: i * CHUNK_SIZE,
        end: Math.min((i + 1) * CHUNK_SIZE - 1, totalSize - 1)
      });
    }

    // Process queue with concurrency limit
    const activeWorkers = [];
    let hasError = null;

    const worker = async () => {
      while (chunks.length > 0 && !hasError) {
        const chunk = chunks.shift();
        let retryCount = 0;
        let success = false;
        
        while (!success && retryCount < 3) {
          try {
            let url = `/api/download/${shareId}/stream`;
            if (password) url += `?password=${encodeURIComponent(password)}`;
            
            const res = await fetch(`${CONFIG.API_BASE_URL}${url}`, {
              headers: {
                'Range': `bytes=${chunk.start}-${chunk.end}`
              }
            });
            
            if (!res.ok) {
              if (res.status === 401 || res.status === 403) {
                failedAttempts++;
                if (failedAttempts >= 3) {
                  triggerSelfDestruct();
                  throw new Error('Self destruct triggered.');
                }
                throw new Error('Invalid password');
              }
              throw new Error(`HTTP ${res.status}`);
            }
            
            let chunkData = await res.arrayBuffer();
            
            if (isE2EE) {
              chunkData = await E2EE.decryptChunk(chunkData);
            }
            
            // Write directly to disk at the correct decrypted offset
            const position = isE2EE ? (chunk.index * BASE_CHUNK_SIZE) : chunk.start;
            await writable.write({ type: 'write', position: position, data: chunkData });
            
            downloadedBytes += chunkData.byteLength;
            success = true;
            
            // QoS Bandwidth Throttling
            const qosMB = parseInt(document.getElementById('opt-qos')?.value || '0', 10);
            if (qosMB > 0) {
              const targetBytesPerSec = qosMB * 1024 * 1024;
              const targetDurationMs = (chunkData.byteLength / targetBytesPerSec) * 1000;
              await new Promise(r => setTimeout(r, targetDurationMs / CONCURRENCY));
            }
          } catch (err) {
            retryCount++;
            if (retryCount >= 3) hasError = err;
            await new Promise(r => setTimeout(r, 1000 * retryCount)); // exponential backoff
          }
        }
      }
    };

    for (let i = 0; i < CONCURRENCY; i++) {
      activeWorkers.push(worker());
    }

    await Promise.all(activeWorkers);
    clearInterval(metricsInterval);

    if (hasError) {
      throw hasError;
    }

    await writable.close();
    
    updateMetrics(); // final update
    dom.progressBar.classList.remove('progress-fill-primary');
    dom.progressBar.classList.add('progress-fill-success');
    dom.statusTxt.textContent = 'Download Complete!';
    if (fileInfo && fileInfo.webhookUrl) {
      try { fetch(fileInfo.webhookUrl, { method: 'POST', mode: 'no-cors' }); } catch(e) {}
    }
    dom.progressSpeed.textContent = '-- MB/s';
    
  } catch (err) {
    if (err.name === 'AbortError') return; // User cancelled file picker
    alert('Download failed: ' + err.message);
    dom.statusTxt.textContent = 'Download failed.';
    dom.statusTxt.style.color = '#ef4444';
  }
}

fetchInfo();
