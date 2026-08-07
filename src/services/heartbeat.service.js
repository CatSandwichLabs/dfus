const fetch = require('node-fetch');
const config = require('../config/env');
const { getDatabase } = require('../repositories/database');
const hashRing = require('./consistentHash');
const { createLogger } = require('../utils/logger');

const logger = createLogger('heartbeat-service');
let heartbeatInterval = null;

const startHeartbeat = () => {
  if (heartbeatInterval) return;

  logger.info(`Starting heartbeat service (Interval: ${config.SYSTEM.HEARTBEAT_INTERVAL}ms)`);
  
  heartbeatInterval = setInterval(async () => {
    try {
      const db = getDatabase();
      // Only get workers we know about
      const allWorkers = await db.getAllWorkers ? await db.getAllWorkers() : await db.getAliveWorkers();
      
      for (const worker of allWorkers) {
        try {
          const url = `http://${worker.host}:${worker.port}/health`;
          const res = await fetch(url, { timeout: 2000 });
          
          if (res.ok) {
            // Success
            // Fetch stats if available, or just update heartbeat
            // A real system might hit a /stats endpoint on the worker here
            await db.updateWorkerHeartbeat(worker.id, { chunksStored: 0, diskUsage: 0 });
            hashRing.addNode(worker.id);
          } else {
            throw new Error(`Status ${res.status}`);
          }
        } catch (err) {
          // Missed beat
          const missed = (worker.missedBeats || 0) + 1;
          
          if (missed >= config.SYSTEM.MAX_MISSED_BEATS) {
            logger.warn(`Worker ${worker.id} marked as DEAD (Missed ${missed} beats)`);
            if (db.updateWorkerStatus) {
              await db.updateWorkerStatus(worker.id, 'dead');
            } else {
              await db.registerWorker({...worker, status: 'dead'}); // Hack for sqlite upsert
            }
            hashRing.removeNode(worker.id);
            
            // TODO: Trigger replication service to re-replicate chunks stored on this node
          } else {
            logger.debug(`Worker ${worker.id} missed beat ${missed}/${config.SYSTEM.MAX_MISSED_BEATS}`);
            if (db.updateWorkerMissedBeats) {
               await db.updateWorkerMissedBeats(worker.id, missed);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Heartbeat loop error: ${err.message}`);
    }
  }, config.SYSTEM.HEARTBEAT_INTERVAL);
};

const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

module.exports = {
  startHeartbeat,
  stopHeartbeat
};
