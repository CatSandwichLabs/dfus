class IStorageRepository {
  async connect() { throw new Error('Not implemented'); }
  async uploadChunk(chunkId, dataStream, size) { throw new Error('Not implemented'); }
  async downloadChunk(chunkId) { throw new Error('Not implemented'); }
  async deleteChunk(chunkId) { throw new Error('Not implemented'); }
}

module.exports = IStorageRepository;
