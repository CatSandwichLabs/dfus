const { getDatabase } = require('../../repositories/database');
const { NotFoundError, ConflictError } = require('../../utils/errors');
const trashService = require('./trash.service');

class FolderService {
  constructor() {
    this.db = getDatabase();
  }

  async createFolder(userId, name, parentId = null) {
    if (parentId) {
      const parent = await this.db.findFolderById(parentId);
      if (!parent || parent.userId.toString() !== userId) {
        throw new NotFoundError('Parent folder not found');
      }
      const path = await this.getFolderPath(userId, parentId);
      if (path.length >= 10) {
        throw new ConflictError('Max folder depth of 10 exceeded');
      }
    }

    const existing = await this.db.findFolderByNameAndParent(userId, name, parentId);
    if (existing) {
      throw new ConflictError('Folder with this name already exists in this location');
    }

    return await this.db.createFolder({ userId, name, parentId });
  }

  async listFolders(userId, parentId = null) {
    return await this.db.findFoldersByUserId(userId, parentId);
  }

  async getFolder(folderId, userId) {
    const folder = await this.db.findFolderById(folderId);
    if (!folder || folder.userId.toString() !== userId) {
      throw new NotFoundError('Folder not found');
    }
    return folder;
  }

  async getFolderPath(userId, folderId) {
    const path = [];
    let currentId = folderId;
    let depth = 0;
    while (currentId) {
      if (depth > 20) throw new ConflictError('Circular reference detected during path resolution');
      const folder = await this.db.findFolderById(currentId);
      if (!folder || folder.userId.toString() !== userId) {
        break; // Stop if not found or unauthorized
      }
      path.unshift({ id: folder._id, name: folder.name });
      currentId = folder.parentId;
      depth++;
    }
    return path;
  }

  async updateFolder(folderId, userId, updates) {
    const folder = await this.db.findFolderById(folderId);
    if (!folder || folder.userId.toString() !== userId) {
      throw new NotFoundError('Folder not found');
    }
    
    const updateObj = {};
    if (updates.name && updates.name !== folder.name) {
      const existing = await this.db.findFolderByNameAndParent(userId, updates.name, folder.parentId);
      if (existing) {
        throw new ConflictError('Folder with this name already exists in this location');
      }
      updateObj.name = updates.name;
    }
    
    if (Object.keys(updateObj).length > 0) {
      return await this.db.updateFolder(folderId, updateObj);
    }
    return folder;
  }

  async moveFolder(folderId, userId, newParentId) {
    const folder = await this.db.findFolderById(folderId);
    if (!folder || folder.userId.toString() !== userId) throw new NotFoundError('Folder not found');
    
    if (newParentId) {
       const newParent = await this.db.findFolderById(newParentId);
       if (!newParent || newParent.userId.toString() !== userId) throw new NotFoundError('Target folder not found');
       
       let currentId = newParentId;
       let depth = 1;
       while (currentId) {
          if (currentId.toString() === folderId.toString()) throw new ConflictError('Circular reference detected');
          const f = await this.db.findFolderById(currentId);
          currentId = f ? f.parentId : null;
          depth++;
          if (depth > 10) throw new ConflictError('Max folder depth of 10 exceeded');
       }
    }
    
    const existing = await this.db.findFolderByNameAndParent(userId, folder.name, newParentId);
    if (existing && existing._id.toString() !== folderId.toString()) {
       throw new ConflictError('Folder with this name already exists in target location');
    }
    
    return await this.db.updateFolder(folderId, { parentId: newParentId });
  }

  async deleteFolder(folderId, userId) {
    const folder = await this.db.findFolderById(folderId);
    if (!folder || folder.userId.toString() !== userId) {
      throw new NotFoundError('Folder not found');
    }
    
    await this._recursiveMoveToTrash(folderId, userId);
  }

  async _recursiveMoveToTrash(folderId, userId) {
     const children = await this.db.findFoldersByUserId(userId, folderId);
     for (const child of children) {
        await this._recursiveMoveToTrash(child._id, userId);
     }
     
     const files = await this.db.findFilesByUserId(userId, { folderId });
     for (const file of files) {
        await trashService.moveToTrash(userId, file._id, 'file');
     }
     
     await trashService.moveToTrash(userId, folderId, 'folder');
  }
}

module.exports = new FolderService();
