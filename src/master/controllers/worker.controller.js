const { getDatabase } = require('../../repositories/database');
const hashRing = require('../../services/consistentHash');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('worker.controller');

class WorkerController {
  async registerWorker(req, res) {
    const { id, host, port } = req.body;
    const db = getDatabase();
    await db.registerWorker({ workerId: id, host, port, status: 'alive' });
    
    // Add to hash ring
    hashRing.addNode(id);
    
    logger.info(`Worker ${id} registered successfully from ${host}:${port}`);
    res.json({ message: 'Registered successfully' });
  }

  // Future heartbeat reporting could go here if pushing instead of pulling
}

module.exports = new WorkerController();
