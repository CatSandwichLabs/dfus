const { getDatabase } = require('../../repositories/database');
const { NotFoundError } = require('../../utils/errors');
const jwt = require('jsonwebtoken');

class DownloadService {
  constructor() {
    this.db = getDatabase();
  }

  async getDownloadManifest(userId, fileId) {
    const file = await this.db.findFileById(fileId);
    
    // In a real application we would check if the file is shared publicly,
    // but for now we enforce ownership unless public access is handled elsewhere.
    if (!file || (file.userId.toString() !== userId && !file.isPublic)) {
      throw new NotFoundError('File not found');
    }

    const chunkTokens = file.chunks.map(chunk => {
      const token = jwt.sign({
        userId,
        fileId,
        chunkId: chunk.chunkId,
        action: 'read'
      }, process.env.WORKER_JWT_SECRET, { expiresIn: '1h' });

      return {
        chunkId: chunk.chunkId,
        workerUrl: chunk.primaryWorkerPublicUrl ? chunk.primaryWorkerPublicUrl : `http://${chunk.primaryWorkerHost}:${chunk.primaryWorkerPort}`, // Should lookup worker from db
        token
      };
    });

    return {
      fileId: file._id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      chunks: chunkTokens
    };
  }
}

module.exports = new DownloadService();
