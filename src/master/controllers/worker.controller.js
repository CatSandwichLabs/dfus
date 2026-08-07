const { getDatabase } = require('../../repositories/database');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('worker.controller');

class WorkerController {
  async registerWorker(req, res) {
    const { id, host, port } = req.body;
    const db = getDatabase();
    await db.registerWorker({ workerId: id, host, port, status: 'alive' });
    
    // No need to maintain an in-memory hash ring — 
    // it is rebuilt from the database on each request (serverless-safe).
    
    logger.info(`Worker ${id} registered successfully from ${host}:${port}`);
    res.json({ message: 'Registered successfully' });
  }

  // Future heartbeat reporting could go here if pushing instead of pulling
}

module.exports = new WorkerController();
