const { fork } = require('child_process');
const path = require('path');
const config = require('../src/config/env');
const { createLogger } = require('../src/utils/logger');

const logger = createLogger('cluster-manager');

logger.info(`Starting DFUS Cluster in ${config.MODE} mode`);

// Start Master Node
const masterScript = path.join(__dirname, '../src/master/server.js');
const masterProcess = fork(masterScript, [], {
  env: { ...process.env, SERVICE_NAME: 'master' }
});

masterProcess.on('exit', (code) => {
  logger.error(`Master process exited with code ${code}`);
  process.exit(code);
});

// Start Worker Nodes
const workers = [];
for (let i = 0; i < config.WORKER.COUNT; i++) {
  const workerPort = config.WORKER.BASE_PORT + i;
  const workerId = `worker-${i + 1}`;
  
  const workerScript = path.join(__dirname, '../src/worker/server.js');
  const workerProcess = fork(workerScript, [], {
    env: { 
      ...process.env, 
      SERVICE_NAME: workerId,
      WORKER_ID: workerId,
      WORKER_PORT: workerPort
    }
  });

  workerProcess.on('exit', (code) => {
    logger.error(`Worker process ${workerId} exited with code ${code}`);
  });

  workers.push({ id: workerId, process: workerProcess });
}

// Graceful shutdown handling
const shutdown = () => {
  logger.info('Shutting down cluster...');
  masterProcess.kill('SIGTERM');
  workers.forEach(w => w.process.kill('SIGTERM'));
  
  setTimeout(() => {
    logger.warn('Forcing exit after timeout');
    process.exit(0);
  }, 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
