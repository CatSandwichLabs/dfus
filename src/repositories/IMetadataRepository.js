/**
 * IMetadataRepository - Abstract Interface for Database Operations
 */
class IMetadataRepository {
  // --- Users ---
  async createUser(userData) { throw new Error('Not implemented'); }
  async findUserById(userId) { throw new Error('Not implemented'); }
  async findUserByEmail(email) { throw new Error('Not implemented'); }
  async findUserByUsername(username) { throw new Error('Not implemented'); }
  async updateUser(userId, updateData) { throw new Error('Not implemented'); }
  async deleteUser(userId) { throw new Error('Not implemented'); }
  async getAllUsers(options) { throw new Error('Not implemented'); }
  
  // --- Files ---
  async createFile(fileData) { throw new Error('Not implemented'); }
  async findFileById(fileId) { throw new Error('Not implemented'); }
  async findFilesByUserId(userId, options) { throw new Error('Not implemented'); }
  async findFileByShareToken(shareToken) { throw new Error('Not implemented'); }
  async updateFileStatus(fileId, status) { throw new Error('Not implemented'); }
  async updateFileShareToken(fileId, shareData) { throw new Error('Not implemented'); }
  async deleteFile(fileId) { throw new Error('Not implemented'); }
  async getAllFiles(options) { throw new Error('Not implemented'); }
  async getFileCount() { throw new Error('Not implemented'); }
  async getTotalStorageUsed() { throw new Error('Not implemented'); }
  
  // --- Chunks ---
  async createChunk(chunkData) { throw new Error('Not implemented'); }
  async findChunksByFileId(fileId) { throw new Error('Not implemented'); }
  async findChunkByHash(chunkHash) { throw new Error('Not implemented'); }
  async updateChunkWorkers(chunkId, workerIds) { throw new Error('Not implemented'); }
  async updateChunkStatus(chunkId, status) { throw new Error('Not implemented'); }
  async deleteChunksByFileId(fileId) { throw new Error('Not implemented'); }
  async getChunksByWorkerId(workerId) { throw new Error('Not implemented'); }
  async getOrphanedChunks() { throw new Error('Not implemented'); }
  
  // --- Workers ---
  async registerWorker(workerData) { throw new Error('Not implemented'); }
  async findWorkerById(workerId) { throw new Error('Not implemented'); }
  async updateWorkerHeartbeat(workerId, stats) { throw new Error('Not implemented'); }
  async updateWorkerStatus(workerId, status) { throw new Error('Not implemented'); }
  async getAllWorkers() { throw new Error('Not implemented'); }
  async getAliveWorkers() { throw new Error('Not implemented'); }
  async getDeadWorkers() { throw new Error('Not implemented'); }
  async removeWorker(workerId) { throw new Error('Not implemented'); }
  
  // --- Refresh Tokens ---
  async createRefreshToken(tokenData) { throw new Error('Not implemented'); }
  async findRefreshToken(token) { throw new Error('Not implemented'); }
  async deleteRefreshToken(token) { throw new Error('Not implemented'); }
  async deleteAllUserRefreshTokens(userId) { throw new Error('Not implemented'); }
  async deleteExpiredTokens() { throw new Error('Not implemented'); }
}

module.exports = IMetadataRepository;
