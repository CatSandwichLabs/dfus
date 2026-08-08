const fetch = require('node-fetch');
const os = require('os');
const config = require('../../config/env');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('worker-heartbeat');

class WorkerHeartbeat {
  constructor() {
    this.intervalId = null;
  }

  async registerWithMaster() {
    try {
      const url = `${config.WORKER.MASTER_URL}/api/v1/system/workers/register`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': config.WORKER.SECRET
        },
        body: JSON.stringify({
          id: config.WORKER.ID,
          host: '127.0.0.1', 
          port: config.WORKER.PORT,
          publicUrl: process.env.RENDER_EXTERNAL_URL || null
        })
      });

      if (!res.ok) {
        throw new Error(`Master responded with ${res.status}`);
      }
      logger.info('Successfully registered with Master Node');
    } catch (err) {
      logger.error('Failed to register with Master Node:', err.message);
      // Exit or retry? For now, we keep retrying via heartbeat anyway if we unified them.
    }
  }

  async sendHeartbeat() {
    try {
      const load = {
        cpu: os.loadavg()[0],
        memory: process.memoryUsage().rss,
        freeMem: os.freemem(),
        totalMem: os.totalmem()
      };

      const url = `${config.WORKER.MASTER_URL}/api/v1/system/workers/heartbeat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': config.WORKER.SECRET
        },
        body: JSON.stringify({
          id: config.WORKER.ID,
          load,
          publicUrl: process.env.RENDER_EXTERNAL_URL || null
        })
      });

      if (!res.ok) {
        if (res.status === 404) {
          // Worker might have been dropped, try re-registering
          await this.registerWithMaster();
        } else {
          throw new Error(`Master responded with ${res.status}`);
        }
      }
    } catch (err) {
      logger.error('Heartbeat failed:', err.message);
    }
  }

  startHeartbeat() {
    if (this.intervalId) return;
    
    // Register immediately
    this.registerWithMaster().then(() => {
      // Then start loop
      this.intervalId = setInterval(() => {
        this.sendHeartbeat();
      }, config.SYSTEM.HEARTBEAT_INTERVAL || 30000);
    });
  }

  stopHeartbeat() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

module.exports = new WorkerHeartbeat();
