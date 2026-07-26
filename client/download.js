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

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks
const CONCURRENCY = 4;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 2 : 0)} ${sizes[i]}`;
}

async function fetchInfo() {
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
    dom.fileSize.textContent = formatBytes(fileInfo.sizeBytes);

    if (fileInfo.requiresPassword) {
      dom.pwdSection.classList.remove('hidden');
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

async function startDownload() {
  const password = dom.inputPwd.value;
  if (fileInfo.requiresPassword && !password) {
    alert('Please enter a password.');
    return;
  }

  // Check if File System Access API is supported
  if ('showSaveFilePicker' in window) {
    await runDistributedDownload(password);
  } else {
    // Fallback for browsers (Firefox, Safari) that don't support showSaveFilePicker
    dom.statusTxt.textContent = 'Falling back to standard browser download...';
    let url = `/api/download/${shareId}/stream`;
    if (password) url += `?password=${encodeURIComponent(password)}`;
    window.location.href = `${CONFIG.API_BASE_URL}${url}`;
  }
}

async function runDistributedDownload(password) {
  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: fileInfo.originalName,
    });
    
    // Create a FileSystemWritableFileStream to write to
    const writable = await fileHandle.createWritable();
    
    dom.downloadPanel.classList.add('hidden');
    dom.metricsPanel.classList.remove('hidden');
    dom.statusTxt.textContent = 'Streaming chunks to disk...';

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
              if (res.status === 401 || res.status === 403) throw new Error('Invalid password');
              throw new Error(`HTTP ${res.status}`);
            }
            
            const chunkData = await res.arrayBuffer();
            
            // Write directly to disk at the correct offset
            await writable.write({ type: 'write', position: chunk.start, data: chunkData });
            
            downloadedBytes += chunkData.byteLength;
            success = true;
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
    dom.progressSpeed.textContent = '-- MB/s';
    
  } catch (err) {
    if (err.name === 'AbortError') return; // User cancelled file picker
    alert('Download failed: ' + err.message);
    dom.statusTxt.textContent = 'Download failed.';
    dom.statusTxt.style.color = '#ef4444';
  }
}

fetchInfo();
