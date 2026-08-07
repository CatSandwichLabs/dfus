const { spawn } = require('child_process');
const path = require('path');

const masterPath = path.join(__dirname, '../src/master/server.js');
const workerPath = path.join(__dirname, '../src/worker/server.js');

const numWorkers = process.env.NUM_WORKERS || 3;

// Start Master
const masterProcess = spawn('node', [masterPath], { stdio: 'inherit' });

masterProcess.on('error', (err) => {
  console.error('Failed to start master process:', err);
});

// Wait a bit for master to start before starting workers
setTimeout(() => {
  for (let i = 0; i < numWorkers; i++) {
    const port = 4000 + i;
    const workerEnv = { 
      ...process.env, 
      PORT: port,
      WORKER_ID: `worker_${i + 1}`
    };
    
    const workerProcess = spawn('node', [workerPath], { 
      env: workerEnv,
      stdio: 'inherit' 
    });

    workerProcess.on('error', (err) => {
      console.error(`Failed to start worker ${i + 1}:`, err);
    });
  }
}, 2000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down cluster...');
  process.exit(0);
});
