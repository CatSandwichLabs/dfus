const { getDatabase } = require('../../repositories/database');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('worker.controller');

class WorkerController {
  async registerWorker(req, res) {
    const { id, host, port, publicUrl } = req.body;
    const db = getDatabase();
    await db.registerWorker({ workerId: id, host, port, publicUrl, status: 'alive' });
    
    // No need to maintain an in-memory hash ring — 
    // it is rebuilt from the database on each request (serverless-safe).
    
    logger.info(`Worker ${id} registered successfully from ${host}:${port}`);
    res.json({ message: 'Registered successfully' });
  }

  async heartbeat(req, res) {
    const { id, load, publicUrl } = req.body;
    const db = getDatabase();
    await db.updateWorkerHeartbeat(id, load, publicUrl);
    res.json({ message: 'Heartbeat acknowledged' });
  }

  async chunkComplete(req, res) {
    const { sessionId, chunkIndex, chunkHash, workerId } = req.body;
    const db = getDatabase();
    
    await db.updateSessionChunkStatus(sessionId, chunkIndex, true);
    await db.addWorkerToChunk(chunkHash, workerId);
    
    res.json({ message: 'Chunk completion recorded' });
  }
}

module.exports = new WorkerController();
