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

// Singleton instance
const hashRing = new ConsistentHashRing();

module.exports = hashRing;
