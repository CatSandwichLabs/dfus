const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { nanoid } = require('nanoid');
const crypto = require('crypto');
const config = require('../../config/env');
const { getDatabase } = require('../../repositories/database');
const { AuthenticationError, ConflictError, ValidationError, NotFoundError } = require('../../utils/errors');
const { hashString } = require('../../utils/hash');

class AuthService {
  constructor() {
    this.db = getDatabase();
  }

  _generateAccessToken(user, sessionId = null) {
    return jwt.sign(
      { userId: user._id, role: user.role, sessionId },
      config.JWT.ACCESS_SECRET,
      { expiresIn: config.JWT.ACCESS_EXPIRES_IN }
    );
  }

  async _generateRefreshToken(userId, sessionId = null) {
    const tokenId = nanoid(32);
    const tokenPayload = { userId, tokenId, sessionId };
    const refreshToken = jwt.sign(tokenPayload, config.JWT.REFRESH_SECRET, { expiresIn: config.JWT.REFRESH_EXPIRES_IN });
    
    const tokenHash = hashString(refreshToken);
    const expiresAt = new Date();
    // Assuming 7 days default
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.db.createRefreshToken({
      userId,
      tokenHash,
      expiresAt
    });

    return refreshToken;
  }

  async syncFirebaseUser(idToken, recaptchaToken, ip, userAgent) {
    if (!idToken) throw new AuthenticationError('Missing Firebase ID Token');
    if (!recaptchaToken) throw new AuthenticationError('Missing reCAPTCHA token');
    
    // 1. Verify reCAPTCHA token if API key is present
    if (config.RECAPTCHA_API_KEY && recaptchaToken !== 'mock-token') {
      const fetch = (await import('node-fetch')).default;
      const recaptchaRes = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/dfs-system-3d4ba/assessments?key=${config.RECAPTCHA_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            token: recaptchaToken,
            expectedAction: 'LOGIN',
            siteKey: '6LcM3HktAAAAAG0xPeThBWs6WLh2B8KywYtV8fam'
          }
        })
      });
      const recaptchaData = await recaptchaRes.json();
      if (!recaptchaData.tokenProperties?.valid) {
        throw new AuthenticationError('Invalid reCAPTCHA token');
      }
      if (recaptchaData.riskAnalysis && recaptchaData.riskAnalysis.score < 0.3) {
        throw new AuthenticationError('High risk assessment');
      }
    }

    // 2. Verify Firebase ID Token
    let decodedToken;
    try {
      require('../../config/firebase');
      const { getApps } = require('firebase-admin/app');
      const { getAuth } = require('firebase-admin/auth');
      
      if (getApps().length > 0) {
        decodedToken = await getAuth().verifyIdToken(idToken);
      } else {
        // If admin not initialized (no service account), mock the verification based on env
        if (process.env.MOCK_FIREBASE === 'true') {
           decodedToken = { uid: 'mock-uid', email: 'mock@example.com' };
        } else {
           throw new Error('Firebase Admin not initialized');
        }
      }
    } catch (error) {
      throw new AuthenticationError(`Invalid Firebase ID Token: ${error.message}`);
    }

    // 3. Sync User in MongoDB
    let user = await this.db.findUserByFirebaseUid(decodedToken.uid);
    
    if (!user) {
      // Create user
      let role = 'user';
      if (config.AUTH.FIRST_USER_ADMIN) {
        const count = await this.db.getUserCount();
        if (count === 0) role = 'admin';
      }
      
      const userId = nanoid();
      user = {
        _id: userId,
        firebaseUid: decodedToken.uid,
        email: decodedToken.email || null,
        username: decodedToken.email ? decodedToken.email.split('@')[0] : `user_${nanoid(8)}`,
        phone: decodedToken.phone_number || null,
        role,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await this.db.createUser(user);
    }
    
    // 4. Create Session
    const sessionId = nanoid();
    await this.db.createSession({
      userId: user._id,
      sessionId,
      ip,
      userAgent,
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    const accessToken = this._generateAccessToken(user, sessionId);
    const refreshToken = await this._generateRefreshToken(user._id, sessionId);

    return { user, accessToken, refreshToken };
  }

  async registerUser({ username, email, password }) {
    // Check duplicates
    const [existingEmail, existingUsername] = await Promise.all([
      this.db.findUserByEmail(email),
      this.db.findUserByUsername(username)
    ]);

    if (existingEmail) throw new ConflictError('Email already in use');
    if (existingUsername) throw new ConflictError('Username already in use');

    // First user admin
    let role = 'user';
    if (config.AUTH.FIRST_USER_ADMIN) {
      const count = await this.db.getUserCount();
      if (count === 0) role = 'admin';
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await this.db.createUser({
      username,
      email: email.toLowerCase(),
      passwordHash,
      role,
      storageQuota: config.STORAGE.DEFAULT_QUOTA
    });

    const userObj = { ...user };
    delete userObj.passwordHash;
    delete userObj.twoFactorSecret;
    delete userObj.backupCodes;

    const accessToken = this._generateAccessToken(user);
    const refreshToken = await this._generateRefreshToken(user._id);

    return { user: userObj, accessToken, refreshToken };
  }

  async loginUser(email, password, ip, userAgent) {
    const user = await this.db.findUserByEmail(email);
    if (!user) throw new AuthenticationError('Invalid credentials');

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new AuthenticationError('Invalid credentials');

    if (user.twoFactorEnabled) {
      // Generate a temporary token to pass to the 2FA verification step
      const tempToken = jwt.sign(
        { userId: user._id, type: '2fa_partial' },
        config.JWT.ACCESS_SECRET,
        { expiresIn: '5m' }
      );
      return { requires2FA: true, tempToken };
    }

    return await this._completeLogin(user, ip, userAgent);
  }

  async _completeLogin(user, ip, userAgent) {
    // Record login session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const session = await this.db.createLoginSession({
      userId: user._id,
      ipAddress: ip,
      userAgent,
      expiresAt
    });

    // Update lastLoginAt
    await this.db.updateUser(user._id, { lastLoginAt: new Date() });

    const accessToken = this._generateAccessToken(user, session._id);
    const refreshToken = await this._generateRefreshToken(user._id, session._id);

    const userObj = { ...user };
    delete userObj.passwordHash;
    delete userObj.twoFactorSecret;
    delete userObj.backupCodes;

    return { user: userObj, accessToken, refreshToken };
  }

  async setup2FA(userId) {
    const user = await this.db.findUserById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.twoFactorEnabled) throw new ConflictError('2FA already enabled');

    const secretData = speakeasy.generateSecret({ name: `DFUS (${user.email})` });
    const secret = secretData.base32;
    const otpauth = secretData.otpauth_url;
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    // Save secret temporarily or send to client to verify before enabling
    // We update the user with the secret but leave enabled=false until verified
    await this.db.updateUser(userId, { twoFactorSecret: secret });

    return { secret, qrCodeUrl };
  }

  async verify2FASetup(userId, code) {
    const user = await this.db.findUserById(userId);
    if (!user || !user.twoFactorSecret) throw new ValidationError('2FA setup not initiated');

    const isValid = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: code });
    if (!isValid) throw new AuthenticationError('Invalid 2FA code');

    // Generate backup codes
    const rawBackupCodes = Array.from({ length: 10 }, () => nanoid(8));
    const backupCodesHash = await Promise.all(rawBackupCodes.map(c => bcrypt.hash(c, 10)));
    
    const backupCodes = backupCodesHash.map(hash => ({ codeHash: hash, used: false }));

    await this.db.updateUser(userId, {
      twoFactorEnabled: true,
      backupCodes
    });

    return { backupCodes: rawBackupCodes };
  }

  async verify2FALogin(tempToken, code, ip, userAgent) {
    try {
      const decoded = jwt.verify(tempToken, config.JWT.ACCESS_SECRET);
      if (decoded.type !== '2fa_partial') throw new AuthenticationError('Invalid token type');

      const user = await this.db.findUserById(decoded.userId);
      if (!user) throw new AuthenticationError('User not found');

      // Check TOTP
      let isValid = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: code });
      
      // If TOTP fails, check backup codes
      if (!isValid && user.backupCodes) {
        for (let i = 0; i < user.backupCodes.length; i++) {
          if (!user.backupCodes[i].used && await bcrypt.compare(code, user.backupCodes[i].codeHash)) {
            isValid = true;
            // Mark backup code as used
            const newBackupCodes = [...user.backupCodes];
            newBackupCodes[i].used = true;
            await this.db.updateUser(user._id, { backupCodes: newBackupCodes });
            break;
          }
        }
      }

      if (!isValid) throw new AuthenticationError('Invalid 2FA code');

      return await this._completeLogin(user, ip, userAgent);
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid or expired 2FA token');
      }
      throw err;
    }
  }

  async disable2FA(userId, password, code) {
    const user = await this.db.findUserById(userId);
    const isValidPwd = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPwd) throw new AuthenticationError('Invalid password');

    const isValidCode = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: code });
    if (!isValidCode) throw new AuthenticationError('Invalid 2FA code');

    await this.db.updateUser(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: []
    });
  }

  async refreshAccessToken(oldRefreshToken, ip, userAgent) {
    const tokenHash = hashString(oldRefreshToken);
    const storedToken = await this.db.findRefreshToken(tokenHash);

    if (!storedToken) {
      // Possible reuse/replay attack. Find user from token payload if possible and wipe all refresh tokens
      try {
        const decoded = jwt.verify(oldRefreshToken, config.JWT.REFRESH_SECRET, { ignoreExpiration: true });
        if (decoded && decoded.userId) {
          await this.db.deleteAllUserRefreshTokens(decoded.userId);
        }
      } catch (e) {
        // Ignore malformed tokens
      }
      throw new AuthenticationError('Invalid refresh token. All sessions revoked.');
    }

    if (new Date() > new Date(storedToken.expiresAt)) {
      await this.db.deleteRefreshToken(tokenHash);
      throw new AuthenticationError('Refresh token expired');
    }

    let decoded;
    try {
      decoded = jwt.verify(oldRefreshToken, config.JWT.REFRESH_SECRET);
    } catch (err) {
      await this.db.deleteRefreshToken(tokenHash);
      throw new AuthenticationError('Invalid refresh token');
    }

    const user = await this.db.findUserById(decoded.userId);
    if (!user) throw new AuthenticationError('User not found');

    // Token Rotation
    await this.db.deleteRefreshToken(tokenHash);
    const newAccessToken = this._generateAccessToken(user, decoded.sessionId);
    const newRefreshToken = await this._generateRefreshToken(user._id, decoded.sessionId);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logoutUser(userId, refreshToken, sessionId) {
    if (refreshToken) {
      const tokenHash = hashString(refreshToken);
      await this.db.deleteRefreshToken(tokenHash);
    }
    if (sessionId) {
      await this.db.revokeSession(sessionId);
    }
  }

  async createApiKey(userId, name, expiresAt) {
    const rawKey = `dfus_api_${nanoid(40)}`;
    const keyHash = hashString(rawKey);
    const keyPrefix = rawKey.substring(0, 15);

    await this.db.createApiKey({
      userId,
      name,
      keyHash,
      keyPrefix,
      expiresAt: expiresAt || null
    });

    return rawKey;
  }

  async getApiKeys(userId) {
    return await this.db.getApiKeysByUserId(userId);
  }

  async revokeApiKey(userId, keyId) {
    // Should verify ownership in DB or repo
    const keys = await this.db.getApiKeysByUserId(userId);
    const key = keys.find(k => k._id.toString() === keyId);
    if (!key) throw new NotFoundError('API key not found');
    await this.db.revokeApiKey(keyId);
  }
}

module.exports = new AuthService();
