const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../../repositories/database');
const { AuthenticationError, ConflictError, NotFoundError } = require('../../utils/errors');

class AccountService {
  constructor() {
    this.db = getDatabase();
  }

  async getProfile(userId) {
    const user = await this.db.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    const userObj = { ...user };
    delete userObj.passwordHash;
    delete userObj.twoFactorSecret;
    delete userObj.backupCodes;
    return userObj;
  }

  async updateUsername(userId, newUsername) {
    const existing = await this.db.findUserByUsername(newUsername);
    if (existing && existing._id.toString() !== userId) {
      throw new ConflictError('Username already taken');
    }
    await this.db.updateUser(userId, { username: newUsername });
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.db.findUserById(userId);
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new AuthenticationError('Invalid current password');

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    
    await this.db.updateUser(userId, { passwordHash });
  }

  async getSessions(userId) {
    return await this.db.getUserSessions(userId);
  }

  async revokeSession(userId, sessionId) {
    // Should verify session belongs to user, but let's assume valid UUIDs/OIDs don't conflict easily
    // Actually, we must check it.
    const sessions = await this.db.getUserSessions(userId);
    const s = sessions.find(session => session._id.toString() === sessionId);
    if (!s) throw new NotFoundError('Session not found');

    await this.db.revokeSession(sessionId);
  }

  async revokeAllSessions(userId, exceptSessionId) {
    await this.db.revokeAllUserSessions(userId, exceptSessionId);
  }

  async exportData(userId) {
    // Return mock file path for now since files and folders are complex
    const user = await this.db.findUserById(userId);
    const data = {
      profile: user,
      timestamp: new Date()
    };
    // Usually we would write this to a temp file and return the path
    const exportPath = path.join(__dirname, '../../../data/temp', `export_${userId}.json`);
    await fs.promises.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.promises.writeFile(exportPath, JSON.stringify(data, null, 2));
    
    return exportPath;
  }

  async deleteAccount(userId, password) {
    const user = await this.db.findUserById(userId);
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new AuthenticationError('Invalid password');

    // Cascade deletes should be queued or handled here
    // For now we just delete user. 
    await this.db.deleteUser(userId);
  }
}

module.exports = new AccountService();
