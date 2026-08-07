const { UnauthorizedError } = require('../../utils/errors');

module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new UnauthorizedError('Admin access required');
  }
  next();
};
