const crypto = require('crypto');
const config = require('../config/env');
const hashRing = require('./consistentHash');
const { getDatabase } = require('../repositories/database');
const { ChunkError } = require('../utils/errors');
const fetch = require('node-fetch');

/**
 * Process an incoming file stream, split into chunks, and distribute to workers.
 * @param {stream.Readable} fileStream 
 * @param {string} fileId 
 * @returns {Promise<Array>} Array of chunk metadata
 */
const processFileStream = async (fileStream, fileId) => {
  const chunks = [];
  const chunkSize = config.STORAGE.CHUNK_SIZE;
  let chunkBuffer = Buffer.alloc(0);
  let chunkIndex = 0;
  
  // A helper to send chunk to workers
  const dispatchChunk = async (buffer, index) => {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const workerCount = config.SYSTEM.REPLICATION_FACTOR;
    const targetWorkers = hashRing.getNodes(hash, workerCount);
    
    if (targetWorkers.length === 0) {
      throw new ChunkError('No active workers available to store chunk');
    }

    const db = getDatabase();
    
    // Save chunk metadata to DB (upsert)
    await db.createChunk({
      hash,
      size: buffer.length,
      workerIds: targetWorkers.map(w => w.id),
      status: 'pending'
    });

    // Send the chunk to each target worker concurrently
    const uploadPromises = targetWorkers.map(async (worker) => {
      try {
        const url = `http://${worker.host}:${worker.port}/api/chunks/${hash}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'x-worker-secret': config.WORKER.SECRET,
            'Content-Type': 'application/octet-stream'
          },
          body: buffer
        });

        if (!response.ok) {
          throw new Error(`Worker returned ${response.status}`);
        }
        return true;
      } catch (err) {
        console.error(`Failed to upload chunk ${hash} to worker ${worker.id}: ${err.message}`);
        return false;
      }
    });

    const results = await Promise.all(uploadPromises);
    const successfulUploads = results.filter(r => r).length;

    if (successfulUploads === 0) {
      throw new ChunkError(`Failed to store chunk ${hash} on any worker`);
    }

    // Mark as stored
    await db.createChunk({
      hash,
      size: buffer.length,
      workerIds: targetWorkers.map(w => w.id),
      status: 'stored'
    });

    // Link chunk to file
    await db.linkChunkToFile(fileId, hash, index);
    
    return { hash, index, size: buffer.length };
  };

  return new Promise((resolve, reject) => {
    fileStream.on('data', async (data) => {
      chunkBuffer = Buffer.concat([chunkBuffer, data]);
      
      while (chunkBuffer.length >= chunkSize) {
        const chunkToProcess = chunkBuffer.slice(0, chunkSize);
        chunkBuffer = chunkBuffer.slice(chunkSize);
        
        fileStream.pause(); // Pause stream while uploading to workers
        try {
          const meta = await dispatchChunk(chunkToProcess, chunkIndex++);
          chunks.push(meta);
          fileStream.resume();
        } catch (err) {
          fileStream.destroy(err);
        }
      }
    });

    fileStream.on('end', async () => {
      try {
        if (chunkBuffer.length > 0) {
          const meta = await dispatchChunk(chunkBuffer, chunkIndex++);
          chunks.push(meta);
        }
        resolve(chunks);
      } catch (err) {
        reject(err);
      }
    });

    fileStream.on('error', (err) => {
      reject(new ChunkError(`Stream error: ${err.message}`));
    });
  });
};

module.exports = {
  processFileStream
};
