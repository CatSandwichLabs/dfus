const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { getDatabase } = require('../../repositories/database');
const { AuthenticationError } = require('../../utils/errors');
const { hashString } = require('../../utils/hash');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    const db = getDatabase();

    if (apiKeyHeader) {
      const keyHash = hashString(apiKeyHeader);
      const apiKey = await db.findApiKeyByHash(keyHash);
      
      if (!apiKey) {
        return next(new AuthenticationError('Invalid API Key'));
      }
      
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return next(new AuthenticationError('API Key expired'));
      }

      const user = await db.findUserById(apiKey.userId);
      if (!user) {
        return next(new AuthenticationError('User associated with API key not found'));
      }

      await db.updateApiKeyLastUsed(apiKey._id);
      
      req.user = { userId: user._id, role: user.role, type: 'api-key' };
      return next();
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      let decoded;
      try {
        decoded = jwt.verify(token, config.JWT.ACCESS_SECRET);
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          return next(new AuthenticationError('TOKEN_EXPIRED'));
        }
        return next(new AuthenticationError('TOKEN_INVALID'));
      }

      if (decoded.type === '2fa_partial') {
        return next(new AuthenticationError('Access denied. Complete 2FA.'));
      }

      const user = await db.findUserById(decoded.userId);
      if (!user) {
        return next(new AuthenticationError('USER_NOT_FOUND'));
      }

      req.user = { userId: user._id, role: user.role, sessionId: decoded.sessionId, type: 'jwt' };
      return next();
    }

    return next(new AuthenticationError('NO_TOKEN'));
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
