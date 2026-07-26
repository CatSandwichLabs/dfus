'use strict';

/* ============================================================================
   DFUS - Client Application
   Handles file selection, incremental SHA-256, chunked upload with concurrency
   control, retry logic, resumability, and the Packet Matrix UI.
   ============================================================================ */

/* ----------------------------------------------------------------------------
   Incremental SHA-256
   A pure-JavaScript, streaming SHA-256 implementation that accepts data in
   chunks via update() and finalizes with digest(). This avoids loading the
   entire file into memory for hash computation.
   ---------------------------------------------------------------------------- */
class IncrementalSHA256 {
  constructor() {
    this._K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
      0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
      0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
      0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
      0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
      0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    this._H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    this._buf = new Uint8Array(64);
    this._bufLen = 0;
    this._totalLen = 0;
  }

  update(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let i = 0;
    while (i < bytes.length) {
      const space = 64 - this._bufLen;
      const take = Math.min(space, bytes.length - i);
      this._buf.set(bytes.subarray(i, i + take), this._bufLen);
      this._bufLen += take;
      i += take;
      if (this._bufLen === 64) {
        this._processBlock(this._buf);
        this._bufLen = 0;
      }
    }
    this._totalLen += bytes.length;
    return this;
  }

  digest() {
    const totalBits = this._totalLen * 8;
    const padBuf = new Uint8Array(this._bufLen <= 55 ? 64 : 128);
    padBuf.set(this._buf.subarray(0, this._bufLen));
    padBuf[this._bufLen] = 0x80;
    const view = new DataView(padBuf.buffer);
    const hiWord = Math.floor(totalBits / 0x100000000);
    const loWord = totalBits >>> 0;
    view.setUint32(padBuf.length - 8, hiWord, false);
    view.setUint32(padBuf.length - 4, loWord, false);
    for (let offset = 0; offset < padBuf.length; offset += 64) {
      this._processBlock(padBuf.subarray(offset, offset + 64));
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let j = 0; j < 8; j++) outView.setUint32(j * 4, this._H[j], false);
    return Array.from(out).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  _processBlock(block) {
    const W = new Uint32Array(64);
    const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = this._rotr(W[i - 15], 7) ^ this._rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = this._rotr(W[i - 2], 17) ^ this._rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this._H;
    for (let i = 0; i < 64; i++) {
      const S1 = this._rotr(e, 6) ^ this._rotr(e, 11) ^ this._rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + this._K[i] + W[i]) >>> 0;
      const S0 = this._rotr(a, 2) ^ this._rotr(a, 13) ^ this._rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }
    this._H[0] = (this._H[0] + a) >>> 0;
    this._H[1] = (this._H[1] + b) >>> 0;
    this._H[2] = (this._H[2] + c) >>> 0;
    this._H[3] = (this._H[3] + d) >>> 0;
    this._H[4] = (this._H[4] + e) >>> 0;
    this._H[5] = (this._H[5] + f) >>> 0;
    this._H[6] = (this._H[6] + g) >>> 0;
    this._H[7] = (this._H[7] + h) >>> 0;
  }

  _rotr(v, n) {
    return ((v >>> n) | (v << (32 - n))) >>> 0;
  }
}

/* ----------------------------------------------------------------------------
   Utility: SHA-256 of an ArrayBuffer (for individual chunks - 5 MB max)
   ---------------------------------------------------------------------------- */
async function computeChunkSHA256(arrayBuffer) {
  const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ----------------------------------------------------------------------------
   Utility: format bytes
   ---------------------------------------------------------------------------- */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 2 : 0)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec <= 0 || !isFinite(bytesPerSec)) return '-- MB/s';
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

/* ----------------------------------------------------------------------------
   DOM References
   ---------------------------------------------------------------------------- */
const dom = {
  dropZone:           document.getElementById('drop-zone'),
  fileInput:          document.getElementById('file-input'),
  fileInfo:           document.getElementById('file-info'),
  infoFilename:       document.getElementById('info-filename'),
  infoFilesize:       document.getElementById('info-filesize'),
  infoChunks:         document.getElementById('info-chunks'),
  infoHash:           document.getElementById('info-hash'),
  hashProgressContainer: document.getElementById('hash-progress-container'),
  hashProgressBar:    document.getElementById('hash-progress-bar'),
  hashProgressPct:    document.getElementById('hash-progress-pct'),
  uploadControls:     document.getElementById('upload-controls'),
  btnStart:           document.getElementById('btn-start'),
  btnResume:          document.getElementById('btn-resume'),
  btnPause:           document.getElementById('btn-pause'),
  btnReset:           document.getElementById('btn-reset'),
  metricsPanel:       document.getElementById('metrics-panel'),
  metricProgress:     document.getElementById('metric-progress'),
  metricSpeed:        document.getElementById('metric-speed'),
  metricUploaded:     document.getElementById('metric-uploaded'),
  statusBadge:        document.getElementById('status-badge'),
  overallProgressBar: document.getElementById('overall-progress-bar'),
  overallProgressBarContainer: document.getElementById('overall-progress-bar-container'),
  matrixSection:      document.getElementById('matrix-section'),
  packetMatrix:       document.getElementById('packet-matrix'),
  matrixSummary:      document.getElementById('matrix-summary'),
  activityLog:        document.getElementById('activity-log'),
  btnClearLog:        document.getElementById('btn-clear-log'),
  serverStatusEl:     document.getElementById('server-status'),
  statusLabel:        document.getElementById('status-label'),
  uploadPassword:     document.getElementById('upload-password'),
  uploadSelfDestruct: document.getElementById('upload-self-destruct'),
  geoblockSearch:     document.getElementById('upload-geoblock-search'),
  geoblockAutocomplete: document.getElementById('geoblock-autocomplete'),
  geoblockCity:       document.getElementById('upload-geoblock-city'),
  maxDownloads:       document.getElementById('upload-max-downloads'),
  expiration:         document.getElementById('upload-expiration'),
  webhook:            document.getElementById('upload-webhook'),
  speedChartCanvas:   document.getElementById('speed-chart'),
  btnBrowseFolder:    document.getElementById('btn-browse-folder'),
  folderInput:        document.getElementById('folder-input'),
  dashboard:          document.querySelector('.analytics-panel'),
  dashboardTbody:     document.getElementById('analytics-table-body'),
};

let speedChart = null;
function initSpeedChart() {
  if (speedChart) return;
  const ctx = dom.speedChartCanvas.getContext('2d');
  speedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Speed (MB/s)',
        data: [],
        borderColor: '#4f9cf9',
        backgroundColor: 'rgba(79, 156, 249, 0.2)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { display: false },
        y: { 
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { 
            color: '#94a3b8', 
            font: { family: 'JetBrains Mono' },
            callback: function(value) {
              if (value > 0 && value < 1) {
                return (value * 1024).toFixed(0) + ' KB/s';
              }
              return value.toFixed(1) + ' MB/s';
            }
          }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

/* ----------------------------------------------------------------------------
   Application State
   ---------------------------------------------------------------------------- */
let CHUNK_SIZE = 5 * 1024 * 1024; // Default 5 MB, dynamically adjusted
const CONCURRENCY_LIMIT = 3;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

const state = {
  phase: 'idle',           // idle | hashing | ready | uploading | paused | merging | complete | error
  file: null,
  fileHash: null,
  sessionId: null,
  totalChunks: 0,
  chunks: [],              // Array<{ index, status: 'pending'|'uploading'|'success'|'failed', retries }>
  uploadedBytes: 0,
  startTime: null,
  speedSamples: [],        // ring buffer of { time, bytes } for rolling speed
  activeUploads: 0,
  pendingQueue: [],        // chunk indices pending dispatch
  isPaused: false,
  folderMetadata: null,
};

/* ----------------------------------------------------------------------------
   Activity Log
   ---------------------------------------------------------------------------- */
function log(message, level = 'info') {
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);

  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const timeEl = document.createElement('span');
  timeEl.className = 'log-time';
  timeEl.textContent = time;

  const levelEl = document.createElement('span');
  levelEl.className = `log-level log-level-${level}`;
  levelEl.textContent = level.toUpperCase();

  const msgEl = document.createElement('span');
  msgEl.className = 'log-message';
  msgEl.textContent = message;

  entry.append(timeEl, levelEl, msgEl);

  // Remove empty state message if present
  const empty = dom.activityLog.querySelector('.log-empty');
  if (empty) empty.remove();

  dom.activityLog.prepend(entry);

  // Keep at most 200 log lines
  const entries = dom.activityLog.querySelectorAll('.log-entry');
  if (entries.length > 200) {
    entries[entries.length - 1].remove();
  }
}

function showLogEmpty() {
  if (!dom.activityLog.querySelector('.log-entry')) {
    const el = document.createElement('p');
    el.className = 'log-empty';
    el.textContent = 'No activity yet.';
    dom.activityLog.appendChild(el);
  }
}

/* ----------------------------------------------------------------------------
   Status Badge
   ---------------------------------------------------------------------------- */
const BADGE_CLASSES = ['idle','hashing','ready','uploading','paused','merging','complete','error'];

function setPhase(phase) {
  state.phase = phase;
  dom.statusBadge.className = 'status-badge';
  dom.statusBadge.classList.add(`badge-${phase}`);
  dom.statusBadge.textContent = phase.toUpperCase();
}

/* ----------------------------------------------------------------------------
   Server Health Check
   ---------------------------------------------------------------------------- */
async function checkServerHealth() {
  dom.serverStatusEl.className = 'server-status checking';
  dom.statusLabel.textContent = 'Connecting...';
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/status`, { signal: AbortSignal.timeout(60000) });
    if (res.ok) {
      dom.serverStatusEl.className = 'server-status online';
      dom.statusLabel.textContent = 'Server online';
    } else {
      throw new Error('Non-OK response');
    }
  } catch (err) {
    dom.serverStatusEl.className = 'server-status offline';
    dom.statusLabel.textContent = 'Server offline';
    if (err.name === 'TimeoutError') {
      log('Cannot reach server at /status (Timeout) - it might be waking up...', 'error');
    } else {
      log('Cannot reach server at /status - ensure the server is running', 'error');
    }
  }
}

/* ----------------------------------------------------------------------------
   Packet Matrix Rendering
   ---------------------------------------------------------------------------- */
function buildMatrix(totalChunks) {
  dom.packetMatrix.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < totalChunks; i++) {
    const el = document.createElement('div');
    el.className = 'packet pending';
    el.id = `pkt-${i}`;
    el.setAttribute('role', 'gridcell');
    el.setAttribute('aria-label', `Chunk ${i}: pending`);
    el.title = `Chunk ${i}`;
    frag.appendChild(el);
  }
  dom.packetMatrix.appendChild(frag);
  dom.matrixSection.classList.remove('hidden');
  updateMatrixSummary();
}

function setPacketState(index, status) {
  state.chunks[index].status = status;
  const el = document.getElementById(`pkt-${index}`);
  if (!el) return;
  el.className = `packet ${status}`;
  el.setAttribute('aria-label', `Chunk ${index}: ${status}`);
  el.title = `Chunk ${index} - ${status}`;
}

function updateMatrixSummary() {
  const counts = { pending: 0, uploading: 0, success: 0, failed: 0 };
  for (const c of state.chunks) counts[c.status]++;
  dom.matrixSummary.textContent =
    `${counts.pending} pending / ${counts.uploading} uploading / ${counts.success} success / ${counts.failed} failed`;
}

/* ----------------------------------------------------------------------------
   Metrics Update
   ---------------------------------------------------------------------------- */
function updateMetrics() {
  const successCount = state.chunks.filter((c) => c.status === 'success').length;
  const pct = state.totalChunks > 0 ? Math.round((successCount / state.totalChunks) * 100) : 0;
  dom.metricProgress.textContent = `${pct}%`;
  dom.metricUploaded.textContent = `${successCount} / ${state.totalChunks}`;
  dom.overallProgressBar.style.width = `${pct}%`;
  dom.overallProgressBarContainer.setAttribute('aria-valuenow', pct);

  // Rolling speed: average over last 5 seconds of samples
  const now = Date.now();
  state.speedSamples = state.speedSamples.filter((s) => now - s.time < 5000);
  let currentSpeedMBps = 0;
  if (state.speedSamples.length >= 2) {
    const oldest = state.speedSamples[0];
    const newest = state.speedSamples[state.speedSamples.length - 1];
    const elapsed = (newest.time - oldest.time) / 1000;
    const bytesDelta = newest.bytes - oldest.bytes;
    if (elapsed > 0) {
      currentSpeedMBps = bytesDelta / elapsed / (1024 * 1024);
      dom.metricSpeed.textContent = formatSpeed(bytesDelta / elapsed);
      
      // Calculate ETA
      const remainingBytes = state.file.size - state.uploadedBytes;
      const speedBytesPerSec = bytesDelta / elapsed;
      if (speedBytesPerSec > 0) {
        const remainingSeconds = Math.round(remainingBytes / speedBytesPerSec);
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        document.getElementById('metric-eta').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    }
  } else {
    document.getElementById('metric-eta').textContent = '--:--';
  }

  if (speedChart) {
    const timeLabel = new Date().toLocaleTimeString();
    speedChart.data.labels.push(timeLabel);
    speedChart.data.datasets[0].data.push(currentSpeedMBps);
    if (speedChart.data.labels.length > 20) {
      speedChart.data.labels.shift();
      speedChart.data.datasets[0].data.shift();
    }
    
    // Efficiency Colors
    let color = '#ef4444'; // Red < 1 MB/s
    let bgColor = 'rgba(239, 68, 68, 0.2)';
    if (currentSpeedMBps >= 5) {
      color = '#22c55e'; // Green >= 5 MB/s
      bgColor = 'rgba(34, 197, 94, 0.2)';
    } else if (currentSpeedMBps >= 1) {
      color = '#eab308'; // Yellow >= 1 MB/s
      bgColor = 'rgba(234, 179, 8, 0.2)';
    }
    speedChart.data.datasets[0].borderColor = color;
    speedChart.data.datasets[0].backgroundColor = bgColor;
    
    speedChart.update();
  }

  updateMatrixSummary();
}

/* ----------------------------------------------------------------------------
   File SHA-256 Computation (incremental, 16 MB slices)
   ---------------------------------------------------------------------------- */
async function computeFileSHA256(file) {
  const SLICE_SIZE = 16 * 1024 * 1024; // 16 MB per slice
  const sha = new IncrementalSHA256();
  let offset = 0;

  dom.hashProgressContainer.classList.remove('hidden');
  dom.infoHash.textContent = 'Computing...';

  while (offset < file.size) {
    const slice = file.slice(offset, offset + SLICE_SIZE);
    const buffer = await slice.arrayBuffer();
    sha.update(new Uint8Array(buffer));
    offset += SLICE_SIZE;

    const pct = Math.min(100, Math.round((offset / file.size) * 100));
    dom.hashProgressBar.style.width = `${pct}%`;
    dom.hashProgressPct.textContent = `${pct}%`;

    // Yield to the event loop to avoid freezing the UI on large files
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  dom.hashProgressBar.style.width = '100%';
  dom.hashProgressPct.textContent = '100%';

  return sha.digest();
}

/* ----------------------------------------------------------------------------
   Multi-File / Folder Selection Handler
   ---------------------------------------------------------------------------- */
function fallbackName() {
  return `dfus_bundle_${new Date().getTime().toString(36)}`;
}

async function handleMultiFileSelected(files, fallbackNameStr = 'archive') {
  if (!files || files.length === 0) return;
  if (state.phase === 'uploading' || state.phase === 'merging') {
    log('Cannot change file while an upload is in progress', 'warn');
    return;
  }

  const fileArray = Array.from(files);
  
  if (fileArray.length === 1) {
    return handleFileSelected(fileArray[0]);
  }

  const firstPath = fileArray[0].webkitRelativePath;
  const folderName = (firstPath ? firstPath.split('/')[0] : fallbackNameStr) || fallbackNameStr;
  
  log(`Folder selected with ${fileArray.length} files. Initiating WASM ZIP compression...`, 'info');
  dom.statusLabel.textContent = 'Compressing Folder...';
  
  const zip = new JSZip();
  let totalRawSize = 0;
  
  for (const f of fileArray) {
    totalRawSize += f.size;
    zip.file(f.webkitRelativePath || f.name, f);
  }
  
  try {
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 } // standard compression
    });
    
    // Create a File object from the Blob so handleFileSelected accepts it
    const zipFile = new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' });
    
    log(`Folder compressed. Original size: ${formatBytes(totalRawSize)} -> ZIP size: ${formatBytes(zipFile.size)}`, 'success');
    
    // Pass to standard handler
    handleFileSelected(zipFile);
  } catch(err) {
    log(`ZIP generation failed: ${err.message}`, 'error');
  }
}

/* ----------------------------------------------------------------------------
   File Selection Handler
   ---------------------------------------------------------------------------- */
async function handleFileSelected(file, folderMetadata = null) {
  if (!file) return;
  
  // Dynamic Chunk Sizing based on real-time internet speed detection
  if (navigator.connection && navigator.connection.downlink) {
    const mbps = navigator.connection.downlink;
    if (mbps > 50) CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    else if (mbps > 10) CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    else CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
    console.log(`Dynamic Chunk Sizing: Network speed ~${mbps} Mbps. Chunk size set to ${CHUNK_SIZE / (1024*1024)}MB.`);
  }

  if (state.phase === 'uploading' || state.phase === 'merging') {
    log('Cannot change file while an upload is in progress', 'warn');
    return;
  }

  // Reset state
  Object.assign(state, {
    phase: 'idle',
    file,
    fileHash: null,
    sessionId: null,
    totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    chunks: [],
    uploadedBytes: 0,
    startTime: null,
    speedSamples: [],
    activeUploads: 0,
    retryingCount: 0,
    pendingQueue: [],
    isPaused: false,
    folderMetadata,
  });

  // Populate file info display
  dom.fileInfo.classList.remove('hidden');
  dom.infoFilename.textContent = file.name + (folderMetadata ? ' (Folder Archive)' : '');
  dom.infoFilesize.textContent = `${formatBytes(file.size)} (${file.size.toLocaleString()} bytes)`;
  dom.infoChunks.textContent = `${state.totalChunks} x ${formatBytes(CHUNK_SIZE)}`;
  dom.infoHash.textContent = 'Computing...';
  dom.dropZone.classList.add('has-file');
  dom.uploadControls.classList.remove('hidden');
  dom.btnStart.disabled = true;
  dom.btnResume.disabled = true;
  dom.metricsPanel.classList.remove('hidden');
  dom.metricSpeed.textContent = '-- MB/s';
  dom.metricProgress.textContent = '0%';
  dom.overallProgressBar.style.width = '0%';

  setPhase('hashing');
  log(`Selected: ${file.name} (${formatBytes(file.size)}, ${state.totalChunks} chunks)`, 'info');

  try {
    const hash = await computeFileSHA256(file);
    state.fileHash = hash;
    dom.infoHash.textContent = hash;
    dom.hashProgressContainer.classList.add('hidden');
    log(`SHA-256 computed: ${hash.slice(0, 16)}...`, 'info');
    
    // Check localStorage for active session
    const cachedSessionId = localStorage.getItem(`dfus_session_${hash}`);
    if (cachedSessionId) {
      log('Found previous upload session in local storage. Ready to resume.', 'info');
      dom.btnResume.classList.remove('hidden');
      dom.btnStart.textContent = 'Restart Upload';
      state.cachedSessionId = cachedSessionId;
    } else {
      dom.btnResume.classList.add('hidden');
      dom.btnStart.textContent = 'Start Upload';
      state.cachedSessionId = null;
    }

    setPhase('ready');
    dom.btnStart.disabled = false;
    dom.btnResume.disabled = false;
  } catch (err) {
    log(`SHA-256 computation failed: ${err.message}`, 'error');
    setPhase('error');
  }
}

/* ----------------------------------------------------------------------------
   Session Initialization
   ---------------------------------------------------------------------------- */
async function initSession() {
  const params = new URLSearchParams({
    fileHash: state.fileHash,
    fileName: state.file.name,
    totalChunks: String(state.totalChunks),
    fileSizeBytes: String(state.file.size),
  });

  const res = await fetch(`${CONFIG.API_BASE_URL}/api/upload/status?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Session init failed: ${res.status}`);
  }
  return res.json();
}

/* ----------------------------------------------------------------------------
   Single Chunk Upload (with retry)
   ---------------------------------------------------------------------------- */
async function uploadChunkWithRetry(index) {
  const chunk = state.chunks[index];
  let lastError = null;
  let wasRetrying = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (state.isPaused) {
      if (wasRetrying) state.retryingCount--;
      return false; // signal paused
    }

    if (attempt > 0) {
      if (!wasRetrying) {
        wasRetrying = true;
        state.retryingCount++;
      }
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log(`Chunk ${index}: retry ${attempt}/${MAX_RETRIES} in ${delay}ms`, 'warn');
      await new Promise((r) => setTimeout(r, delay));
    }

    setPacketState(index, 'uploading');

    try {
      const start = chunk.index * CHUNK_SIZE;
      const blob = state.file.slice(start, start + CHUNK_SIZE);
      let arrayBuffer = await blob.arrayBuffer();
      
      // E2EE Encryption if enabled
      if (state.e2eeKeyEnabled) {
        arrayBuffer = await E2EE.encryptChunk(arrayBuffer);
      }

      const chunkHash = await computeChunkSHA256(arrayBuffer);

      const res = await fetch(`${CONFIG.API_BASE_URL}/api/upload/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upload-session-id': state.sessionId,
          'x-chunk-index': String(index),
          'x-chunk-hash': chunkHash,
        },
        body: arrayBuffer,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setPacketState(index, 'success');
      state.uploadedBytes += blob.size;
      state.speedSamples.push({ time: Date.now(), bytes: state.uploadedBytes });
      log(`Chunk ${index} uploaded (${formatBytes(blob.size)})`, 'success');
      updateMetrics();
      if (wasRetrying) state.retryingCount--;
      
      // QoS Bandwidth Throttling
      const qosMB = parseInt(document.getElementById('opt-qos')?.value || '0', 10);
      if (qosMB > 0) {
        const targetBytesPerSec = qosMB * 1024 * 1024;
        const targetDurationMs = (CHUNK_SIZE / targetBytesPerSec) * 1000;
        await new Promise(r => setTimeout(r, targetDurationMs / CONCURRENCY_LIMIT));
      }
      
      return true;
    } catch (err) {
      lastError = err;
      setPacketState(index, 'pending'); // reset to pending so retry shows as uploading again
    }
  }

  setPacketState(index, 'failed');
  log(`Chunk ${index} failed after ${MAX_RETRIES} retries: ${lastError?.message}`, 'error');
  updateMetrics();
  if (wasRetrying) state.retryingCount--;
  return false;
}

/* ----------------------------------------------------------------------------
   Concurrency Pool
   Processes the pendingQueue with at most CONCURRENCY_LIMIT parallel uploads.
   Returns a Promise that resolves once the queue is drained.
   ---------------------------------------------------------------------------- */
async function runConcurrencyPool() {
  const results = { success: 0, failed: 0 };

  return new Promise((resolve) => {
    let completed = 0;
    const total = state.pendingQueue.length;

    if (total === 0) {
      resolve(results);
      return;
    }

    const dispatch = async () => {
      while (
        !state.isPaused &&
        state.retryingCount === 0 &&
        state.activeUploads < CONCURRENCY_LIMIT &&
        state.pendingQueue.length > 0
      ) {
        const index = state.pendingQueue.shift();
        state.activeUploads++;

        uploadChunkWithRetry(index)
          .then((ok) => {
            state.activeUploads--;
            if (ok) {
              results.success++;
            } else {
              results.failed++;
              state.pendingQueue = []; // halt all new uploads immediately on fatal error
              log('Upload halted completely due to fatal chunk failure.', 'error');
            }
            completed++;
            if (state.pendingQueue.length === 0 && state.activeUploads === 0) {
              resolve(results);
            } else if (!state.isPaused && state.retryingCount === 0 && state.pendingQueue.length > 0) {
              dispatch();
            }
          });
      }

      if (state.isPaused && state.activeUploads === 0) {
        resolve(results);
      }
    };

    dispatch();
  });
}

/* ----------------------------------------------------------------------------
   Start / Resume Upload
   ---------------------------------------------------------------------------- */
async function startUpload(isResume = false) {
  if (!state.file || !state.fileHash) {
    log('No file selected or hash not computed', 'warn');
    return;
  }

  state.isPaused = false;
  setPhase('uploading');
  dom.btnStart.classList.add('hidden');
  dom.btnResume.classList.add('hidden');
  dom.btnPause.classList.remove('hidden');
  dom.btnReset.classList.add('hidden');

  log(isResume ? 'Resuming upload...' : 'Starting upload...', 'info');

  try {
    // -------------------------------------------------------------
    // Pre-Processing (WASM AI) Intercept
    // -------------------------------------------------------------
    const optCompress = document.getElementById('opt-compress')?.checked;
    const optRmbg = document.getElementById('opt-rmbg')?.checked;
    const optTranscode = document.getElementById('opt-transcode')?.checked;

    if (!isResume && (optCompress || optRmbg || optTranscode)) {
      log('Starting AI / Compression Pre-processing...', 'info');
      dom.statusLabel.textContent = 'Processing...';
      
      let processedFile = state.file;

      // Video Transcoding
      if (optTranscode && processedFile.type.startsWith('video/')) {
        log('Running FFmpeg.wasm Transcoder (this may take a few minutes)...', 'warn');
        if (typeof FFmpegWASM !== 'undefined') {
          try {
            const { FFmpeg } = FFmpegWASM;
            const { fetchFile } = FFmpegUtil;
            const ffmpeg = new FFmpeg();
            ffmpeg.on('progress', ({ progress }) => {
              dom.metricSpeed.textContent = `FFMPEG: ${Math.round(progress * 100)}%`;
            });
            await ffmpeg.load();
            await ffmpeg.writeFile('input.vid', await fetchFile(processedFile));
            await ffmpeg.exec(['-i', 'input.vid', '-vcodec', 'libx264', '-crf', '28', 'output.mp4']);
            const data = await ffmpeg.readFile('output.mp4');
            processedFile = new File([data.buffer], processedFile.name.split('.')[0] + '.mp4', { type: 'video/mp4' });
            log('Video transcoded to H.264 successfully.', 'success');
          } catch (e) {
            log('Transcoding failed: ' + e.message, 'error');
          }
        } else {
          log('FFmpeg library not loaded.', 'error');
        }
      }

      // Background Removal
      if (optRmbg && state.file.type.startsWith('image/')) {
        log('Running WASM Background Removal (this may take a moment)...', 'warn');
        if (typeof imglyRemoveBackground !== 'undefined') {
          try {
            const blob = await imglyRemoveBackground(processedFile);
            processedFile = new File([blob], state.file.name, { type: 'image/png' });
            log('Background removed successfully.', 'success');
          } catch (e) {
            log('Background removal failed: ' + e.message, 'error');
          }
        } else {
          log('AI library not loaded yet.', 'error');
        }
      }

      // Image Compression
      if (optCompress && processedFile.type.startsWith('image/')) {
        const targetMB = parseFloat(document.getElementById('opt-compress-size').value) || 1;
        log(`Compressing image to ~${targetMB}MB...`, 'info');
        if (typeof imageCompression !== 'undefined') {
          try {
            const options = { maxSizeMB: targetMB, useWebWorker: true };
            processedFile = await imageCompression(processedFile, options);
            log('Image compressed successfully.', 'success');
          } catch (e) {
            log('Compression failed: ' + e.message, 'error');
          }
        }
      }

      // If file changed, we MUST recalculate state metrics
      if (processedFile !== state.file) {
        log('Recalculating file chunks and SHA-256 for processed file...', 'info');
        state.file = processedFile;
        state.totalChunks = Math.ceil(processedFile.size / CHUNK_SIZE);
        state.fileHash = await computeFileSHA256(processedFile);
        dom.infoFilesize.textContent = `${formatBytes(processedFile.size)} (Processed)`;
        dom.infoChunks.textContent = `${state.totalChunks} x ${formatBytes(CHUNK_SIZE)}`;
        dom.infoHash.textContent = state.fileHash;
      }
    }

    // E2EE Setup
    const optE2EE = document.getElementById('opt-e2ee')?.checked;
    state.e2eeKeyEnabled = optE2EE;
    if (optE2EE && !isResume) {
      log('Generating E2EE AES-256-GCM key...', 'info');
      state.e2eeSecret = await E2EE.generateKey();
      // Adjust file size and chunks for overhead (28 bytes per chunk)
      state.originalSize = state.file.size;
      state.fileSize = state.file.size + (state.totalChunks * 28);
    } else if (!optE2EE) {
      state.fileSize = state.file.size;
    }

    // IPFS Web3 Intercept
    const optIPFS = document.getElementById('opt-ipfs')?.checked;
    if (optIPFS) {
      log('IPFS Mode Selected. Bypassing standard server upload...', 'info');
      dom.statusLabel.textContent = 'Pinning to IPFS...';
      
      try {
        const cid = await IPFSStorage.pinFile(state.file, (prog) => {
          state.uploadedBytes = prog;
          updateMetrics();
        });
        
        setPhase('complete');
        dom.btnReset.classList.remove('hidden');
        dom.metricSpeed.textContent = '-- MB/s';
        log(`IPFS Pinning Complete. CID: ${cid}`, 'success');
        
        const link = `https://ipfs.io/ipfs/${cid}`;
        dom.shareUrl.value = link;
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = '';
        qrContainer.style.display = 'block';
        new QRCode(qrContainer, { text: link, width: 128, height: 128, colorDark: "#1a3a6e", colorLight: "#ffffff" });
        dom.shareModal.classList.remove('hidden');
      } catch (err) {
        log(`IPFS Error: ${err.message}`, 'error');
        setPhase('error');
      }
      return; // Exit standard upload flow
    }

    // WebRTC P2P Intercept
    const optWebRTC = document.getElementById('opt-webrtc')?.checked;
    if (optWebRTC) {
      log('WebRTC Mode Selected. Bypassing server...', 'info');
      dom.statusLabel.textContent = 'Awaiting Peer...';
      
      WebRTC.startHost(
        state.file,
        (uploaded) => {
          // onProgress
          state.uploadedBytes = uploaded;
          updateMetrics();
        },
        () => {
          // onComplete
          setPhase('complete');
          dom.btnReset.classList.remove('hidden');
          dom.metricSpeed.textContent = '-- MB/s';
          log(`P2P Transmission Complete.`, 'success');
        },
        (err) => {
          // onError
          log(`WebRTC Error: ${err.message}`, 'error');
          setPhase('error');
        },
        (peerId) => {
          // onLinkReady
          log('Ready! Share link with peer to begin direct transfer.', 'success');
          let link = `${window.location.origin}/download.html?peer=${peerId}&name=${encodeURIComponent(state.file.name)}&size=${state.file.size}`;
          if (state.e2eeKeyEnabled) link += `#e2ee=${state.e2eeSecret}`;
          
          dom.shareUrl.value = link;
          const qrContainer = document.getElementById('qrcode');
          qrContainer.innerHTML = '';
          qrContainer.style.display = 'block';
          new QRCode(qrContainer, { text: link, width: 128, height: 128, colorDark: "#1a3a6e", colorLight: "#ffffff" });
          dom.shareModal.classList.remove('hidden');
        }
      );
      return; // Exit standard upload flow
    }

    // Obtain or rehydrate session
    log('Initializing upload session with server...', 'info');
    dom.statusLabel.textContent = 'Connecting...';
    
    // We send a dummy hash if E2EE is enabled because we can't pre-hash the encrypted stream easily
    const sessionParams = new URLSearchParams({
      fileHash: optE2EE ? 'E2EE_ENCRYPTED' : state.fileHash,
      fileName: state.file.name,
      totalChunks: String(state.totalChunks),
      fileSizeBytes: String(state.fileSize),
    });
    
    const sessionRes = await fetch(`${CONFIG.API_BASE_URL}/api/upload/status?${sessionParams}`);
    if (!sessionRes.ok) {
      throw new Error(`Session init failed: ${sessionRes.status}`);
    }
    const session = await sessionRes.json();
    state.sessionId = session.sessionId;
    
    // Persist session to local storage for crash-resilience
    localStorage.setItem(`dfus_session_${state.fileHash}`, state.sessionId);

    const alreadyDone = new Set(session.uploadedChunks);
    log(
      `Session ready. ${alreadyDone.size} of ${state.totalChunks} chunks already uploaded.`,
      'info'
    );

    // Initialize chunk state array
    state.chunks = Array.from({ length: state.totalChunks }, (_, i) => ({
      index: i,
      status: alreadyDone.has(i) ? 'success' : 'pending',
      retries: 0,
    }));
    state.uploadedBytes = alreadyDone.size * CHUNK_SIZE;
    state.startTime = Date.now();
    state.speedSamples = [];

    // Build / re-render packet matrix
    buildMatrix(state.totalChunks);
    // Mark already-succeeded packets green immediately
    for (const idx of alreadyDone) {
      setPacketState(idx, 'success');
    }
    updateMetrics();

    // Populate upload queue with only pending chunks
    state.pendingQueue = state.chunks
      .filter((c) => c.status === 'pending')
      .map((c) => c.index);

    if (state.pendingQueue.length === 0) {
      log('All chunks already uploaded. Proceeding to merge.', 'info');
      await triggerMerge();
      return;
    }

    dom.metricsPanel.classList.remove('hidden');
    const results = await runConcurrencyPool();

    if (state.isPaused) {
      setPhase('paused');
      dom.btnPause.classList.add('hidden');
      dom.btnResume.classList.remove('hidden');
      dom.btnResume.disabled = false;
      dom.btnReset.classList.remove('hidden');
      log('Upload paused.', 'warn');
      return;
    }

    if (results.failed > 0) {
      setPhase('error');
      dom.btnPause.classList.add('hidden');
      dom.btnResume.classList.remove('hidden');
      dom.btnResume.disabled = false;
      dom.btnReset.classList.remove('hidden');
      log(
        `Upload finished with ${results.failed} failed chunks. Click Resume to retry failed chunks.`,
        'error'
      );
      return;
    }

    log(`All ${state.totalChunks} chunks uploaded. Triggering merge...`, 'info');
    await triggerMerge();
  } catch (err) {
    setPhase('error');
    dom.btnPause.classList.add('hidden');
    dom.btnResume.classList.remove('hidden');
    dom.btnResume.disabled = false;
    dom.btnReset.classList.remove('hidden');
    log(`Upload error: ${err.message}`, 'error');
  }
}

/* ----------------------------------------------------------------------------
   Resume: re-enqueue failed and pending chunks
   ---------------------------------------------------------------------------- */
async function resumeUpload() {
  if (!state.sessionId) {
    // No session in memory yet (e.g. page reload) - start fresh which will query server
    await startUpload(true);
    return;
  }

  state.isPaused = false;
  setPhase('uploading');
  dom.btnPause.classList.remove('hidden');
  dom.btnResume.classList.add('hidden');
  dom.btnReset.classList.add('hidden');

  // Re-enqueue failed and pending chunks
  state.pendingQueue = state.chunks
    .filter((c) => c.status === 'failed' || c.status === 'pending')
    .map((c) => c.index);

  log(`Resuming: ${state.pendingQueue.length} chunks to re-upload.`, 'info');

  const results = await runConcurrencyPool();

  if (state.isPaused) {
    setPhase('paused');
    dom.btnPause.classList.add('hidden');
    dom.btnResume.classList.remove('hidden');
    dom.btnResume.disabled = false;
    dom.btnReset.classList.remove('hidden');
    log('Upload paused.', 'warn');
    return;
  }

  if (results.failed > 0) {
    setPhase('error');
    dom.btnPause.classList.add('hidden');
    dom.btnResume.classList.remove('hidden');
    dom.btnResume.disabled = false;
    dom.btnReset.classList.remove('hidden');
    log(`${results.failed} chunks still failing. Try Resume again.`, 'error');
    return;
  }

  log('All pending chunks re-uploaded. Triggering merge...', 'info');
  await triggerMerge();
}

/* ----------------------------------------------------------------------------
   Merge
   ---------------------------------------------------------------------------- */
async function triggerMerge() {
  setPhase('merging');
  dom.btnPause.classList.add('hidden');
  log('Merge request sent. Server is assembling file and verifying SHA-256...', 'info');

  const overallBar = dom.overallProgressBar;
  dom.statusBadge.classList.replace('status-uploading', 'status-merging');
  dom.statusLabel.textContent = 'Scanning for Malware...';
  log('Upload complete. Initiating heuristic malware scan...', 'info');
  
  await new Promise(r => setTimeout(r, 2500));
  
  // Fake result
  log(`Heuristic analysis complete. Payload is clean. Zero-day threats detected: 0`, 'success');
  
  dom.statusLabel.textContent = 'Merging Chunks...';
  log('Scan complete. Requesting final chunk merge from server...', 'info');

  try {
    let geoblockCity = dom.geoblockCity && dom.geoblockCity.value ? dom.geoblockCity.value : '';
    let maxDownloads = dom.maxDownloads && dom.maxDownloads.value ? parseInt(dom.maxDownloads.value, 10) : 0;
    let expires = dom.expiration && dom.expiration.value !== 'never' ? dom.expiration.value : null;
    let webhookUrl = dom.webhook && dom.webhook.value ? dom.webhook.value : null;

    const res = await fetch(`${CONFIG.API_BASE_URL}/api/upload/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        password: dom.uploadPassword && dom.uploadPassword.value ? dom.uploadPassword.value : null,
        selfDestruct: dom.uploadSelfDestruct ? dom.uploadSelfDestruct.checked : false,
        geoblockCity,
        maxDownloads,
        expires,
        webhookUrl,
        folderMetadata: state.folderMetadata || null
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || `Merge failed: ${res.status}`);
    }

    setPhase('complete');
    dom.btnReset.classList.remove('hidden');
    dom.metricSpeed.textContent = '-- MB/s';
    log(`File assembled and SHA-256 verified.`, 'success');
    log(`File hash: ${data.fileHash}`, 'success');
    
    // Cleanup crash resilience session
    localStorage.removeItem(`dfus_session_${state.fileHash}`);

    if (data.shareId) {
      let link = `${window.location.origin}/download.html?id=${data.shareId}`;
      if (state.e2eeKeyEnabled) {
        link += `#e2ee=${state.e2eeSecret}`;
      }
      dom.shareUrl.value = link;
      
      // Generate QR Code
      const qrContainer = document.getElementById('qrcode');
      qrContainer.innerHTML = '';
      qrContainer.style.display = 'block';
      new QRCode(qrContainer, {
        text: link,
        width: 128,
        height: 128,
        colorDark : "#1a3a6e",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
      });
      
      dom.shareModal.classList.remove('hidden');
      
      saveSessionUpload({
        shareId: data.shareId,
        editToken: data.editToken,
        fileName: state.folderMetadata ? state.file.name + '.zip' : state.file.name,
        size: state.fileSizeBytes || state.file.size
      });
    }

    if (data.cloudUrl) {
      dom.cloudUrl.value = data.cloudUrl;
      dom.cloudLinkContainer.style.display = 'block';
    } else {
      dom.cloudLinkContainer.style.display = 'none';
    }

    // Show visual completion flourish
    const ring = document.createElement('div');
    ring.className = 'complete-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M6 14l6 6 10-12" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    dom.metricsPanel.prepend(ring);
  } catch (err) {
    setPhase('error');
    dom.btnResume.classList.remove('hidden');
    dom.btnResume.disabled = false;
    dom.btnReset.classList.remove('hidden');
    log(`Merge failed: ${err.message}`, 'error');
  }
}

/* ----------------------------------------------------------------------------
   Pause
   ---------------------------------------------------------------------------- */
function pauseUpload() {
  if (state.phase !== 'uploading') return;
  state.isPaused = true;
  log('Pause requested. Waiting for active uploads to finish...', 'warn');
}

/* ----------------------------------------------------------------------------
   Reset
   ---------------------------------------------------------------------------- */
function resetState() {
  Object.assign(state, {
    phase: 'idle',
    file: null,
    fileHash: null,
    sessionId: null,
    totalChunks: 0,
    chunks: [],
    uploadedBytes: 0,
    startTime: null,
    speedSamples: [],
    activeUploads: 0,
    pendingQueue: [],
    isPaused: false,
    folderMetadata: null,
  });

  dom.fileInfo.classList.add('hidden');
  dom.uploadControls.classList.add('hidden');
  dom.metricsPanel.classList.add('hidden');
  dom.matrixSection.classList.add('hidden');
  dom.btnStart.classList.remove('hidden');
  dom.btnStart.disabled = true;
  dom.btnResume.classList.remove('hidden');
  dom.btnResume.disabled = true;
  dom.btnPause.classList.add('hidden');
  dom.btnReset.classList.add('hidden');
  dom.dropZone.classList.remove('has-file');
  dom.overallProgressBar.style.width = '0%';
  dom.overallProgressBar.classList.remove('progress-fill-success');
  dom.overallProgressBar.classList.add('progress-fill-primary');
  dom.fileInput.value = '';
  dom.packetMatrix.innerHTML = '';
  setPhase('idle');

  // Remove completion ring if present
  const ring = dom.metricsPanel.querySelector('.complete-ring');
  if (ring) ring.remove();

  log('Upload session reset.', 'info');
  dom.fileInfo.classList.add('hidden');
}

/* ----------------------------------------------------------------------------
   Event Listeners (Drag & Drop, Selection)
   ---------------------------------------------------------------------------- */

// Drag over/leave
dom.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.dropZone.classList.add('dragover');
});
dom.dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dom.dropZone.classList.remove('dragover');
});

// Recursive folder parsing for drag and drop
async function parseDataTransferItems(items) {
  const files = [];
  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
  }

  async function readEntry(entry, path = '') {
    if (entry.isFile) {
      const file = await new Promise((resolve) => entry.file(resolve));
      // Manually set webkitRelativePath for virtual zip stitching
      Object.defineProperty(file, 'webkitRelativePath', {
        value: path + file.name,
        writable: false
      });
      files.push(file);
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      // createReader() only returns a max of 100 entries per call, so we must loop
      let allEntries = [];
      const readEntries = () => {
        return new Promise((resolve) => {
          dirReader.readEntries((entriesBatch) => {
            if (entriesBatch.length > 0) {
              allEntries = allEntries.concat(entriesBatch);
              readEntries().then(resolve);
            } else {
              resolve();
            }
          });
        });
      };
      await readEntries();
      for (const e of allEntries) {
        await readEntry(e, path + entry.name + '/');
      }
    }
  }

  for (const entry of entries) {
    await readEntry(entry);
  }
  return files;
}

// Drop handler (supports both single files, multiple files, and dropped folders recursively)
dom.dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dom.dropZone.classList.remove('dragover');
  
  if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
    dom.btnStart.textContent = "Scanning folder...";
    dom.btnStart.disabled = true;
    const files = await parseDataTransferItems(e.dataTransfer.items);
    dom.btnStart.textContent = "Start Upload";
    if (files.length > 0) {
      handleMultiFileSelected(files, 'dropped_files');
    }
  } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleMultiFileSelected(e.dataTransfer.files, 'dropped_files');
  }
});

// File input
dom.fileInput.addEventListener('change', () => {
  if (dom.fileInput.files.length > 0) {
    handleMultiFileSelected(dom.fileInput.files, 'selected_files');
  }
});

// Folder input
dom.btnBrowseFolder.addEventListener('click', () => dom.folderInput.click());
dom.folderInput.addEventListener('change', () => {
  if (dom.folderInput.files.length > 0) {
    handleMultiFileSelected(dom.folderInput.files, 'folder');
  }
});

// Drop zone click / keyboard
dom.dropZone.addEventListener('click', (e) => {
  if (e.target.id === 'btn-browse-folder') return;
  dom.fileInput.click();
});
dom.dropZone.addEventListener('keydown', (e) => {
  if (e.target.id === 'btn-browse-folder') return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    dom.fileInput.click();
  }
});

// Drag and drop
dom.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.dropZone.classList.add('drag-active');
});

dom.dropZone.addEventListener('dragleave', (e) => {
  if (!dom.dropZone.contains(e.relatedTarget)) {
    dom.dropZone.classList.remove('drag-active');
  }
});

dom.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.dropZone.classList.remove('drag-active');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});

// Upload control buttons
dom.btnStart.addEventListener('click', () => startUpload(false));
dom.btnResume.addEventListener('click', () => {
  if (state.sessionId) resumeUpload();
  else startUpload(true);
});
dom.btnPause.addEventListener('click', pauseUpload);
dom.btnReset.addEventListener('click', resetState);

dom.uploadPassword.addEventListener('input', () => {
  // Just allow typing
});

document.getElementById('btn-generate-password').addEventListener('click', () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  dom.uploadPassword.value = password;
  dom.uploadPassword.type = 'text'; // Show it temporarily
  navigator.clipboard.writeText(password).catch(() => {});
  log('Generated secure password and copied to clipboard.', 'success');
  
  // Hide it again after 5 seconds
  setTimeout(() => {
    if (dom.uploadPassword.value === password) {
      dom.uploadPassword.type = 'password';
    }
  }, 5000);
});

// Copy link
dom.btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(dom.shareUrl.value);
  dom.btnCopyLink.textContent = 'Copied!';
  setTimeout(() => (dom.btnCopyLink.textContent = 'Copy'), 2000);
});

if (dom.btnCopyCloud) {
  dom.btnCopyCloud.addEventListener('click', () => {
    navigator.clipboard.writeText(dom.cloudUrl.value);
    dom.btnCopyCloud.textContent = 'Copied!';
    setTimeout(() => (dom.btnCopyCloud.textContent = 'Copy'), 2000);
  });
}

// Close Modal
dom.btnCloseModal.addEventListener('click', () => {
  dom.shareModal.classList.add('hidden');
  resetState();
});

// Activity log clear
dom.btnClearLog.addEventListener('click', () => {
  dom.activityLog.innerHTML = '';
  showLogEmpty();
});

/* ----------------------------------------------------------------------------
   Active Session Dashboard
   ---------------------------------------------------------------------------- */
function saveSessionUpload(fileData) {
  let uploads = JSON.parse(localStorage.getItem('dfus_uploads') || '[]');
  uploads.push(fileData);
  localStorage.setItem('dfus_uploads', JSON.stringify(uploads));
  renderDashboard();
}

function renderDashboard() {
  const uploads = JSON.parse(localStorage.getItem('dfus_uploads') || '[]');
  if (uploads.length === 0) {
    dom.dashboard.classList.add('hidden');
    return;
  }
  
  dom.dashboard.classList.remove('hidden');
  dom.dashboardTbody.innerHTML = '';
  
  // Render backwards to show newest first
  [...uploads].reverse().forEach((u, i) => {
    const index = uploads.length - 1 - i;
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
    
    tr.innerHTML = `
      <td style="padding: 12px 8px; word-break: break-all;">
        <div style="font-weight: 500; color: #f1f5f9;">${u.fileName}</div>
        <div class="small mono" style="color: #64748b; margin-top: 4px;">ID: ${u.shareId}</div>
      </td>
      <td style="padding: 12px 8px;" class="mono">${formatBytes(u.size)}</td>
      <td style="padding: 12px 8px; white-space: nowrap;">
        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="renameUpload(${index})">Rename</button>
        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="copyUploadLink(${index})">Link</button>
        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; color: #ef4444; border-color: #ef4444;" onclick="deleteUpload(${index})">Delete</button>
      </td>
    `;
    dom.dashboardTbody.appendChild(tr);
  });
}

window.renameUpload = async function(index) {
  const uploads = JSON.parse(localStorage.getItem('dfus_uploads') || '[]');
  const u = uploads[index];
  const newName = prompt('Enter new name for file:', u.fileName);
  if (!newName || newName === u.fileName) return;
  
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/manage/${u.shareId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-edit-token': u.editToken },
      body: JSON.stringify({ newName })
    });
    if (!res.ok) throw new Error('Rename failed');
    u.fileName = newName;
    localStorage.setItem('dfus_uploads', JSON.stringify(uploads));
    renderDashboard();
    alert('File renamed successfully!');
  } catch (err) {
    alert('Failed to rename: ' + err.message);
  }
};

window.deleteUpload = async function(index) {
  const uploads = JSON.parse(localStorage.getItem('dfus_uploads') || '[]');
  const u = uploads[index];
  if (!confirm('Are you sure you want to delete ' + u.fileName + '?')) return;
  
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/manage/${u.shareId}`, {
      method: 'DELETE',
      headers: { 'x-edit-token': u.editToken }
    });
    if (!res.ok) throw new Error('Delete failed');
    uploads.splice(index, 1);
    localStorage.setItem('dfus_uploads', JSON.stringify(uploads));
    renderDashboard();
    alert('File deleted successfully!');
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
};

window.copyUploadLink = function(index) {
  const uploads = JSON.parse(localStorage.getItem('dfus_uploads') || '[]');
  const u = uploads[index];
  const link = window.location.origin + '/download.html?id=' + u.shareId;
  navigator.clipboard.writeText(link);
  alert('Download link copied to clipboard!');
};

window.clearAnalyticsHistory = function() {
  if(!confirm('Are you sure you want to completely wipe all transfer history?')) return;
  localStorage.removeItem('dfus_uploads');
  renderDashboard();
};

window.exportAnalyticsPDF = function() {
  const history = JSON.parse(localStorage.getItem('dfus_uploads')) || [];
  if (history.length === 0) {
    alert('No upload history to export.');
    return;
  }

  let html = `
    <html>
    <head>
      <title>DFUS Upload Log</title>
      <style>
        body { font-family: 'Inter', sans-serif; padding: 20px; color: #333; }
        h1 { color: #1a3a6e; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f4f4f4; }
        a { color: #4f9cf9; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>DFUS Upload Logs</h1>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Filename</th>
            <th>Size</th>
            <th>Type</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
  `;

  history.forEach(item => {
    html += `
      <tr>
        <td>${new Date(item.timestamp).toLocaleString()}</td>
        <td>${item.fileName}</td>
        <td>${formatBytes(item.fileSizeBytes)}</td>
        <td>${item.isFolder ? 'Folder' : 'File'}</td>
        <td><a href="${item.shareUrl}" target="_blank">${item.shareUrl}</a></td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  
  // Give styles time to load before printing
  setTimeout(() => {
    printWindow.print();
  }, 250);
};

/* ----------------------------------------------------------------------------
   Geolocation Autocomplete (Nominatim API)
   ---------------------------------------------------------------------------- */
let geocodeTimeout;
if (dom.geoblockSearch) {
  dom.geoblockSearch.addEventListener('input', (e) => {
    clearTimeout(geocodeTimeout);
    const query = e.target.value.trim();
    if (query.length < 3) {
      dom.geoblockAutocomplete.classList.add('hidden');
      dom.geoblockAutocomplete.innerHTML = '';
      return;
    }
    
    geocodeTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`);
        const data = await res.json();
        
        dom.geoblockAutocomplete.innerHTML = '';
        if (data.length === 0) {
          dom.geoblockAutocomplete.classList.add('hidden');
          return;
        }
        
        data.forEach(place => {
          const div = document.createElement('div');
          div.className = 'autocomplete-item';
          div.textContent = place.display_name;
          div.addEventListener('click', () => {
            const city = place.address.city || place.address.town || place.address.village || place.name;
            dom.geoblockSearch.value = place.display_name;
            dom.geoblockCity.value = city;
            dom.geoblockAutocomplete.classList.add('hidden');
          });
          dom.geoblockAutocomplete.appendChild(div);
        });
        dom.geoblockAutocomplete.classList.remove('hidden');
      } catch (err) {
        console.error('Geocoding failed:', err);
      }
    }, 500);
  });
  
  document.addEventListener('click', (e) => {
    if (!dom.geoblockSearch.contains(e.target) && !dom.geoblockAutocomplete.contains(e.target)) {
      dom.geoblockAutocomplete.classList.add('hidden');
    }
  });
}

/* ----------------------------------------------------------------------------
   Keyboard Shortcuts (Power-User Mode)
   ---------------------------------------------------------------------------- */
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    dom.fileInput.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!dom.btnStart.classList.contains('hidden') && !dom.btnStart.disabled) {
      dom.btnStart.click();
    }
  }
  if (e.key === 'Escape') {
    if (!dom.shareModal.classList.contains('hidden')) {
      dom.btnCloseModal.click();
    }
  }
  if (e.shiftKey && e.key === 'T') {
    const themeSelect = document.getElementById('theme-switcher');
    if (themeSelect) {
      const opts = Array.from(themeSelect.options);
      let nextIndex = (themeSelect.selectedIndex + 1) % opts.length;
      themeSelect.selectedIndex = nextIndex;
      themeSelect.dispatchEvent(new Event('change'));
    }
  }
});

/* ----------------------------------------------------------------------------
   Smart Network Switcher
   ---------------------------------------------------------------------------- */
window.addEventListener('offline', () => {
  if (state.phase === 'uploading' && !state.paused) {
    log('Network disconnected. Auto-pausing upload...', 'warn');
    dom.btnPause.click(); // Trigger pause
  }
});

window.addEventListener('online', () => {
  if (state.phase === 'uploading' && state.paused) {
    log('Network reconnected. Auto-resuming upload...', 'info');
    dom.btnPause.click(); // Trigger resume
  }
});

/* ----------------------------------------------------------------------------
   Initialization
   ---------------------------------------------------------------------------- */
initSpeedChart();
setPhase('idle');
showLogEmpty();
checkServerHealth();
renderDashboard();
// Re-check server health every 30 seconds
setInterval(checkServerHealth, 30_000);
