const authService = require('../services/auth.service');

const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
};

class AuthController {
  async register(req, res) {
    const { username, email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.registerUser({ username, email, password });
    
    setRefreshTokenCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  }

  async login(req, res) {
    const { email, password } = req.body;
    const ip = req.ip;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    const result = await authService.loginUser(email, password, ip, userAgent);
    
    if (result.requires2FA) {
      return res.json({ requires2FA: true, tempToken: result.tempToken });
    }

    setRefreshTokenCookie(res, result.refreshToken);
    res.json({ user: result.user, accessToken: result.accessToken });
  }

  async verify2FALogin(req, res) {
    const { tempToken, code } = req.body;
    const ip = req.ip;
    const userAgent = req.get('User-Agent') || 'Unknown';

    const result = await authService.verify2FALogin(tempToken, code, ip, userAgent);
    
    setRefreshTokenCookie(res, result.refreshToken);
    res.json({ user: result.user, accessToken: result.accessToken });
  }

  async setup2FA(req, res) {
    const result = await authService.setup2FA(req.user.userId);
    res.json(result);
  }

  async verify2FASetup(req, res) {
    const { code } = req.body;
    const result = await authService.verify2FASetup(req.user.userId, code);
    res.json(result);
  }

  async disable2FA(req, res) {
    const { password, code } = req.body;
    await authService.disable2FA(req.user.userId, password, code);
    res.json({ message: '2FA disabled successfully' });
  }

  async refresh(req, res) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    const ip = req.ip;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    const result = await authService.refreshAccessToken(refreshToken, ip, userAgent);
    
    setRefreshTokenCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken });
  }

  async logout(req, res) {
    const refreshToken = req.cookies?.refreshToken;
    await authService.logoutUser(req.user?.userId, refreshToken, req.user?.sessionId);
    clearRefreshTokenCookie(res);
    res.json({ message: 'Logged out successfully' });
  }

  async createApiKey(req, res) {
    const { name, expiresAt } = req.body;
    const apiKey = await authService.createApiKey(req.user.userId, name, expiresAt);
    res.status(201).json({ apiKey, message: 'Store this API key safely. It will not be shown again.' });
  }

  async getApiKeys(req, res) {
    const keys = await authService.getApiKeys(req.user.userId);
    res.json({ apiKeys: keys });
  }

  async revokeApiKey(req, res) {
    const { id } = req.params;
    await authService.revokeApiKey(req.user.userId, id);
    res.json({ message: 'API key revoked' });
  }

  async getMe(req, res) {
    // We already have req.user from authenticate middleware. Let's fetch latest from DB just in case.
    const { getDatabase } = require('../../repositories/database');
    const user = await getDatabase().findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const userObj = { ...user };
    delete userObj.passwordHash;
    delete userObj.twoFactorSecret;
    delete userObj.backupCodes;
    res.json({ user: userObj });
  }
}

module.exports = new AuthController();
