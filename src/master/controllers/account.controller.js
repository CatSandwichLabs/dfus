const accountService = require('../services/account.service');
const fs = require('fs');

class AccountController {
  async getProfile(req, res) {
    const profile = await accountService.getProfile(req.user.userId);
    res.json(profile);
  }

  async updateProfile(req, res) {
    const { username } = req.body;
    await accountService.updateUsername(req.user.userId, username);
    res.json({ message: 'Profile updated' });
  }

  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    await accountService.changePassword(req.user.userId, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  }

  async getSessions(req, res) {
    const sessions = await accountService.getSessions(req.user.userId);
    res.json({ sessions });
  }

  async revokeSession(req, res) {
    const { id } = req.params;
    await accountService.revokeSession(req.user.userId, id);
    res.json({ message: 'Session revoked' });
  }

  async revokeAllSessions(req, res) {
    await accountService.revokeAllSessions(req.user.userId, req.user.sessionId);
    res.json({ message: 'All other sessions revoked' });
  }

  async exportData(req, res) {
    const exportPath = await accountService.exportData(req.user.userId);
    res.download(exportPath, 'dfus_export.json', (err) => {
      if (!err) {
        // Cleanup after download
        fs.unlink(exportPath, () => {});
      }
    });
  }

  async deleteAccount(req, res) {
    const { password } = req.body;
    await accountService.deleteAccount(req.user.userId, password);
    res.json({ message: 'Account deleted' });
  }
}

module.exports = new AccountController();
