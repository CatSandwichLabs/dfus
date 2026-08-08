const { getDatabase } = require('../../repositories/database');
const { createLogger } = require('../../utils/logger');
const config = require('../../config/env');

const logger = createLogger('master-heartbeat');
let intervalId = null;

class MasterHeartbeatService {
  async processHeartbeat(workerId, loadStats) {
    const db = getDatabase();
    const worker = await db.findWorkerById(workerId);
    
    if (!worker) {
      const error = new Error('Worker not registered');
      error.status = 404;
      throw error;
    }

    const oldStatus = worker.status;
    await db.updateWorkerStatus(workerId, 'alive');
    if (db.updateWorkerLoad) {
      await db.updateWorkerLoad(workerId, loadStats);
    }
    
    if (oldStatus !== 'alive') {
      try {
        const realtime = require('./websocket.service');
        realtime.broadcastAll({
          event: 'worker:status',
          data: { workerId, status: 'alive', previousStatus: oldStatus }
        });
      } catch (e) {
        logger.warn(`Could not broadcast worker status: ${e.message}`);
      }
    }
    
    // In serverless mode, the hash ring is rebuilt per-request from DB,
    // so we don't need to maintain an in-memory ring here.
  }

  /**
   * Check for dead workers - can be called by either setInterval (local) 
   * or a Vercel Cron Job hitting /api/v1/system/cron/heartbeat.
   */
  async checkDeadWorkers() {
    try {
      const db = getDatabase();
      const workers = await db.getAllWorkers();
      
      const now = new Date();
      const CHECK_INTERVAL = config.SYSTEM.HEARTBEAT_INTERVAL || 30000;
      const THRESHOLD = CHECK_INTERVAL * 3;
      let deadCount = 0;

      for (const worker of workers) {
        if (worker.status === 'dead') continue;

        const timeSinceLastSeen = now - new Date(worker.updatedAt);
        
        if (timeSinceLastSeen > THRESHOLD) {
          logger.warn(`Worker ${worker.id} marked as DEAD (last seen ${timeSinceLastSeen}ms ago)`);
          await db.updateWorkerStatus(worker.id, 'dead');
          deadCount++;
          
          try {
            const realtime = require('./websocket.service');
            realtime.broadcastAll({
              event: 'worker:status',
              data: { workerId: worker.id, status: 'dead', previousStatus: worker.status }
            });
          } catch (e) {
            logger.warn(`Could not broadcast worker status: ${e.message}`);
          }

          // Trigger replication asynchronously
          try {
            const replicationService = require('./replication.service');
            replicationService.recoverWorkerChunks(worker.id).catch(err => {
              logger.error(`Failed to recover chunks for worker ${worker.id}: ${err.message}`);
            });
          } catch (e) {
            logger.error(`Replication service error: ${e.message}`);
          }
        }
      }

      return { checked: workers.length, deadFound: deadCount };
    } catch (err) {
      logger.error(`Heartbeat monitor error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Start the local background monitor (only used in local/Docker mode).
   * In Vercel, the cron route calls checkDeadWorkers() directly instead.
   */
  startMonitor() {
    if (intervalId) return;
    const CHECK_INTERVAL = config.SYSTEM.HEARTBEAT_INTERVAL || 30000;
    
    intervalId = setInterval(async () => {
      await this.checkDeadWorkers();
    }, CHECK_INTERVAL);
  }

  stopMonitor() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
}

const heartbeatService = new MasterHeartbeatService();

// Legacy exports for backward compatibility with server.js
function startHeartbeat() {
  heartbeatService.startMonitor();
}

function stopHeartbeat() {
  heartbeatService.stopMonitor();
}

module.exports = heartbeatService;
module.exports.startHeartbeat = startHeartbeat;
module.exports.stopHeartbeat = stopHeartbeat;
