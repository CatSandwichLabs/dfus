const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const promClient = require('prom-client');
const { createLogger, createHttpLogger } = require('../utils/logger');

// Initialize default prometheus metrics
promClient.collectDefaultMetrics();
const config = require('../config/env');
const chunkRoutes = require('./routes/chunk.routes');
const errorHandler = require('../middleware/errorHandler');
const { startHeartbeat } = require('./services/heartbeat.service');
const { initStorage } = require('./services/storage.service');

const logger = createLogger('worker');
const app = express();

app.set('logger', logger);
app.use(helmet());
app.use(cors({ origin: '*' }));
// Note: Chunk uploads might be raw binary streams or multipart, we'll configure it in routes.
// We allow JSON for health checks and status endpoints.
app.use(express.json());
app.use(createHttpLogger(logger));

// Routes
app.use('/chunks', chunkRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', workerId: config.WORKER.ID });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

app.use(errorHandler);

let server;

async function startServer() {
  try {
    await initStorage();
    const PORT = config.WORKER.PORT;
    server = app.listen(PORT, () => {
      logger.info(`Worker node ${config.WORKER.ID} started on port ${PORT}`);
      startHeartbeat();
    });
  } catch (err) {
    logger.error('Failed to start worker:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
