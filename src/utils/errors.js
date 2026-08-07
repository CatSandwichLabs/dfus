class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class QuotaExceededError extends AppError {
  constructor(message = 'Storage limit exceeded') {
    super(message, 413, 'QUOTA_EXCEEDED');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT');
  }
}

class ChunkError extends AppError {
  constructor(message) {
    super(message, 500, 'CHUNK_ERROR');
  }
}

class StorageError extends AppError {
  constructor(message) {
    super(message, 500, 'STORAGE_ERROR');
  }
}

class WorkerError extends AppError {
  constructor(message) {
    super(message, 503, 'WORKER_ERROR');
  }
}

class ReplicationError extends AppError {
  constructor(message) {
    super(message, 500, 'REPLICATION_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  QuotaExceededError,
  RateLimitError,
  ChunkError,
  StorageError,
  WorkerError,
  ReplicationError
};
