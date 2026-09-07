// --- Configuration & State ---
const state = {
    workers: [
        { id: 'worker-01', color: 'w1', status: 'ALIVE', cpu: 32, ram: 45, disk: 62, cb: 'CLOSED', chunks: 1420 },
        { id: 'worker-02', color: 'w2', status: 'ALIVE', cpu: 28, ram: 50, disk: 58, cb: 'CLOSED', chunks: 1395 },
        { id: 'worker-03', color: 'w3', status: 'ALIVE', cpu: 45, ram: 60, disk: 70, cb: 'CLOSED', chunks: 1510 },
        { id: 'worker-04', color: 'w4', status: 'ALIVE', cpu: 15, ram: 30, disk: 40, cb: 'CLOSED', chunks: 1100 },
    ],
    files: [
        { name: 'kernel.tar.gz', size: '1.2 GB', type: 'archive', replicated: true, chunks: 45 },
        { name: 'training_data_v4.csv', size: '8.4 GB', type: 'database', replicated: true, chunks: 120 },
        { name: 'nexus_design_system.fig', size: '240 MB', type: 'image', replicated: true, chunks: 12 }
    ],
    demoActive: false
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initNavigation();
    initSparkline();
    renderWorkers();
    renderFiles();
    initUploadEngine();
    initDemoBar();
    initShareModal();
    initCanvas();
    
    // Heartbeat simulator
    setInterval(simulateTelemetry, 3000);
});

// --- Navigation ---
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            const target = item.getAttribute('data-target');
            views.forEach(v => {
                if(v.id === `view-${target}`) {
                    v.classList.add('active');
                } else {
                    v.classList.remove('active');
                }
            });
        });
    });
}

// --- Top Dashboard Sparkline ---
function initSparkline() {
    const container = document.getElementById('network-sparkline');
    for(let i=0; i<20; i++) {
        const bar = document.createElement('div');
        bar.className = 'spark-bar';
        bar.style.height = `${Math.random() * 100}%`;
        container.appendChild(bar);
    }
    setInterval(() => {
        if(container.firstChild) container.removeChild(container.firstChild);
        const bar = document.createElement('div');
        bar.className = 'spark-bar';
        // Spike if demo active
        const height = state.demoActive ? (60 + Math.random() * 40) : (Math.random() * 60);
        bar.style.height = `${height}%`;
        container.appendChild(bar);
    }, 1000);
}

// --- Worker Grid & Telemetry ---
function renderWorkers() {
    const grid = document.getElementById('worker-grid');
    grid.innerHTML = '';
    
    state.workers.forEach(w => {
        let statusBadge = `<span class="pulse-dot ${w.status === 'ALIVE' ? 'green' : (w.status === 'SUSPECT' ? 'yellow' : 'red')}"></span>`;
        let cbClass = w.cb === 'CLOSED' ? 'cb-closed' : 'cb-open';
        
        const card = document.createElement('div');
        card.className = `worker-card glass-panel ${w.color} ${w.status === 'DEAD' ? 'dead' : ''}`;
        card.id = `card-${w.id}`;
        
        card.innerHTML = `
            <div class="worker-header">
                <span class="worker-id">${w.id.toUpperCase()}</span>
                <div class="worker-status">${statusBadge} ${w.status}</div>
            </div>
            <div class="worker-metrics">
                <div class="metric-col"><label>CPU</label><span id="${w.id}-cpu">${w.cpu}%</span></div>
                <div class="metric-col"><label>RAM</label><span id="${w.id}-ram">${w.ram}%</span></div>
                <div class="metric-col"><label>DISK</label><span id="${w.id}-disk">${w.disk}%</span></div>
            </div>
            <div class="worker-footer">
                <span class="cb-badge ${cbClass}" id="${w.id}-cb">${w.cb}</span>
                <span>${w.chunks.toLocaleString()} Chunks | Hit: 84%</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function simulateTelemetry() {
    if(state.demoActive) return; // Freeze normal telemetry during demo action
    state.workers.forEach(w => {
        if(w.status === 'ALIVE') {
            w.cpu = Math.min(100, Math.max(10, w.cpu + (Math.random() * 20 - 10)));
            w.ram = Math.min(100, Math.max(20, w.ram + (Math.random() * 10 - 5)));
            
            document.getElementById(`${w.id}-cpu`).innerText = `${Math.floor(w.cpu)}%`;
            document.getElementById(`${w.id}-ram`).innerText = `${Math.floor(w.ram)}%`;
        }
    });
}

function log(msg) {
    const logBox = document.getElementById('demo-log');
    const line = document.createElement('div');
    line.className = 'log-line';
    const time = new Date().toISOString().split('T')[1].substring(0, 8);
    line.innerText = `[${time}] ${msg}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
}

// --- Evaluator Demo: Kill & Self-Heal ---
function initDemoBar() {
    const btnKill = document.getElementById('btn-kill-node');
    const btnRevive = document.getElementById('btn-revive-node');
    
    btnKill.addEventListener('click', () => {
        state.demoActive = true;
        btnKill.disabled = true;
        
        const w2 = state.workers.find(w => w.id === 'worker-02');
        
        // 1. Suspect Phase
        log('Heartbeat missed from worker-02. Marking as SUSPECT...');
        w2.status = 'SUSPECT';
        renderWorkers();
        
        setTimeout(() => {
            // 2. Dead Phase
            log('worker-02 timeout reached. Marking DEAD. Circuit breaker OPEN.');
            w2.status = 'DEAD';
            w2.cb = 'OPEN';
            w2.cpu = 0; w2.ram = 0;
            renderWorkers();
            
            setTimeout(() => {
                // 3. Self Healing Trigger
                log('[REPLICATION_ENGINE] Detecting under-replicated chunks (RF < 2).');
                log('Triggering emergency re-replication from W-01 to W-03 & W-04...');
                triggerReplicationAnimation();
                
                setTimeout(() => {
                    log('[REPLICATION_ENGINE] Healing complete. RF restored to 2.');
                    btnRevive.disabled = false;
                }, 3500);
                
            }, 1000);
            
        }, 2000);
    });
    
    btnRevive.addEventListener('click', () => {
        const w2 = state.workers.find(w => w.id === 'worker-02');
        w2.status = 'ALIVE';
        w2.cb = 'CLOSED';
        w2.cpu = 28; w2.ram = 50;
        log('worker-02 revived. Rejoining cluster.');
        renderWorkers();
        state.demoActive = false;
        btnRevive.disabled = true;
        btnKill.disabled = false;
    });
}

// --- Canvas Chunk Flow Animation ---
let canvas, ctx;
let particles = [];

function initCanvas() {
    const container = document.getElementById('replication-canvas-container');
    canvas = document.getElementById('replication-canvas');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx = canvas.getContext('2d');
    
    requestAnimationFrame(drawCanvas);
}

function triggerReplicationAnimation() {
    // Generate particles flowing from left (W1) to right (W3/W4)
    for(let i=0; i<50; i++) {
        setTimeout(() => {
            particles.push({
                x: 50,
                y: canvas.height/2 + (Math.random() * 40 - 20),
                vx: 5 + Math.random() * 5,
                vy: (Math.random() - 0.5) * 2,
                color: Math.random() > 0.5 ? '#10B981' : '#F59E0B', // w3 or w4 colors
                size: 3 + Math.random() * 3
            });
        }, i * 50);
    }
}

function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw connections
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    ctx.lineTo(canvas.width, canvas.height/2);
    ctx.stroke();
    
    // Update and draw particles
    for(let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        
        // Draw square chunk
        ctx.fillRect(p.x, p.y, p.size, p.size);
        
        if(p.x > canvas.width) {
            particles.splice(i, 1);
        }
    }
    ctx.shadowBlur = 0; // reset
    requestAnimationFrame(drawCanvas);
}

window.addEventListener('resize', () => {
    if(canvas) {
        const container = document.getElementById('replication-canvas-container');
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
});


// --- Upload Engine ---
function initUploadEngine() {
    const dropZone = document.getElementById('drop-zone');
    const sim = document.getElementById('upload-simulator');
    const fname = document.getElementById('upload-filename');
    const progW1 = document.getElementById('prog-w1');
    const progW2 = document.getElementById('prog-w2');
    const progW3 = document.getElementById('prog-w3');
    const dedup = document.getElementById('dedup-flash');
    
    dropZone.addEventListener('click', startUpload);
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#00F0FF';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        startUpload();
    });
    
    function startUpload() {
        dropZone.classList.add('hidden');
        sim.classList.remove('hidden');
        dedup.classList.add('hidden');
        
        progW1.style.width = '0%';
        progW2.style.width = '0%';
        progW3.style.width = '0%';
        
        let p1=0, p2=0, p3=0;
        
        // Is it a dedup hit? (Random chance for demo)
        const isDedup = Math.random() > 0.7;
        
        if(isDedup) {
            setTimeout(() => {
                dedup.classList.remove('hidden');
                progW1.style.width = '100%';
                progW2.style.width = '100%';
                progW3.style.width = '100%';
                finishUpload();
            }, 800);
            return;
        }
        
        // Simulate streaming
        const interval = setInterval(() => {
            p1 += Math.random() * 5;
            p2 += Math.random() * 4;
            p3 += Math.random() * 6;
            
            progW1.style.width = `${Math.min(100, p1)}%`;
            progW2.style.width = `${Math.min(100, p2)}%`;
            progW3.style.width = `${Math.min(100, p3)}%`;
            
            if(p1 >= 100 && p2 >= 100 && p3 >= 100) {
                clearInterval(interval);
                finishUpload();
            }
        }, 100);
    }
    
    function finishUpload() {
        setTimeout(() => {
            // Reset for demo purposes
            sim.classList.add('hidden');
            dropZone.classList.remove('hidden');
            
            // Add file to list
            state.files.unshift({ name: 'uploaded_dataset.bin', size: '1.4 GB', type: 'file', replicated: true, chunks: 64 });
            renderFiles();
            
        }, 3000);
    }
}

// --- File Explorer & Heatmap ---
function renderFiles() {
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    
    state.files.forEach((f, idx) => {
        const row = document.createElement('div');
        row.className = 'file-row';
        row.innerHTML = `
            <div class="file-name-col cursor-pointer" onclick="toggleHeatmap(${idx})">
                <i data-lucide="file" class="text-muted"></i>
                <div class="file-name">${f.name}</div>
            </div>
            <div class="file-meta">${f.size}</div>
            <div class="badge-rep"><i data-lucide="check-circle" style="width:12px;height:12px"></i> RF=2</div>
            <button class="btn-share" onclick="openShare('${f.name}')"><i data-lucide="share-2" style="width:16px;height:16px"></i></button>
            <div class="chunk-matrix hidden" id="matrix-${idx}">
                <!-- Render chunks here -->
            </div>
        `;
        list.appendChild(row);
    });
    lucide.createIcons();
}

window.toggleHeatmap = function(idx) {
    const matrix = document.getElementById(`matrix-${idx}`);
    if(matrix.classList.contains('hidden')) {
        matrix.classList.remove('hidden');
        if(matrix.innerHTML.trim() === '<!-- Render chunks here -->') {
            const numChunks = state.files[idx].chunks;
            let html = '';
            for(let i=0; i<numChunks; i++) {
                // Assign random worker class
                const w = Math.floor(Math.random() * 4) + 1;
                html += `<div class="chunk-chip chip-w${w}" title="Chunk #${i} | Primary: W${w}">W${w}</div>`;
            }
            matrix.innerHTML = html;
        }
    } else {
        matrix.classList.add('hidden');
    }
}

// --- Share Modal & QR ---
function initShareModal() {
    const modal = document.getElementById('share-modal');
    const closeBtn = document.getElementById('close-share');
    const copyBtn = document.getElementById('btn-copy');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    copyBtn.addEventListener('click', () => {
        const input = document.getElementById('share-link');
        input.select();
        document.execCommand('copy');
        copyBtn.innerHTML = '<i data-lucide="check"></i> Copied';
        lucide.createIcons();
        setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i> Copy';
            lucide.createIcons();
        }, 2000);
    });
}

window.openShare = function(filename) {
    document.getElementById('share-filename').innerText = filename;
    document.getElementById('share-modal').classList.remove('hidden');
    
    // Generate QR
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    
    // Random link for demo
    const link = `https://nexus.dfs/s/${Math.random().toString(36).substring(7)}`;
    document.getElementById('share-link').value = link;
    
    new QRCode(qrContainer, {
        text: link,
        width: 128,
        height: 128,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}
