const IMetadataRepository = require('../interfaces/IMetadataRepository');
const User = require('./models/User.model');
const File = require('./models/File.model');
const Folder = require('./models/Folder.model');
const Chunk = require('./models/Chunk.model');
const Worker = require('./models/Worker.model');
const UploadSession = require('./models/UploadSession.model');
const RefreshToken = require('./models/RefreshToken.model');
const ApiKey = require('./models/ApiKey.model');
const Version = require('./models/Version.model');
const Trash = require('./models/Trash.model');
const Activity = require('./models/Activity.model');
const Session = require('./models/Session.model');

class MongoMetadataRepo extends IMetadataRepository {
  // --- Users ---
  async createUser(userData) {
    const user = new User(userData);
    return await user.save();
  }
  
  async findUserById(userId) {
    return await User.findById(userId).lean();
  }
  
  async findUserByEmail(email) {
    return await User.findOne({ email: email.toLowerCase() }).lean();
  }
  
  async findUserByUsername(username) {
    return await User.findOne({ username }).lean();
  }
  
  async findUserByFirebaseUid(uid) {
    return await User.findOne({ firebaseUid: uid }).lean();
  }
  
  async updateUser(userId, updateData) {
    return await User.findByIdAndUpdate(userId, updateData, { new: true }).lean();
  }
  
  async deleteUser(userId) {
    return await User.findByIdAndDelete(userId).lean();
  }
  
  async getAllUsers(options = {}) {
    const { skip = 0, limit = 20 } = options;
    return await User.find().skip(skip).limit(limit).lean();
  }

  async getUserCount() {
    return await User.countDocuments();
  }

  async updateStorageUsed(userId, bytesDelta) {
    return await User.findByIdAndUpdate(userId, { $inc: { storageUsed: bytesDelta } }, { new: true }).lean();
  }

  // --- Files ---
  async createFile(fileData) {
    const file = new File(fileData);
    return await file.save();
  }
  
  async findFileById(fileId) {
    return await File.findById(fileId).lean();
  }
  
  async findFileByNameAndFolder(userId, name, folderId = null) {
    return await File.findOne({ userId, originalName: name, folderId }).lean();
  }
  
  async findFilesByUserId(userId, options = {}) {
    const { skip = 0, limit = 20, folderId, status } = options;
    const query = { userId };
    if (folderId !== undefined) query.folderId = folderId;
    if (status) query.status = status;
    return await File.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  }
  
  async findFileByShareToken(shareToken) {
    return await File.findOne({ shareToken, isPublic: true }).lean();
  }
  
  async updateFileStatus(fileId, status) {
    return await File.findByIdAndUpdate(fileId, { status }, { new: true }).lean();
  }
  
  async updateFileShareToken(fileId, shareData) {
    return await File.findByIdAndUpdate(fileId, shareData, { new: true }).lean();
  }

  async updateFile(fileId, updateData) {
    return await File.findByIdAndUpdate(fileId, updateData, { new: true }).lean();
  }
  
  async deleteFile(fileId) {
    return await File.findByIdAndDelete(fileId).lean();
  }
  
  async getAllFiles(options = {}) {
    const { skip = 0, limit = 20 } = options;
    return await File.find().skip(skip).limit(limit).lean();
  }
  
  async getFileCount() {
    return await File.countDocuments();
  }
  
  async getTotalStorageUsed() {
    const result = await File.aggregate([{ $group: { _id: null, total: { $sum: "$size" } } }]);
    return result[0]?.total || 0;
  }

  async searchFiles(userId, options = {}) {
    const { text, mimeType, minSize, maxSize, fromDate, toDate, tags, folderId, status, skip = 0, limit = 20 } = options;
    const query = { userId };
    
    if (text) {
      query.$text = { $search: text };
    }
    if (mimeType) query.mimeType = mimeType;
    if (minSize !== undefined || maxSize !== undefined) {
      query.size = {};
      if (minSize !== undefined) query.size.$gte = Number(minSize);
      if (maxSize !== undefined) query.size.$lte = Number(maxSize);
    }
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    if (tags && tags.length > 0) {
      query.tags = { $all: tags };
    }
    if (folderId !== undefined) {
      query.folderId = folderId === 'root' ? null : folderId;
    }
    if (status) {
      query.status = status;
    }

    const mQuery = File.find(query);
    if (text) {
      mQuery.sort({ score: { $meta: 'textScore' } });
    } else {
      mQuery.sort({ createdAt: -1 });
    }
    
    return await mQuery.skip(Number(skip)).limit(Number(limit)).lean();
  }

  async getTags(userId) {
    const result = await File.aggregate([
      { $match: { userId: userId, tags: { $exists: true, $not: { $size: 0 } } } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    return result.map(r => ({ tag: r._id, count: r.count }));
  }

  async incrementDownloadCount(fileId) {
    return await File.findByIdAndUpdate(fileId, { $inc: { downloadCount: 1 } }, { new: true }).lean();
  }

  // --- Folders ---
  async createFolder(folderData) {
    const folder = new Folder(folderData);
    return await folder.save();
  }

  async findFolderById(folderId) {
    return await Folder.findById(folderId).lean();
  }

  async findFoldersByUserId(userId, parentId = undefined) {
    const query = { userId };
    if (parentId !== undefined) query.parentId = parentId;
    return await Folder.find(query).lean();
  }

  async findFolderByNameAndParent(userId, name, parentId = null) {
    return await Folder.findOne({ userId, name, parentId }).lean();
  }

  async updateFolder(folderId, updateData) {
    return await Folder.findByIdAndUpdate(folderId, updateData, { new: true }).lean();
  }

  async deleteFolder(folderId) {
    return await Folder.findByIdAndDelete(folderId).lean();
  }

  async searchFolders(userId, options = {}) {
    const { text, folderId, skip = 0, limit = 20 } = options;
    const query = { userId };
    
    if (text) {
      query.name = { $regex: text, $options: 'i' };
    }
    if (folderId !== undefined) {
      query.parentId = folderId === 'root' ? null : folderId;
    }
    
    return await Folder.find(query).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean();
  }

  // --- Chunks ---
  async createChunk(chunkData) {
    const chunk = new Chunk(chunkData);
    return await chunk.save();
  }
  
  async findChunksByFileId(fileId) {
    return await Chunk.find({ fileId }).sort({ chunkIndex: 1 }).lean();
  }
  
  async findChunkByHash(chunkHash) {
    return await Chunk.findOne({ chunkHash }).lean();
  }
  
  async addWorkerToChunk(chunkHash, workerId) {
    return await Chunk.findOneAndUpdate(
      { chunkHash },
      { 
        $addToSet: { workerIds: workerId },
        $set: { status: 'replicated' } 
      },
      { new: true }
    ).lean();
  }
  
  async updateChunkWorkers(chunkId, workerIds) {
    return await Chunk.findByIdAndUpdate(chunkId, { workerIds }, { new: true }).lean();
  }
  
  async updateChunkStatus(chunkId, status) {
    return await Chunk.findByIdAndUpdate(chunkId, { status }, { new: true }).lean();
  }
  
  async deleteChunksByFileId(fileId) {
    return await Chunk.deleteMany({ fileId });
  }
  
  async getChunksByWorkerId(workerId) {
    return await Chunk.find({ workerIds: workerId }).lean();
  }
  
  async getOrphanedChunks() {
    return await Chunk.find({ refCount: 0 }).lean();
  }

  async getChunkRefCount(chunkHash) {
    const chunk = await Chunk.findOne({ chunkHash }).lean();
    return chunk ? chunk.refCount : 0;
  }

  async decrementChunkRefCount(chunkHash) {
    return await Chunk.findOneAndUpdate({ chunkHash }, { $inc: { refCount: -1 } }, { new: true }).lean();
  }
  
  // --- Workers ---
  async registerWorker(workerData) {
    const { workerId, host, port, publicUrl } = workerData;
    return await Worker.findOneAndUpdate(
      { workerId },
      { host, port, publicUrl, status: 'alive', lastHeartbeat: new Date() },
      { upsert: true, new: true }
    ).lean();
  }
  
  async findWorkerById(workerId) {
    return await Worker.findOne({ workerId }).lean();
  }
  
  async updateWorkerHeartbeat(workerId, metrics, publicUrl) {
    const updatePayload = { lastHeartbeat: new Date(), metrics, status: 'alive' };
    if (publicUrl) updatePayload.publicUrl = publicUrl;
    return await Worker.findOneAndUpdate(
      { workerId },
      updatePayload,
      { new: true }
    ).lean();
  }
  
  async updateWorkerStatus(workerId, status) {
    return await Worker.findOneAndUpdate({ workerId }, { status }, { new: true }).lean();
  }
  
  async getAllWorkers() {
    return await Worker.find().lean();
  }
  
  async getAliveWorkers() {
    return await Worker.find({ status: 'alive' }).lean();
  }
  
  async getDeadWorkers() {
    return await Worker.find({ status: 'dead' }).lean();
  }
  
  async removeWorker(workerId) {
    return await Worker.findOneAndDelete({ workerId }).lean();
  }
  
  // --- Refresh Tokens ---
  async createRefreshToken(tokenData) {
    const token = new RefreshToken(tokenData);
    return await token.save();
  }
  
  async findRefreshToken(tokenHash) {
    return await RefreshToken.findOne({ tokenHash }).lean();
  }
  
  async deleteRefreshToken(tokenHash) {
    return await RefreshToken.findOneAndDelete({ tokenHash }).lean();
  }
  
  async deleteAllUserRefreshTokens(userId) {
    return await RefreshToken.deleteMany({ userId });
  }
  
  async deleteExpiredTokens() {
    return await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });
  }

  // --- API Keys ---
  async createApiKey(keyData) {
    const key = new ApiKey(keyData);
    return await key.save();
  }

  async findApiKeyByHash(keyHash) {
    return await ApiKey.findOne({ keyHash }).lean();
  }

  async getApiKeysByUserId(userId) {
    return await ApiKey.find({ userId }).lean();
  }

  async revokeApiKey(keyId) {
    return await ApiKey.findByIdAndDelete(keyId).lean();
  }

  async updateApiKeyLastUsed(keyId) {
    return await ApiKey.findByIdAndUpdate(keyId, { lastUsedAt: new Date() }, { new: true }).lean();
  }

  // --- Login Sessions ---
  async createLoginSession(sessionData) {
    const session = new Session(sessionData);
    return await session.save();
  }

  async getUserSessions(userId) {
    return await Session.find({ userId }).lean();
  }

  async revokeSession(sessionId) {
    return await Session.findByIdAndDelete(sessionId).lean();
  }

  async revokeAllUserSessions(userId, exceptSessionId) {
    const query = { userId };
    if (exceptSessionId) {
      query._id = { $ne: exceptSessionId };
    }
    return await Session.deleteMany(query);
  }

  async cleanExpiredSessions() {
    return await Session.deleteMany({ expiresAt: { $lt: new Date() } });
  }

  // --- Upload Sessions ---
  async createSession(sessionData) {
    const session = new UploadSession(sessionData);
    return await session.save();
  }

  async findSessionById(sessionId) {
    return await UploadSession.findOne({ sessionId }).lean();
  }

  async updateSessionChunkStatus(sessionId, chunkIndex, status) {
    const updateKey = `chunkStatus.${chunkIndex}`;
    return await UploadSession.findOneAndUpdate(
      { sessionId },
      { $set: { [updateKey]: status } },
      { new: true }
    ).lean();
  }

  async deleteSession(sessionId) {
    return await UploadSession.findOneAndDelete({ sessionId }).lean();
  }
  
  // --- Trash ---
  async moveToTrash(trashData) {
    const trash = new Trash({
      originalId: trashData.itemId,
      userId: trashData.userId,
      originalParentId: trashData.originalFolderId,
      name: trashData.name,
      type: trashData.type,
      expiresAt: trashData.expiresAt
    });
    return await trash.save();
  }
  
  async getTrashItemsByUserId(userId) {
    return await Trash.find({ userId }).lean();
  }
  
  async getTrashItemById(id) {
    return await Trash.findById(id).lean();
  }
  
  async deleteTrashItem(id) {
    return await Trash.findByIdAndDelete(id).lean();
  }

  // --- Activities ---
  async logActivity(activityData) {
    const activity = new Activity(activityData);
    return await activity.save();
  }

  // --- Versions ---
  async countVersions(fileId) {
    return await Version.countDocuments({ fileId });
  }

  async createVersion(versionData) {
    const version = new Version(versionData);
    return await version.save();
  }
  
  async getVersions(fileId) {
    return await Version.find({ fileId }).sort({ versionNumber: -1 }).lean();
  }
  
  async getVersionById(versionId) {
    return await Version.findById(versionId).lean();
  }

  async updateChunksFileId(oldFileId, newFileId) {
    return await Chunk.updateMany({ fileId: oldFileId }, { $set: { fileId: newFileId } });
  }
  
  async deleteVersion(versionId) {
    return await Version.findByIdAndDelete(versionId).lean();
  }

  // --- Lifecycle ---
  async close() {
    // Handled by connection.js in this architecture, but we can implement it here to satisfy interface
    const connection = require('./connection');
    await connection.disconnect();
  }
}

module.exports = MongoMetadataRepo;
