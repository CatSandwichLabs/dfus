'use strict';

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
const { fork } = require('child_process');

const { config, validateForProduction } = require('./src/config/env');
const { connectDB, closeDB } = require('./src/config/db');
const pathUtils = require('./src/utils/pathUtils');
const uploadRoutes = require('./src/routes/upload');
const downloadRoutes = require('./src/routes/download');
const managementRoutes = require('./src/routes/management');
const inboxRoutes = require('./src/routes/inbox');
const errorHandler = require('./src/middleware/errorHandler');

validateForProduction();

// Ensure temp directory exists
pathUtils.init(config);
const tmpDir = pathUtils.getTmpDir();
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Spawn Storage Nodes for Distributed Architecture
const NODE_PORTS = [3001, 3002, 3003];
const storageNodes = [];

if (config.nodeEnv !== 'test') {
  NODE_PORTS.forEach(port => {
    const nodeProcess = fork(path.join(__dirname, 'src', 'storageNode.js'), [], {
      env: { ...process.env, PORT: port }
    });
    
    nodeProcess.on('error', (err) => {
      console.error(`[Orchestrator] Failed to start Storage Node on port ${port}:`, err);
    });
    
    storageNodes.push(nodeProcess);
  });
}

/**
 * Factory that creates and returns a configured Express application instance.
 * Calling this multiple times (e.g., from different test files) is safe because
 * each call returns a new app object.
 */
function createApp() {
  // Initialize storage directories from current env values
  pathUtils.init(config);

  const app = express();

  app.use(cors({
    origin: '*', // Allow Cloudflare Pages and Localhost
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-upload-session-id', 'x-chunk-index', 'x-chunk-hash', 'x-edit-token', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Disposition']
  }));

  if (config.nodeEnv !== 'test') {
    app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  // Redirect root traffic to Cloudflare Pages in production
  app.get('/', (req, res, next) => {
    if (config.nodeEnv === 'production') {
      return res.redirect('https://dfus.pages.dev/');
    }
    next();
  });

  // Serve the static frontend
  app.use(express.static(path.join(__dirname, '../client')));

  // Mount upload API.
  // NOTE: express.json() is NOT applied globally. The chunk route reads the raw
  // request stream; other routes apply their own body parsers inline.
  app.use('/api/upload', uploadRoutes);
  app.use('/api/download', downloadRoutes);
  app.use('/api/manage', express.json(), managementRoutes);
  app.use('/api/inbox', express.json(), inboxRoutes);

  app.get('/status', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { message: 'API endpoint not found', status: 404 } });
  });

  app.use(errorHandler);

  return app;
}

// Singleton app for the default export (used by npm start / npm run dev)
const app = createApp();
let _server = null;

/**
 * Connect to MongoDB and start the HTTP server.
 * @param {string} [mongoUri] - Override URI (used in tests to point at MongoMemoryServer)
 * @returns {Promise<import('http').Server>}
 */
async function start(mongoUri) {
  await connectDB(mongoUri);
  return new Promise((resolve, reject) => {
    _server = app.listen(config.port, () => {
      if (config.nodeEnv !== 'test') {
        process.stdout.write(`[SERVER] DFUS running on port ${config.port} [${config.nodeEnv}]\n`);
      }
      resolve(_server);
    });
    _server.on('error', reject);
  });
}

/**
 * Gracefully shut down the HTTP server and close the DB connection.
 * @returns {Promise<void>}
 */
async function stop() {
  if (_server) {
    await new Promise((resolve, reject) => {
      _server.close((err) => (err ? reject(err) : resolve()));
    });
    _server = null;
  }
  await closeDB();
}

function gracefulShutdown(signal) {
  process.stdout.write(`\n[SERVER] Received ${signal}, shutting down...\n`);
  storageNodes.forEach(n => n.kill());
  stop()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));

  setTimeout(() => {
    process.stderr.write('[SERVER] Forced exit after shutdown timeout\n');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  start().catch((err) => {
    process.stderr.write(`[SERVER] Startup failed: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { app, createApp, start, stop };
