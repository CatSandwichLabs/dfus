const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const fetch = require('node-fetch');
const config = require('../config/env');
const { createLogger } = require('../utils/logger');
const errorHandler = require('../middleware/errorHandler');
const workerAuth = require('../middleware/workerAuth');
const { getStorage } = require('../repositories/storage');

const workerId = process.env.WORKER_ID;
const port = process.env.WORKER_PORT;

const logger = createLogger(workerId);
const app = express();

// A generic raw body parser for chunk streams
app.use('/api/chunks', express.raw({ limit: `${config.STORAGE.CHUNK_SIZE + 1024}b`, type: 'application/octet-stream' }));

app.use(helmet());
app.use(express.json());
app.use(morgan('tiny', { stream: { write: msg => logger.info(msg.trim()) } }));

// The storage engine for this worker
const storage = getStorage(workerId);

// ================= ROUTES ================= //

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'alive', workerId });
});

// Store Chunk
app.post('/api/chunks/:hash', workerAuth, async (req, res, next) => {
  try {
    const { hash } = req.params;
    const chunkData = req.body; // Buffer from express.raw
    
    if (!chunkData || chunkData.length === 0) {
      return res.status(400).json({ error: { message: 'Empty chunk data' } });
    }

    await storage.storeChunk(hash, chunkData);
    res.status(201).json({ message: 'Chunk stored successfully' });
  } catch (err) {
    next(err);
  }
});

// Retrieve Chunk
app.get('/api/chunks/:hash', workerAuth, async (req, res, next) => {
  try {
    const { hash } = req.params;
    const exists = await storage.chunkExists(hash);
    
    if (!exists) {
      return res.status(404).json({ error: { message: 'Chunk not found' } });
    }

    const data = await storage.retrieveChunk(hash);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(data);
  } catch (err) {
    next(err);
  }
});

// Delete Chunk
app.delete('/api/chunks/:hash', workerAuth, async (req, res, next) => {
  try {
    const { hash } = req.params;
    await storage.deleteChunk(hash);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

app.listen(port, async () => {
  logger.info(`Worker node started on port ${port}`);
  
  // Register with Master
  try {
    const url = `http://${config.MASTER.HOST}:${config.MASTER.PORT}/api/system/workers/register`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': config.WORKER.SECRET
      },
      body: JSON.stringify({
        id: workerId,
        host: 'localhost', // Or process.env.HOST
        port: port
      })
    });
    
    if (res.ok) {
      logger.info('Successfully registered with Master node');
    } else {
      logger.error(`Failed to register with Master: ${res.status}`);
    }
  } catch (err) {
    logger.error(`Failed to reach Master: ${err.message}`);
  }
});
