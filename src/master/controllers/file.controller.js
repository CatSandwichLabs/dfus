const fileService = require('../services/file.service');
const previewService = require('../services/preview.service');

class FileController {
  async getDownloadManifest(req, res) {
    const { fileId } = req.params;
    const manifest = await fileService.getDownloadManifest(fileId, req.user.userId);
    res.json(manifest);
  }

  async listFiles(req, res) {
    const parentId = req.query.parentId || req.query.folderId || null;
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

  async getVersions(req, res) {
    const { fileId } = req.params;
    const versionService = require('../services/version.service');
    const versions = await versionService.getVersions(req.user.userId, fileId);
    res.json({ versions });
  }

  async restoreVersion(req, res) {
    const { fileId, versionId } = req.params;
    const versionService = require('../services/version.service');
    const file = await versionService.restoreVersion(req.user.userId, fileId, versionId);
    res.json(file);
  }

  async getPreview(req, res) {
    const { fileId } = req.params;
    const preview = await previewService.generatePreview(req.user.userId, fileId);
    res.json(preview);
  }
}

module.exports = new FileController();
