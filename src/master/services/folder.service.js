const { getDatabase } = require('../../repositories/database');
const { NotFoundError, ConflictError } = require('../../utils/errors');

class FolderService {
  constructor() {
    this.db = getDatabase();
  }

  async createFolder(userId, name, parentId = null) {
    // Basic cycle detection (prevent parent from being same as child is easy, full tree is harder, skip for now)
    return await this.db.createFolder({ userId, name, parentId });
  }

  async listFolders(userId, parentId = null) {
    // Only implemented in MongoMetadataRepo conceptually, let's assume it exists or write a quick fallback
    if (this.db.findFoldersByUserId) {
      return await this.db.findFoldersByUserId(userId, parentId);
    }
    return [];
  }

  async getFolder(folderId, userId) {
    const folder = await this.db.findFolderById(folderId);
    if (!folder || folder.userId.toString() !== userId) {
      throw new NotFoundError('Folder not found');
    }
    return folder;
  }

  async updateFolder(folderId, userId, updates) {
    const folder = await this.db.findFolderById(folderId);
    if (!folder || folder.userId.toString() !== userId) {
      throw new NotFoundError('Folder not found');
    }
    
    // Only allow name and parentId updates
    const updateObj = {};
    if (updates.name) updateObj.name = updates.name;
    if (updates.parentId !== undefined) updateObj.parentId = updates.parentId;
    
    return await this.db.updateFolder(folderId, updateObj);
  }

  async deleteFolder(folderId, userId) {
    const folder = await this.db.findFolderById(folderId);
    if (!folder || folder.userId.toString() !== userId) {
      throw new NotFoundError('Folder not found');
    }
    
    // Cascade delete could be complex, for now just delete the folder itself.
    // Files inside will become orphaned or moved to root.
    // Or we throw conflict if it's not empty.
    const files = await this.db.findFilesByUserId(userId, folderId);
    if (files && files.length > 0) {
      throw new ConflictError('Folder is not empty');
    }

    await this.db.deleteFolder(folderId);
  }
}

module.exports = new FolderService();
