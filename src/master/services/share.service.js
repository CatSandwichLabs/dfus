const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const qrcode = require('qrcode');
const { getDatabase } = require('../../repositories/database');
const { NotFoundError, AuthorizationError } = require('../../utils/errors');
const wss = require('./websocket.service'); // we'll implement this next

class ShareService {
  constructor() {
    this.db = getDatabase();
  }

  async createShareLink(fileId, userId, options) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');

    const shareToken = nanoid(10);
    const updateObj = {
      isPublic: true,
      shareToken,
      shareExpiresAt: options.expiresAt ? new Date(options.expiresAt) : null
    };

    if (options.password) {
      const salt = await bcrypt.genSalt(10);
      updateObj.sharePasswordHash = await bcrypt.hash(options.password, salt);
    } else {
      updateObj.sharePasswordHash = null;
    }

    await this.db.updateFile(fileId, updateObj);

    wss.broadcastToUser(userId, { type: 'SHARE_CREATED', fileId });

    return shareToken;
  }

  async revokeShareLink(fileId, userId) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');

    await this.db.updateFile(fileId, {
      isPublic: false,
      shareToken: null,
      sharePasswordHash: null,
      shareExpiresAt: null
    });
    
    wss.broadcastToUser(userId, { type: 'SHARE_REVOKED', fileId });
  }

  async accessSharedFile(shareToken, password = null) {
    // This is public access
    const file = await this.db.findFileByShareToken(shareToken);
    if (!file || !file.isPublic) throw new NotFoundError('Shared file not found');

    if (file.shareExpiresAt && new Date(file.shareExpiresAt) < new Date()) {
      throw new AuthorizationError('Share link expired');
    }

    if (file.sharePasswordHash) {
      if (!password) throw new AuthorizationError('Password required');
      const isValid = await bcrypt.compare(password, file.sharePasswordHash);
      if (!isValid) throw new AuthorizationError('Invalid password');
    }

    return file;
  }
  async getShareQR(token) {
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/share/${token}`;
    const qrPng = await qrcode.toBuffer(shareUrl, { type: 'png' });
    return qrPng;
  }

  async downloadShare(token, password = null) {
    const file = await this.accessSharedFile(token, password);
    if (this.db.incrementDownloadCount) {
      await this.db.incrementDownloadCount(file._id);
    }
    return file;
  }
}

module.exports = new ShareService();
