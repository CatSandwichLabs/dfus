const { getDatabase } = require('../../repositories/database');
const hashRing = require('../../services/consistentHash');
const replicationService = require('./replication.service');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/env');

const logger = createLogger('master-heartbeat');
let intervalId = null;

class MasterHeartbeatService {
  async processHeartbeat(workerId, loadStats) {
    const db = getDatabase();
    const worker = await db.findWorkerById(workerId);
    
    if (!worker) {
      // If we don't have it, it must register first
      const error = new Error('Worker not registered');
      error.status = 404;
      throw error;
    }

    await db.updateWorkerStatus(workerId, 'alive');
    // Also update loadStats if we have a field for it
    if (db.updateWorkerLoad) {
      await db.updateWorkerLoad(workerId, loadStats);
    }
    
    hashRing.addNode(workerId);
  }

  startMonitor() {
    if (intervalId) return;
    
    // Check every 30s for dead workers
    const CHECK_INTERVAL = config.SYSTEM.HEARTBEAT_INTERVAL || 30000;
    
    intervalId = setInterval(async () => {
      try {
        const db = getDatabase();
        const workers = await db.getAllWorkers();
        
        const now = new Date();
        const THRESHOLD = CHECK_INTERVAL * 3; // 3 missed beats

        for (const worker of workers) {
          if (worker.status === 'dead') continue;

          const timeSinceLastSeen = now - new Date(worker.updatedAt);
          
          if (timeSinceLastSeen > THRESHOLD) {
            logger.warn(`Worker ${worker.id} marked as DEAD (last seen ${timeSinceLastSeen}ms ago)`);
            
            await db.updateWorkerStatus(worker.id, 'dead');
            hashRing.removeNode(worker.id);

            // Trigger replication
            replicationService.recoverWorkerChunks(worker.id).catch(err => {
              logger.error(`Failed to recover chunks for worker ${worker.id}: ${err.message}`);
            });
          }
        }
      } catch (err) {
        logger.error(`Heartbeat monitor error: ${err.message}`);
      }
    }, CHECK_INTERVAL);
  }

  stopMonitor() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
}

module.exports = new MasterHeartbeatService();
