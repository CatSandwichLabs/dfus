const ConsistentHash = require('../../src/master/services/consistentHash');

describe('ConsistentHash', () => {
  let hashRing;

  beforeEach(() => {
    hashRing = new ConsistentHash();
  });

  test('should add and remove nodes correctly', () => {
    hashRing.addNode('worker-1');
    hashRing.addNode('worker-2');
    
    expect(hashRing.nodes.size).toBe(2);
    expect(hashRing.ring.size).toBe(2 * hashRing.replicas);

    hashRing.removeNode('worker-1');
    expect(hashRing.nodes.size).toBe(1);
    expect(hashRing.ring.size).toBe(hashRing.replicas);
  });

  test('should distribute chunks consistently', () => {
    hashRing.addNode('worker-1');
    hashRing.addNode('worker-2');
    hashRing.addNode('worker-3');

    const nodeForChunkA = hashRing.getNode('chunk-123');
    const nodeForChunkB = hashRing.getNode('chunk-123');
    
    expect(nodeForChunkA).toBe(nodeForChunkB); // Hashing is deterministic
    expect(['worker-1', 'worker-2', 'worker-3']).toContain(nodeForChunkA);
  });
});
