const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { AuthenticationError, AuthorizationError } = require('../../utils/errors');

const chunkAuth = (action) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AuthenticationError('Missing chunk token'));
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.WORKER.SECRET);
      
      // Check if action matches if it's explicitly set in token
      if (decoded.action && decoded.action !== action) {
        return next(new AuthorizationError(`Token not authorized for ${action}`));
      }

      // Ensure the token's chunkHash matches the requested chunk
      if (req.params.chunkHash && decoded.chunkHash !== req.params.chunkHash) {
        return next(new AuthorizationError('Token not valid for this chunk'));
      }

      // For uploads, we might have sessionId in token
      req.chunkContext = {
        sessionId: decoded.sessionId,
        chunkHash: decoded.chunkHash,
        workerId: decoded.workerId,
        chunkIndex: decoded.chunkIndex
      };
      
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AuthenticationError('Chunk token expired'));
      }
      return next(new AuthenticationError('Invalid chunk token'));
    }
  };
};

module.exports = chunkAuth;
