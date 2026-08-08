const storageService = require('../services/storage.service');

class ChunkController {
  async uploadChunk(req, res, next) {
    try {
      const { chunkHash } = req.params;
      
      // req is the stream (busboy or just raw stream, let's assume raw binary stream for simplicity in the client)
      // Since express.json() is active, but we didn't add a body parser for binary, we can just pipe `req` directly.
      // But wait, the client is sending direct stream. We should not have express json parsing it if it's octet-stream.
      
      await storageService.handleUpload(chunkHash, req);
      
      // Notify Master
      const fetch = require('node-fetch');
      const { sessionId, chunkIndex, workerId } = req.chunkContext;
      const config = require('../../config/env');
      
      const token = require('jsonwebtoken').sign({ workerId }, config.WORKER.SECRET);
      
      await fetch(`${config.WORKER.MASTER_URL}/api/v1/system/workers/chunk-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': config.WORKER.SECRET
        },
        body: JSON.stringify({ sessionId, chunkIndex, chunkHash, workerId })
      }).catch(err => {
        // Just log the error, don't fail the upload
        console.error('Failed to notify master:', err.message);
      });
      
      res.status(201).json({ message: 'Chunk uploaded successfully' });
    } catch (err) {
      next(err);
    }
  }

  async downloadChunk(req, res, next) {
    try {
      const { chunkHash } = req.params;
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${chunkHash}"`);
      
      await storageService.handleDownload(chunkHash, res);
      
    } catch (err) {
      // If headers are already sent, we can't send JSON error, just end it.
      if (!res.headersSent) {
        next(err);
      } else {
        res.end();
      }
    }
  }

  async deleteChunk(req, res, next) {
    try {
      const { chunkHash } = req.params;
      await storageService.deleteChunk(chunkHash);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async replicateChunk(req, res, next) {
    try {
      const { chunkHash } = req.params;
      const { sourceUrl } = req.body;
      
      const fetch = require('node-fetch');
      const token = req.headers.authorization;
      
      // Fetch from source worker
      const response = await fetch(sourceUrl, {
        headers: { 'Authorization': token }
      });
      
      if (!response.ok) throw new Error('Failed to fetch from source worker');
      
      // Handle it just like an upload
      await storageService.handleUpload(chunkHash, response.body);
      
      res.json({ message: 'Chunk replicated successfully' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ChunkController();
