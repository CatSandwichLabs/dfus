const { AppError } = require('../utils/errors');
const config = require('../config/env');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Determine logger
  const logger = req.app.get('logger') || console;

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details || null;
  } else if (err.name === 'MulterError') {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'QUOTA_EXCEEDED' : 'VALIDATION_ERROR';
    message = err.message;
  } else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON in request body';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = err.message || 'Invalid authentication token';
  } else {
    statusCode = err.statusCode || 500;
    code = err.code || 'INTERNAL_ERROR';
    message = err.message || 'An unexpected error occurred';
  }

  const response = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url
    }
  };

  const isDev = config.NODE_ENV === 'development' || process.env.NODE_ENV === 'development';
  if (isDev && err.stack) {
    response.error.stack = err.stack;
  }

  const logContext = {
    statusCode,
    code,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip
  };

  if (statusCode >= 500) {
    if (typeof logger.error === 'function') {
      logger.error(`[${statusCode}] ${req.method} ${req.originalUrl || req.url} - ${message}`, {
        ...logContext,
        stack: err.stack
      });
    } else {
      console.error(`[${statusCode}] ${req.method} ${req.originalUrl || req.url} - ${message}`, err.stack);
    }
  } else {
    if (typeof logger.warn === 'function') {
      logger.warn(`[${statusCode}] ${req.method} ${req.originalUrl || req.url} - ${message}`, logContext);
    } else {
      console.warn(`[${statusCode}] ${req.method} ${req.originalUrl || req.url} - ${message}`);
    }
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
