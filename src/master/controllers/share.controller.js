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
  async getShareQR(req, res) {
    const { shareToken } = req.params;
    const qrBuffer = await shareService.getShareQR(shareToken);
    res.set('Content-Type', 'image/png');
    res.send(qrBuffer);
  }

  async downloadShare(req, res) {
    const { shareToken } = req.params;
    const { password } = req.query; // password via query for simple download links, or body
    const file = await shareService.downloadShare(shareToken, password);
    
    // Usually here we would start streaming the file from the worker
    // For now we just return file metadata to indicate success
    res.json({ message: 'Download started', fileId: file._id, fileName: file.originalName, fileSize: file.size });
  }
}

module.exports = new ShareController();
