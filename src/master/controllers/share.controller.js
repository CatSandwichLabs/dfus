const shareService = require('../services/share.service');

class ShareController {
  async accessSharedFile(req, res) {
    const { shareToken } = req.params;
    const { password } = req.body;
    const file = await shareService.accessSharedFile(shareToken, password);

    res.json({ message: 'Access granted', fileId: file._id, fileName: file.originalName, fileSize: file.size });
  }

  async createShareLink(req, res) {
    const { fileId } = req.params;
    const shareToken = await shareService.createShareLink(fileId, req.user.userId, req.body);
    res.status(201).json({ shareToken, url: `/share/${shareToken}` });
  }

  async revokeShareLink(req, res) {
    const { fileId } = req.params;
    await shareService.revokeShareLink(fileId, req.user.userId);
    res.status(204).send();
  }
}

module.exports = new ShareController();
