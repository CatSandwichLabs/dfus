const { getDatabase } = require('../../repositories/database');
const { NotFoundError } = require('../../utils/errors');

class TrashService {
  constructor() {
    this.db = getDatabase();
  }

  async listTrash(userId) {
    return await this.db.getTrashItemsByUserId(userId);
  }

  async moveToTrash(userId, itemId, type) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 day retention

    if (type === 'file') {
      const file = await this.db.findFileById(itemId);
      if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');
      await this.db.moveToTrash({ itemId, type, userId, originalFolderId: file.folderId, expiresAt });
      await this.db.updateFile(itemId, { status: 'trashed', folderId: null });
    } else if (type === 'folder') {
      const folder = await this.db.findFolderById(itemId);
      if (!folder || folder.userId.toString() !== userId) throw new NotFoundError('Folder not found');
      await this.db.moveToTrash({ itemId, type, userId, originalFolderId: folder.parentId, expiresAt });
      await this.db.updateFolder(itemId, { status: 'trashed', parentId: null });
    }
  }

  async restoreFromTrash(userId, trashId) {
    const trashItem = await this.db.getTrashItemById(trashId);
    if (!trashItem || trashItem.userId.toString() !== userId) throw new NotFoundError('Trash item not found');

    if (trashItem.type === 'file') {
      await this.db.updateFile(trashItem.itemId, { status: 'complete', folderId: trashItem.originalFolderId });
    } else {
      await this.db.updateFolder(trashItem.itemId, { status: 'active', parentId: trashItem.originalFolderId });
    }

    await this.db.deleteTrashItem(trashId);
  }
}

module.exports = new TrashService();
