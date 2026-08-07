const config = require('../../config/env');
const { AuthenticationError } = require('../../utils/errors');

/**
 * Middleware to authenticate requests from worker nodes
 * Expects 'x-worker-secret' header to match the configured WORKER_SECRET
 */
const workerAuth = (req, res, next) => {
  const workerSecret = req.headers['x-worker-secret'] || req.query.workerSecret;

  if (!workerSecret) {
    return next(new AuthenticationError('Worker secret is required'));
  }

  if (workerSecret !== config.WORKER.SECRET) {
    return next(new AuthenticationError('Invalid worker secret'));
  }

  next();
};

module.exports = workerAuth;
