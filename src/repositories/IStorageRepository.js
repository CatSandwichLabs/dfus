/**
 * IStorageRepository - Abstract Interface for Chunk Storage
 */
class IStorageRepository {
  /**
   * Store a chunk of data
   * @param {string} chunkHash 
   * @param {Buffer} dataBuffer 
   * @returns {Promise<void>}
   */
  async storeChunk(chunkHash, dataBuffer) { throw new Error('Not implemented'); }

  /**
   * Retrieve a chunk of data
   * @param {string} chunkHash 
   * @returns {Promise<Buffer>}
   */
  async retrieveChunk(chunkHash) { throw new Error('Not implemented'); }

  /**
   * Delete a chunk of data
   * @param {string} chunkHash 
   * @returns {Promise<void>}
   */
  async deleteChunk(chunkHash) { throw new Error('Not implemented'); }

  /**
   * Check if a chunk exists
   * @param {string} chunkHash 
   * @returns {Promise<boolean>}
   */
  async chunkExists(chunkHash) { throw new Error('Not implemented'); }

  /**
   * Get storage statistics
   * @returns {Promise<{ totalChunks: number, totalBytes: number }>}
   */
  async getStorageStats() { throw new Error('Not implemented'); }
}

module.exports = IStorageRepository;
