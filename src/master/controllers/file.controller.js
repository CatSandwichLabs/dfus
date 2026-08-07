const fileService = require('../services/file.service');

class FileController {
  async getDownloadManifest(req, res) {
    const { fileId } = req.params;
    const manifest = await fileService.getDownloadManifest(fileId, req.user.userId);
    res.json(manifest);
  }

  async listFiles(req, res) {
    const { parentId } = req.query;
    const files = await fileService.listFiles(req.user.userId, parentId);
    res.json({ files });
  }

  async getFile(req, res) {
    const { fileId } = req.params;
    const file = await fileService.getFile(fileId, req.user.userId);
    res.json(file);
  }

  async deleteFile(req, res) {
    const { fileId } = req.params;
    await fileService.deleteFile(fileId, req.user.userId);
    res.status(204).send();
  }

  async updateFile(req, res) {
    const { fileId } = req.params;
    const file = await fileService.updateFile(fileId, req.user.userId, req.body);
    res.json(file);
  }
}

module.exports = new FileController();
