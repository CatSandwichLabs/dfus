const { getDatabase } = require('../../repositories/database');
const { NotFoundError, ConflictError } = require('../../utils/errors');

class VersionService {
  constructor() {
    this.db = getDatabase();
  }

  async getVersions(userId, fileId) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');

    return await this.db.getVersions(fileId);
  }

  async restoreVersion(userId, fileId, versionId) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');

    const version = await this.db.getVersionById(versionId);
    if (!version || version.fileId.toString() !== fileId.toString()) throw new NotFoundError('Version not found');

    // 1. Create a new Version record to store the CURRENT file state
    const versionsCount = await this.db.countVersions(fileId);
    const newVersionRecord = await this.db.createVersion({
      fileId: file._id,
      versionNumber: versionsCount + 1,
      size: file.size,
      merkleRoot: file.merkleRoot || ''
    });

    // 2. Move CURRENT chunks to the new version record
    await this.db.updateChunksFileId(file._id, newVersionRecord._id);

    // 3. Move the OLD chunks from the version being restored to the CURRENT file
    await this.db.updateChunksFileId(version._id, file._id);

    // 4. Update the CURRENT file's size and merkleRoot to match the restored version
    await this.db.updateFile(file._id, {
      size: version.size,
      merkleRoot: version.merkleRoot
    });
    
    // 5. Delete the old version record as its chunks are now on the main file
    await this.db.deleteVersion(version._id);

    return await this.db.findFileById(file._id);
  }
}

module.exports = new VersionService();
