const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const config = require('../config/env');
const { createLogger } = require('../utils/logger');
const errorHandler = require('../middleware/errorHandler');
const workerAuth = require('../middleware/workerAuth');
const { getDatabase } = require('../repositories/database');
const { startHeartbeat } = require('../services/heartbeat.service');
const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');

const logger = createLogger('master');
const app = express();
const db = getDatabase();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Serve static frontend files (Category 10/11)
app.use(express.static(path.join(__dirname, '../../client')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// Worker Registration Endpoint
app.post('/api/system/workers/register', workerAuth, async (req, res, next) => {
  try {
    const { id, host, port } = req.body;
    await db.registerWorker({ id, host, port, status: 'alive' });
    
    // Add to hash ring (done automatically by heartbeat but good to do instantly)
    const hashRing = require('../services/consistentHash');
    hashRing.addNode(id);
    
    logger.info(`Worker ${id} registered successfully from ${host}:${port}`);
    res.json({ message: 'Registered successfully' });
  } catch (err) {
    next(err);
  }
});

// Start Master Server
const PORT = config.MASTER.PORT;
app.listen(PORT, () => {
  logger.info(`Master node started on port ${PORT} in ${config.MODE} mode`);
  
  // Start the background services
  startHeartbeat();
});

// Error handling (must be last)
app.use(errorHandler);
