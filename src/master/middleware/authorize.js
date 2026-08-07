const { AuthorizationError } = require('../../utils/errors');

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return next(new AuthorizationError('INSUFFICIENT_ROLE'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AuthorizationError('INSUFFICIENT_ROLE'));
    }

    next();
  };
};

module.exports = authorize;
