const crypto = require('crypto');

class ConsistentHashRing {
  constructor(virtualNodes = 150) {
    this.ring = new Map();
    this.sortedKeys = [];
    this.virtualNodes = virtualNodes;
    this.nodes = new Set();
  }

  _hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  addNode(nodeId) {
    if (this.nodes.has(nodeId)) return;
    this.nodes.add(nodeId);

    for (let i = 0; i < this.virtualNodes; i++) {
      const vNodeKey = this._hash(`${nodeId}:${i}`);
      this.ring.set(vNodeKey, nodeId);
      this.sortedKeys.push(vNodeKey);
    }
    this.sortedKeys.sort();
  }

  removeNode(nodeId) {
    if (!this.nodes.has(nodeId)) return;
    this.nodes.delete(nodeId);

    this.sortedKeys = [];
    for (const [key, val] of this.ring.entries()) {
      if (val === nodeId) {
        this.ring.delete(key);
      } else {
        this.sortedKeys.push(key);
      }
    }
    this.sortedKeys.sort();
  }

  getNode(key) {
    if (this.ring.size === 0) return null;
    const hash = this._hash(key);
    
    // Binary search for the first key >= hash
    let left = 0;
    let right = this.sortedKeys.length - 1;
    let idx = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedKeys[mid] >= hash) {
        idx = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // Wrap around to 0 if not found
    if (idx === -1) idx = 0;
    
    return this.ring.get(this.sortedKeys[idx]);
  }
  
  // Get N unique distinct nodes for replication
  getNodes(key, count) {
    if (this.ring.size === 0) return [];
    if (this.nodes.size <= count) return Array.from(this.nodes);

    const hash = this._hash(key);
    let left = 0;
    let right = this.sortedKeys.length - 1;
    let idx = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedKeys[mid] >= hash) {
        idx = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    if (idx === -1) idx = 0;

    const selectedNodes = new Set();
    let currentIdx = idx;
    
    while (selectedNodes.size < count) {
      const node = this.ring.get(this.sortedKeys[currentIdx]);
      selectedNodes.add(node);
      currentIdx = (currentIdx + 1) % this.sortedKeys.length;
    }

    return Array.from(selectedNodes);
  }
}

// --- Serverless-Compatible Hash Ring ---
// In serverless mode, memory is wiped between requests.
// This factory function rebuilds the ring from a list of worker IDs.

/**
 * Build a fresh ConsistentHashRing from an array of worker IDs.
 * Call this per-request in serverless mode.
 * 
 * @param {string[]} workerIds - Array of alive worker IDs from the database.
 * @returns {ConsistentHashRing} A fully populated hash ring.
 */
function buildRingFromWorkers(workerIds) {
  const ring = new ConsistentHashRing();
  for (const id of workerIds) {
    ring.addNode(id);
  }
  return ring;
}

/**
 * Get a hash ring populated with alive workers from the database.
 * Works in both serverless (rebuilds each time) and local (uses cached ring).
 * 
 * @param {object} db - The database instance (from getDatabase())
 * @returns {Promise<ConsistentHashRing>} A populated hash ring.
 */
async function getPopulatedRing(db) {
  const workers = await db.getAllWorkers();
  const aliveWorkerIds = workers
    .filter(w => w.status === 'alive')
    .map(w => w.workerId || w.id || w._id);
  return buildRingFromWorkers(aliveWorkerIds);
}

// Singleton instance (used by local dev mode and backward compatibility)
const hashRing = new ConsistentHashRing();

module.exports = hashRing;
module.exports.ConsistentHashRing = ConsistentHashRing;
module.exports.buildRingFromWorkers = buildRingFromWorkers;
module.exports.getPopulatedRing = getPopulatedRing;
