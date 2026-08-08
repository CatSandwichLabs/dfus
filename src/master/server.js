const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const promClient = require('prom-client');

// Initialize default prometheus metrics (skip on Vercel where process metrics are meaningless and cause double-registration crashes)
if (process.env.VERCEL !== '1') {
  promClient.collectDefaultMetrics();
}
const config = require('../config/env');
const { createLogger, createHttpLogger } = require('../utils/logger');
const errorHandler = require('../middleware/errorHandler');
const { generalLimiter, authLimiter } = require('../middleware/rateLimiter');
const { NotFoundError } = require('../utils/errors');
const { initDatabase, getDatabase } = require('../repositories/database');
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
const cronRoutes = require('./routes/cron.routes');

const logger = createLogger('master');
const app = express();

// Wire Winston logger to Express app
app.set('logger', logger);

// Security and CORS Middleware
app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: config.CORS.ALLOWED_ORIGINS.includes('*') ? true : config.CORS.ALLOWED_ORIGINS,
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

// Ensure database is initialized before handling any request (for serverless cold starts)
let dbInitPromise = null;
app.use(async (req, res, next) => {
  try {
    if (!dbInitPromise) {
      dbInitPromise = initDatabase();
    }
    await dbInitPromise;
    
    // Serverless warm-start reconnection logic
    if (process.env.VERCEL === '1') {
      const mongoose = require('mongoose');
      // readyState 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
      if (mongoose.connection.readyState === 0) {
        const dbConnection = require('../repositories/mongodb/connection');
        dbConnection.isConnected = false;
        await dbConnection.connectWithRetry();
      }
    }

    next();
  } catch (err) {
    logger.error('Database initialization failed:', err);
    next(err);
  }
});

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
app.use('/api/v1/system/cron', cronRoutes);

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

// --- Local Development Server ---
// Only start listening when run directly (not when imported by Vercel)
if (require.main === module) {
  (async () => {
    try {
      await initDatabase();
      const PORT = config.MASTER.PORT;
      const server = app.listen(PORT, () => {
        logger.info(`Master node started on port ${PORT} in ${config.MODE} mode`);
        
        // WebSocket and heartbeat only work in local/Docker mode
        try {
          const wss = require('./services/websocket.service');
          wss.init(server);
        } catch (e) {
          logger.warn('WebSocket service not available (expected in serverless mode)');
        }
        
        const { startHeartbeat } = require('../services/heartbeat.service');
        startHeartbeat();
      });

      // Graceful Shutdown Handler
      const gracefulShutdown = (signal) => {
        logger.info(`Received ${signal}. Initiating Master graceful shutdown...`);
        
        const { stopHeartbeat } = require('../services/heartbeat.service');
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
    } catch (err) {
      logger.error('Failed to start master server:', err);
      process.exit(1);
    }
  })();
}

// Export the Express app for Vercel serverless
module.exports = app;
