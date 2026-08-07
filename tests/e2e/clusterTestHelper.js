'use strict';

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');

const DEFAULT_MASTER_PORT = 3090;
const DEFAULT_WORKER_BASE_PORT = 4091;
const DEFAULT_WORKER_COUNT = 3;
const DEFAULT_WORKER_SECRET = 'test-e2e-worker-secret';
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/db/e2e_test.db');
const PRELOAD_SCRIPT = path.resolve(__dirname, './mockFirebasePreload.js');

function pollEndpoint(url, timeoutMs = 10000, intervalMs = 200) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(url, { timeout: 1000 });
        if (res.ok || res.status === 401 || res.status === 404) {
          return resolve(true);
        }
      } catch (err) {
        // Not ready yet
      }

      if (Date.now() - startTime > timeoutMs) {
        return reject(new Error(`Timeout waiting for endpoint ${url} after ${timeoutMs}ms`));
      }
      setTimeout(attempt, intervalMs);
    };
    attempt();
  });
}

function cleanDbFiles(dbPath) {
  const filesToDelete = [dbPath, `${dbPath}-shm`, `${dbPath}-wal`];
  for (const file of filesToDelete) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {
        // ignore
      }
    }
  }
}

function cleanChunkData() {
  const chunksDir = path.resolve(__dirname, '../../data/chunks');
  if (fs.existsSync(chunksDir)) {
    try {
      fs.rmSync(chunksDir, { recursive: true, force: true });
    } catch (err) {
      // ignore
    }
  }
  const tmpDir = path.resolve(__dirname, '../../data/tmp');
  if (fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      // ignore
    }
  }
}

async function startCluster(options = {}) {
  const masterPort = options.masterPort || DEFAULT_MASTER_PORT;
  const workerBasePort = options.workerBasePort || DEFAULT_WORKER_BASE_PORT;
  const workerCount = options.workerCount || DEFAULT_WORKER_COUNT;
  const workerSecret = options.workerSecret || DEFAULT_WORKER_SECRET;
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const replicationFactor = options.replicationFactor || 2;

  // Clean state before booting
  cleanDbFiles(dbPath);
  cleanChunkData();

  const masterScript = path.resolve(__dirname, '../../src/master/server.js');
  const workerScript = path.resolve(__dirname, '../../src/worker/server.js');

  const envBase = {
    ...process.env,
    MODE: 'presentation',
    NODE_ENV: 'test',
    MASTER_HOST: 'localhost',
    MASTER_PORT: String(masterPort),
    WORKER_BASE_PORT: String(workerBasePort),
    WORKER_COUNT: String(workerCount),
    WORKER_SECRET: workerSecret,
    REPLICATION_FACTOR: String(replicationFactor),
    SQLITE_DB_PATH: dbPath,
    FIRST_USER_ADMIN: 'false',
  };

  // Fork Master process
  const masterProcess = fork(masterScript, [], {
    env: { ...envBase, SERVICE_NAME: 'master' },
    execArgv: ['--require', PRELOAD_SCRIPT],
    silent: true,
  });

  const masterLogs = [];
  masterProcess.stdout?.on('data', (data) => masterLogs.push(`[MASTER STDOUT] ${data.toString()}`));
  masterProcess.stderr?.on('data', (data) => masterLogs.push(`[MASTER STDERR] ${data.toString()}`));

  // Wait for Master server to start listening
  const masterHealthUrl = `http://localhost:${masterPort}/api/auth/me`;
  await pollEndpoint(masterHealthUrl, 10000);

  // Fork Worker processes
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    const workerPort = workerBasePort + i;
    const workerId = `worker-${i + 1}`;

    const workerProcess = fork(workerScript, [], {
      env: {
        ...envBase,
        SERVICE_NAME: workerId,
        WORKER_ID: workerId,
        WORKER_PORT: String(workerPort),
      },
      execArgv: ['--require', PRELOAD_SCRIPT],
      silent: true,
    });

    const workerLogs = [];
    workerProcess.stdout?.on('data', (data) => workerLogs.push(`[${workerId} STDOUT] ${data.toString()}`));
    workerProcess.stderr?.on('data', (data) => workerLogs.push(`[${workerId} STDERR] ${data.toString()}`));

    workers.push({
      id: workerId,
      port: workerPort,
      process: workerProcess,
      logs: workerLogs,
      url: `http://localhost:${workerPort}`,
    });
  }

  // Wait for each worker to be healthy
  for (const w of workers) {
    await pollEndpoint(`${w.url}/health`, 10000);
  }

  // Small delay to allow worker registration DB transaction to settle
  await new Promise((r) => setTimeout(r, 500));

  return {
    masterProcess,
    workers,
    masterPort,
    masterUrl: `http://localhost:${masterPort}`,
    workerSecret,
    dbPath,
    masterLogs,
    replicationFactor,
  };
}

async function stopCluster(clusterHandle) {
  if (!clusterHandle) return;

  const killProcess = (proc) => {
    return new Promise((resolve) => {
      if (!proc || proc.killed || proc.exitCode !== null) return resolve();
      proc.once('exit', resolve);
      proc.kill('SIGKILL');
      setTimeout(resolve, 1000);
    });
  };

  if (clusterHandle.workers) {
    for (const w of clusterHandle.workers) {
      await killProcess(w.process);
    }
  }

  if (clusterHandle.masterProcess) {
    await killProcess(clusterHandle.masterProcess);
  }

  cleanDbFiles(clusterHandle.dbPath);
  cleanChunkData();
}

function getDatabaseConnection(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true });
}

module.exports = {
  startCluster,
  stopCluster,
  getDatabaseConnection,
  cleanDbFiles,
  cleanChunkData,
  DEFAULT_MASTER_PORT,
  DEFAULT_WORKER_BASE_PORT,
  DEFAULT_WORKER_COUNT,
  DEFAULT_WORKER_SECRET,
  DEFAULT_DB_PATH,
};
