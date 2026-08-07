const fetch = require('node-fetch');
const config = require('../config/env');
const { getDatabase } = require('../repositories/database');
const { ChunkError, NotFoundError } = require('../utils/errors');
const { PassThrough } = require('stream');

/**
 * Reassemble a file by fetching all its chunks from the worker nodes
 * and streaming them directly to the client.
 * @param {string} fileId 
 * @param {express.Response} res 
 */
const downloadFile = async (fileId, res) => {
  const db = getDatabase();
  const file = await db.findFileById(fileId);
  
  if (!file) {
    throw new NotFoundError('File not found');
  }

  const chunks = await db.findChunksByFileId(fileId);
  if (!chunks || chunks.length !== file.totalChunks) {
    throw new ChunkError(`File is incomplete. Expected ${file.totalChunks} chunks, found ${chunks ? chunks.length : 0}`);
  }

  // Ensure they are strictly sorted by chunkIndex
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

  // Set response headers for streaming download
  res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', file.totalSize);

  // Download chunks sequentially to guarantee order
  for (const chunk of chunks) {
    let chunkDownloaded = false;
    
    // Try to download from any of the workers that have it
    for (const workerId of chunk.workerIds) {
      const worker = await db.findWorkerById(workerId);
      if (!worker || worker.status !== 'alive') continue;

      try {
        const url = `http://${worker.host}:${worker.port}/api/chunks/${chunk.hash}`;
        const response = await fetch(url, {
          headers: {
            'x-worker-secret': config.WORKER.SECRET
          }
        });

        if (response.ok) {
          // Stream this chunk directly to the response
          await new Promise((resolve, reject) => {
            response.body.pipe(res, { end: false });
            response.body.on('end', resolve);
            response.body.on('error', reject);
          });
          chunkDownloaded = true;
          break; // Move to the next chunk
        }
      } catch (err) {
        console.error(`Failed to download chunk ${chunk.hash} from worker ${workerId}: ${err.message}`);
      }
    }

    if (!chunkDownloaded) {
      // If we couldn't get this chunk from ANY worker, the file is broken.
      // We must abort the stream.
      res.end();
      throw new ChunkError(`Chunk ${chunk.hash} is unavailable on all workers`);
    }
  }

  // Done!
  res.end();
};

module.exports = {
  downloadFile
};
