const folderService = require('../services/folder.service');

class FolderController {
  async createFolder(req, res) {
    const { name, parentId } = req.body;
    const folder = await folderService.createFolder(req.user.userId, name, parentId);
    res.status(201).json(folder);
  }

  async listFolders(req, res) {
    const { parentId } = req.query;
    const folders = await folderService.listFolders(req.user.userId, parentId);
    res.json({ folders });
  }

  async getFolder(req, res) {
    const { folderId } = req.params;
    const folder = await folderService.getFolder(folderId, req.user.userId);
    res.json(folder);
  }

  async getFolderPath(req, res) {
    const { folderId } = req.params;
    const path = await folderService.getFolderPath(req.user.userId, folderId);
    res.json({ path });
  }

  async updateFolder(req, res) {
    const { folderId } = req.params;
    const folder = await folderService.updateFolder(folderId, req.user.userId, req.body);
    res.json(folder);
  }

  async moveFolder(req, res) {
    const { folderId } = req.params;
    const { parentId } = req.body;
    const folder = await folderService.moveFolder(folderId, req.user.userId, parentId);
    res.json(folder);
  }

  async deleteFolder(req, res) {
    const { folderId } = req.params;
    await folderService.deleteFolder(folderId, req.user.userId);
    res.status(204).send();
  }
}

module.exports = new FolderController();
