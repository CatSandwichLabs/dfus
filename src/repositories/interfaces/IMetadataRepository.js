class IMetadataRepository {
  async connect() { throw new Error('Not implemented'); }
  async createUser(userData) { throw new Error('Not implemented'); }
  async findUserByEmail(email) { throw new Error('Not implemented'); }
  async findUserById(id) { throw new Error('Not implemented'); }
  async updateUser(id, updateData) { throw new Error('Not implemented'); }
  async registerWorker(workerData) { throw new Error('Not implemented'); }
  async getAllWorkers() { throw new Error('Not implemented'); }
  async getWorkerById(workerId) { throw new Error('Not implemented'); }
  async updateWorker(workerId, updateData) { throw new Error('Not implemented'); }
  async createFile(fileData) { throw new Error('Not implemented'); }
  async findFileById(id) { throw new Error('Not implemented'); }
  async findFileByNameAndFolder(userId, name, folderId = null) { throw new Error('Not implemented'); }
  async updateFile(id, updateData) { throw new Error('Not implemented'); }
  async getFilesByUserId(userId, folderId = null) { throw new Error('Not implemented'); }
  async deleteFile(id) { throw new Error('Not implemented'); }
  async createFolder(folderData) { throw new Error('Not implemented'); }
  async findFolderById(id) { throw new Error('Not implemented'); }
  async findFolderByNameAndParent(userId, name, parentId) { throw new Error('Not implemented'); }
  async updateFolder(id, updateData) { throw new Error('Not implemented'); }
  async getFoldersByUserId(userId, parentId = null) { throw new Error('Not implemented'); }
  async deleteFolder(id) { throw new Error('Not implemented'); }
  async searchFiles(userId, query) { throw new Error('Not implemented'); }
  async searchFolders(userId, query) { throw new Error('Not implemented'); }
  async getTags(userId) { throw new Error('Not implemented'); }
  async incrementDownloadCount(fileId) { throw new Error('Not implemented'); }
  async moveToTrash(trashData) { throw new Error('Not implemented'); }
  async getTrashItemsByUserId(userId) { throw new Error('Not implemented'); }
  async getTrashItemById(id) { throw new Error('Not implemented'); }
  async deleteTrashItem(id) { throw new Error('Not implemented'); }
  async createShare(shareData) { throw new Error('Not implemented'); }
  async getShareByToken(token) { throw new Error('Not implemented'); }
  async getShareByFileId(fileId) { throw new Error('Not implemented'); }
  async deleteShare(id) { throw new Error('Not implemented'); }
  async countVersions(fileId) { throw new Error('Not implemented'); }
  async createVersion(versionData) { throw new Error('Not implemented'); }
  async getVersions(fileId) { throw new Error('Not implemented'); }
  async getVersionById(versionId) { throw new Error('Not implemented'); }
  async updateChunksFileId(oldFileId, newFileId) { throw new Error('Not implemented'); }
  async deleteVersion(versionId) { throw new Error('Not implemented'); }
  async logActivity(activityData) { throw new Error('Not implemented'); }
}

module.exports = IMetadataRepository;
