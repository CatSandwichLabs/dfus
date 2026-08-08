const jwt = require('jsonwebtoken');
const { getDatabase } = require('../../repositories/database');
const config = require('../../config/env');
const hashRing = require('../../services/consistentHash');
const { NotFoundError, AuthorizationError } = require('../../utils/errors');

class FileService {
  constructor() {
    this.db = getDatabase();
  }

  async getDownloadManifest(fileId, userId) {
    const file = await this.db.findFileById(fileId);
    if (!file) throw new NotFoundError('File not found');

    if (file.userId.toString() !== userId && !file.isPublic) {
      throw new AuthorizationError('Access denied');
    }

    if (file.status !== 'complete') {
      throw new Error('File upload is incomplete or failed');
    }

    // Get chunks
    const chunks = await this.db.findChunksByFileId(fileId);
    
    const manifest = {
      fileId: file._id,
      fileName: file.originalName,
      fileSize: file.size,
      mimeType: file.mimeType,
      merkleRoot: file.merkleRoot,
      chunks: []
    };

    for (const chunk of chunks) {
      const targetNode = chunk.workerIds && chunk.workerIds.length > 0 ? chunk.workerIds[0] : null;

      if (!targetNode) {
        throw new Error(`No active workers found in DB for chunk ${chunk.chunkHash}`);
      }

      const worker = await this.db.findWorkerById(targetNode);

      const token = jwt.sign(
        { action: 'read', chunkHash: chunk.chunkHash, workerId: targetNode },
        config.WORKER.SECRET,
        { expiresIn: '15m' }
      );

      manifest.chunks.push({
        index: chunk.chunkIndex,
        hash: chunk.chunkHash,
        size: chunk.size,
        url: worker.publicUrl ? `${worker.publicUrl}/chunks/${chunk.chunkHash}` : `http://${worker.host}:${worker.port}/chunks/${chunk.chunkHash}`,
        token
      });
    }

    // Sort chunks by index
    manifest.chunks.sort((a, b) => a.index - b.index);

    // Update download count (Analytics)
    await this.db.updateFile(fileId, { $inc: { downloadCount: 1 } });

    return manifest;
  }

  async listFiles(userId, parentFolderId = null) {
    return await this.db.findFilesByUserId(userId, parentFolderId);
  }

  async getFile(fileId, userId) {
    const file = await this.db.findFileById(fileId);
    if (!file || (file.userId.toString() !== userId && !file.isPublic)) {
      throw new NotFoundError('File not found');
    }
    return file;
  }

  async deleteFile(fileId, userId) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) {
      throw new NotFoundError('File not found');
    }

    // Move to trash or delete immediately depending on requirement
    // Stage 4 requires file CRUD. We'll mark as deleted and free quota.
    await this.db.deleteFile(fileId);

    // Free quota
    const user = await this.db.findUserById(userId);
    const newStorage = Math.max(0, (user.storageUsed || 0) - file.size);
    await this.db.updateUser(userId, { storageUsed: newStorage });

    // Note: Chunks remain until garbage collection via CleanupService.
  }

  async updateFile(fileId, userId, updates) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) {
      throw new NotFoundError('File not found');
    }

    const allowedUpdates = ['originalName', 'folderId', 'tags', 'isPublic'];
    const updateObj = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) updateObj[key] = updates[key];
    }

    return await this.db.updateFile(fileId, updateObj);
  }
}

module.exports = new FileService();
