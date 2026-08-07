const config = require('../config/env');
const { AuthenticationError } = require('../utils/errors');

const workerAuth = (req, res, next) => {
  const workerSecret = req.headers['x-worker-secret'];
  
  if (!workerSecret || workerSecret !== config.WORKER.SECRET) {
    return next(new AuthenticationError('Invalid worker secret'));
  }
  
  next();
};

module.exports = workerAuth;
