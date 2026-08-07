const uploadService = require('../services/upload.service');

class UploadController {
  async initUpload(req, res) {
    const { fileName, fileSize, mimeType, folderId, tags, chunkHashes } = req.body;
    const result = await uploadService.initUploadSession(req.user.userId, {
      fileName, fileSize, mimeType, folderId, tags, chunkHashes
    });
    res.status(201).json(result);
  }

  async getStatus(req, res) {
    const { sessionId } = req.params;
    const status = await uploadService.getUploadStatus(sessionId, req.user.userId);
    res.json(status);
  }

  async finalizeUpload(req, res) {
    const { sessionId } = req.params;
    const { merkleRoot } = req.body;
    const file = await uploadService.finalizeUploadSession(sessionId, req.user.userId, merkleRoot);
    res.json({ message: 'Upload finalized', file });
  }

  async abortUpload(req, res) {
    const { sessionId } = req.params;
    await uploadService.abortUploadSession(sessionId, req.user.userId);
    res.json({ message: 'Upload aborted' });
  }
}

module.exports = new UploadController();
