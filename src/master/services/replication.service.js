const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const { getDatabase } = require('../../repositories/database');
const hashRing = require('../../services/consistentHash');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/env');

const logger = createLogger('replication-service');

class ReplicationService {
  async recoverWorkerChunks(deadWorkerId) {
    const db = getDatabase();
    
    // 1. Find all chunks that had this worker in their workerIds
    // This requires a DB method to query chunks by workerId array
    const chunks = await db.findChunksByWorkerId(deadWorkerId);
    
    logger.info(`Starting recovery for dead worker ${deadWorkerId}. ${chunks.length} chunks affected.`);

    for (const chunk of chunks) {
      // 2. Remove dead worker from the array
      const activeWorkers = chunk.workerIds.filter(id => id !== deadWorkerId);
      
      await db.updateChunkWorkers(chunk.chunkHash, activeWorkers);

      // 3. If replication factor < 2, we need to replicate
      const REPLICATION_FACTOR = 2;
      
      if (activeWorkers.length < REPLICATION_FACTOR && activeWorkers.length > 0) {
        // We have at least 1 surviving copy to replicate from
        const sourceWorkerId = activeWorkers[0];
        
        // Find a new target worker that doesn't already have it
        const targetNodes = hashRing.getNodes(chunk.chunkHash, REPLICATION_FACTOR + 1);
        const targetWorkerId = targetNodes.find(id => !activeWorkers.includes(id) && id !== deadWorkerId);
        
        if (targetWorkerId) {
          await this._triggerReplication(chunk.chunkHash, sourceWorkerId, targetWorkerId);
        } else {
          logger.warn(`No suitable target worker found to replicate chunk ${chunk.chunkHash}`);
        }
      } else if (activeWorkers.length === 0) {
        logger.error(`CRITICAL: Chunk ${chunk.chunkHash} has lost all replicas! Data loss occurred.`);
        // Mark chunk as lost, potentially notify admin or users
        await db.updateChunkStatus(chunk.chunkHash, 'lost');
      }
    }
  }

  async _triggerReplication(chunkHash, sourceWorkerId, targetWorkerId) {
    try {
      const db = getDatabase();
      const sourceWorker = await db.findWorkerById(sourceWorkerId);
      const targetWorker = await db.findWorkerById(targetWorkerId);

      if (!sourceWorker || !targetWorker) return;

      // Create a replication JWT
      const token = jwt.sign(
        { action: 'replicate', chunkHash, sourceWorkerId },
        config.WORKER.SECRET,
        { expiresIn: '10m' }
      );

      // Tell target worker to pull from source worker
      const url = `http://${targetWorker.host}:${targetWorker.port}/chunks/${chunkHash}/replicate`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceUrl: `http://${sourceWorker.host}:${sourceWorker.port}/chunks/${chunkHash}`
        })
      });

      if (!res.ok) {
        throw new Error(`Target worker responded with ${res.status}`);
      }

      logger.info(`Successfully triggered replication of ${chunkHash} from ${sourceWorkerId} to ${targetWorkerId}`);
    } catch (err) {
      logger.error(`Failed to replicate chunk ${chunkHash}: ${err.message}`);
    }
  }
}

module.exports = new ReplicationService();
