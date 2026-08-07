class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(includeStack = false) {
    const payload = {
      code: this.code,
      message: this.message,
    };
    if (this.details) payload.details = this.details;
    if (includeStack && this.stack) payload.stack = this.stack;
    return payload;
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation error', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', details = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access forbidden', details = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

class QuotaExceededError extends AppError {
  constructor(message = 'Storage limit exceeded', details = null) {
    super(message, 413, 'QUOTA_EXCEEDED', details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details = null) {
    super(message, 429, 'RATE_LIMIT', details);
  }
}

class ChunkError extends AppError {
  constructor(message = 'Chunk processing error', details = null) {
    super(message, 500, 'CHUNK_ERROR', details);
  }
}

class StorageError extends AppError {
  constructor(message = 'Storage error', details = null) {
    super(message, 500, 'STORAGE_ERROR', details);
  }
}

class InternalServerError extends AppError {
  constructor(message = 'An unexpected internal error occurred', details = null) {
    super(message, 500, 'INTERNAL_ERROR', details);
  }
}

class WorkerError extends AppError {
  constructor(message = 'Worker node error', details = null) {
    super(message, 503, 'WORKER_ERROR', details);
  }
}

class CircuitBreakerError extends AppError {
  constructor(message = 'Circuit breaker open for worker node', details = null) {
    super(message, 503, 'CIRCUIT_BREAKER_OPEN', details);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details = null) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

class ReplicationError extends AppError {
  constructor(message = 'Replication error', details = null) {
    super(message, 500, 'REPLICATION_ERROR', details);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  QuotaExceededError,
  RateLimitError,
  ChunkError,
  StorageError,
  InternalServerError,
  WorkerError,
  CircuitBreakerError,
  ServiceUnavailableError,
  ReplicationError
};
