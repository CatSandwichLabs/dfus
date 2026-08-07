const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Determine logger
  const logger = req.app.get('logger') || console;

  let statusCode = 500;
  let response = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  };

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    response.error.code = err.code;
    response.error.message = err.message;
  } else {
    // If it's a generic Error, log the stack
    logger.error('Unhandled Exception:', err);
  }

  // In development, include stack trace
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
