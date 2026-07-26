'use strict';

/**
 * Central Express error handler.
 * Converts thrown errors into consistent JSON error responses.
 *
 * Errors can carry:
 *   - err.statusCode  (preferred)
 *   - err.status
 *   - defaults to 500
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'test') {
    process.stderr.write(`[ERROR] ${req.method} ${req.originalUrl} -> ${status}: ${message}\n`);
    if (status >= 500) {
      process.stderr.write(err.stack + '\n');
    }
  }

  res.status(status).json({
    error: {
      message,
      status,
    },
  });
}

module.exports = errorHandler;
