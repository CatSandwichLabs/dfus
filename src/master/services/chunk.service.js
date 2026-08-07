const { getDatabase } = require('../../repositories/database');
const hashRing = require('../../services/consistentHash');

class ChunkService {
  constructor() {
    this.db = getDatabase();
  }

  allocateWorkers(totalChunks) {
    const chunkAllocations = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkId = `chunk_${Date.now()}_${i}`;
      const primaryWorkerId = hashRing.getNode(chunkId);
      
      // Select replica workers
      const allWorkers = hashRing.getAllNodes();
      const replicas = allWorkers
        .filter(w => w !== primaryWorkerId)
        .slice(0, 2); // 2 replicas
      
      chunkAllocations.push({
        chunkIndex: i,
        chunkId,
        primaryWorker: primaryWorkerId,
        replicas
      });
    }
    return chunkAllocations;
  }
}

module.exports = new ChunkService();
