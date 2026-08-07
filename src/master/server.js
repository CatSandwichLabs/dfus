const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const promClient = require('prom-client');

// Initialize default prometheus metrics
promClient.collectDefaultMetrics();
const config = require('../config/env');
const { createLogger, createHttpLogger } = require('../utils/logger');
const errorHandler = require('../middleware/errorHandler');
const workerAuth = require('../middleware/workerAuth');
const { generalLimiter, authLimiter } = require('../middleware/rateLimiter');
const { NotFoundError } = require('../utils/errors');
const { initDatabase, getDatabase } = require('../repositories/database');
const { startHeartbeat, stopHeartbeat } = require('../services/heartbeat.service');
const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');
const accountRoutes = require('./routes/account.routes');
const uploadRoutes = require('./routes/upload.routes');
const folderRoutes = require('./routes/folder.routes');
const searchRoutes = require('./routes/search.routes');
const trashRoutes = require('./routes/trash.routes');
const shareRoutes = require('./routes/share.routes');
const workerRoutes = require('./routes/worker.routes');
const adminRoutes = require('./routes/admin.routes');
const wss = require('./services/websocket.service');

const logger = createLogger('master');
const app = express();

// Wire Winston logger to Express app
app.set('logger', logger);

// Security and CORS Middleware
app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: config.CORS.ALLOWED_ORIGINS.includes('*') ? '*' : config.CORS.ALLOWED_ORIGINS,
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type']
};
app.use(cors(corsOptions));

// Body Parsers & HTTP Logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(createHttpLogger(logger));

// Rate Limiting
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);

// Serve static frontend files
// Static files (SPA)
app.use(express.static(path.join(__dirname, '../../public')));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/folders', folderRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/trash', trashRoutes);
app.use('/api/v1/shares', shareRoutes);
app.use('/api/v1/system/workers', workerRoutes);
app.use('/api/v1/admin', adminRoutes);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

// 404 Catch-All Route (Must be before errorHandler)
app.use((req, res, next) => {
  next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
});

// Error handling middleware (Must be last)
app.use(errorHandler);

let server;

async function startServer() {
  try {
    await initDatabase();
    const PORT = config.MASTER.PORT;
    server = app.listen(PORT, () => {
      logger.info(`Master node started on port ${PORT} in ${config.MODE} mode`);
      wss.init(server);
      startHeartbeat();
    });
  } catch (err) {
    logger.error('Failed to start master server:', err);
    process.exit(1);
  }
}

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Initiating Master graceful shutdown...`);
  
  stopHeartbeat();
  
  if (server) {
    server.close(async () => {
      logger.info('Master HTTP server closed.');
      try {
        const db = getDatabase();
        if (db && typeof db.close === 'function') {
          await db.close();
          logger.info('Master database connection closed cleanly.');
        }
      } catch (err) {
        logger.error(`Error closing database connection: ${err.message}`);
      }
      logger.info('Master node graceful shutdown complete.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forcing Master node shutdown after 5s timeout.');
      process.exit(1);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
