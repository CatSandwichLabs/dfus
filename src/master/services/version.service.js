const { getDatabase } = require('../../repositories/database');
const { NotFoundError } = require('../../utils/errors');

class VersionService {
  constructor() {
    this.db = getDatabase();
  }

  async getVersions(userId, fileId) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');

    return file.versions || [];
  }

  async addVersion(userId, fileId, newVersionData) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');

    const newVersion = {
      version: (file.versions ? file.versions.length : 0) + 1,
      size: newVersionData.size,
      chunks: newVersionData.chunks,
      uploadedAt: new Date()
    };

    const versions = file.versions || [];
    versions.push(newVersion);

    await this.db.updateFile(fileId, { 
      versions,
      size: newVersionData.size, 
      chunks: newVersionData.chunks,
      updatedAt: new Date()
    });

    return newVersion;
  }
}

module.exports = new VersionService();
