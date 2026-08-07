# Handoff Report — Error Handling, Custom Errors & Winston Logging Analysis (M1)

## 1. Observation

Direct examination of the error handling, custom error classes, logging configuration, and server wiring across `src/` revealed the following exact file locations, code snippets, and behaviors:

### 1.1 Custom Error Classes (`src/utils/errors.js`)
- **File**: `c:\Users\xavir\OneDrive\Desktop\DFUS\src\utils\errors.js` (91 lines)
- **Current Code**:
  - `AppError` constructor (lines 1-8):
    ```javascript
    class AppError extends Error {
      constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
      }
    }
    ```
  - Subclasses defined: `ValidationError` (400, `'VALIDATION_ERROR'`), `AuthenticationError` (401, `'UNAUTHORIZED'`), `AuthorizationError` (403, `'FORBIDDEN'`), `NotFoundError` (404, `'NOT_FOUND'`), `ConflictError` (409, `'CONFLICT'`), `QuotaExceededError` (413, `'QUOTA_EXCEEDED'`), `RateLimitError` (429, `'RATE_LIMIT'`), `ChunkError` (500, `'CHUNK_ERROR'`), `StorageError` (500, `'STORAGE_ERROR'`), `WorkerError` (503, `'WORKER_ERROR'`), `ReplicationError` (500, `'REPLICATION_ERROR'`).
- **Deficiencies Observed**:
  - `AppError` lacks support for a `details` parameter (e.g. array of validation items or payload metadata).
  - Subclasses like `ValidationError` (lines 11-15) only take `(message)` and cannot attach detailed field error objects.
  - Lacks common operational HTTP error classes: `BadRequestError` (400), `InternalServerError` (500), `CircuitBreakerError` (503), `ServiceUnavailableError` (503).
  - Lacks a standardized `toJSON()` method or serialization helper on `AppError`.

### 1.2 Centralized Error Handling Middleware (`src/middleware/errorHandler.js`)
- **File**: `c:\Users\xavir\OneDrive\Desktop\DFUS\src\middleware\errorHandler.js` (37 lines)
- **Current Code**:
  ```javascript
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
  ```
- **Deficiencies Observed**:
  - **CRITICAL BUG (Line 19-26)**: If `err instanceof AppError`, **NO LOGGING OCCURS**. `logger.error` or `logger.warn` is skipped entirely for operational errors (`StorageError`, `ChunkError`, `WorkerError`, `ValidationError`, etc.). Operational failures are completely invisible in Winston log files.
  - **Logger fallback bug (Line 9)**: Calls `req.app.get('logger')`, but neither `src/master/server.js` nor `src/worker/server.js` executes `app.set('logger', logger)`. Consequently `req.app.get('logger')` evaluates to `undefined` and falls back to standard `console`.
  - Missing `details` field mapping into `response.error.details`.
  - Unhandled non-AppError instances (e.g. Multer errors like `LIMIT_FILE_SIZE`, `SyntaxError` from invalid JSON body parser payloads, JWT errors) fall through to status 500 `'INTERNAL_ERROR'` with message `'An unexpected error occurred'`.

### 1.3 Winston Logging Configuration (`src/utils/logger.js`)
- **File**: `c:\Users\xavir\OneDrive\Desktop\DFUS\src\utils\logger.js` (55 lines)
- **Current Code**:
  - `createLogger(serviceName)` creates transports for Console, `data/logs/${serviceName}.log`, and `data/logs/error.log`.
- **Deficiencies Observed**:
  - Does NOT ensure that `data/logs` directory exists before constructing `winston.transports.File`. If `data/logs` does not exist on disk, file logging fails or crashes.
  - Log format inconsistency: Console transport uses `timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })`, while File transports use default ISO `timestamp()`.
  - Does not export helper function or middleware for HTTP request logging.

### 1.4 HTTP Request Logging & Middleware Wiring (`src/master/server.js` & `src/worker/server.js`)
- **Files**: `src/master/server.js` (lines 15, 23, 59) & `src/worker/server.js` (lines 14, 22, 80)
- **Current Code**:
  - `master/server.js`: `app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));`
  - `worker/server.js`: `app.use(morgan('tiny', { stream: { write: msg => logger.info(msg.trim()) } }));`
- **Deficiencies Observed**:
  - Inconsistent Morgan log formats (`combined` vs `tiny`).
  - Neither server calls `app.set('logger', logger)`.
  - Neither server has a 404 catch-all middleware registered prior to `app.use(errorHandler)`, causing unknown routes to return default Express HTML 404 pages instead of structured JSON error objects.
  - `src/worker/server.js` lines 41 and 58 contain manual inline error responses `return res.status(400).json(...)` / `res.status(404).json(...)` instead of delegating to `next(new ValidationError(...))` / `next(new NotFoundError(...))`.

---

## 2. Logic Chain

1. **Structured JSON Error Responses**:
   - Observations show `errorHandler.js` returns `{ error: { code, message, stack? } }`.
   - To make responses fully structured and clear across all status codes:
     - Expand `AppError` and subclasses in `src/utils/errors.js` to accept `details` metadata (e.g., validation issues object/array).
     - Include `details`, ISO `timestamp`, and `path` in `response.error`.
     - Normalize 3rd party errors (Multer, `SyntaxError` body parser, JWT) to return proper HTTP status codes (400/401/413) instead of leaking generic 500 errors.
     - Add 404 catch-all middleware before `errorHandler` so unmapped routes return standardized JSON errors.

2. **Winston Logging (HTTP requests, errors, system events)**:
   - Observations show `AppError` instances are currently ignored by logger in `errorHandler.js` line 19.
   - Observations show `req.app.get('logger')` returns `undefined` because `app.set('logger', logger)` was omitted in `master/server.js` and `worker/server.js`.
   - Therefore, to ensure Winston logs all HTTP requests, errors, and system events with timestamps and log levels:
     - `src/utils/logger.js` must ensure `data/logs/` directory exists using `fs.mkdirSync`.
     - `src/utils/logger.js` should export an `httpLogger` stream/middleware wrapper so HTTP request logs flow consistently into Winston with ISO timestamps and level `info`.
     - `master/server.js` and `worker/server.js` MUST execute `app.set('logger', logger)` and `app.use(httpLogger)`.
     - `errorHandler.js` MUST log ALL errors: 4xx errors logged as `logger.warn` or `logger.info`, and 5xx errors logged as `logger.error` with stack, method, path, IP, and status code.

3. **Implementation Plan & Code Specifications**:
   - Direct step-by-step implementation code for `src/utils/errors.js`, `src/middleware/errorHandler.js`, `src/utils/logger.js`, `src/master/server.js`, and `src/worker/server.js`.

---

## 3. Caveats

- **No Caveats**: All error classes, middleware, loggers, and server entry points were inspected directly from source files.
- Testing environment assumption: `process.env.NODE_ENV` is set to `'development'` in local dev/tests (which includes stack traces in error responses) and `'production'` or `'test'` in production environments (which suppresses stack traces).

---

## 4. Conclusion & Concrete Implementation Plan

To satisfy Milestone M1 requirements and establish baseline error handling and logging infrastructure, the Worker agent must apply the following exact changes:

### Fix Plan for Worker Agent

#### Step 1: Update `src/utils/errors.js`
Update `AppError` to accept `details` and add missing error classes (`BadRequestError`, `InternalServerError`, `CircuitBreakerError`, `ServiceUnavailableError`).

```javascript
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
  constructor(message = 'Resource conflict') {
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
  constructor(message = 'Circuit breaker open for worker node') {
    super(message, 503, 'CIRCUIT_BREAKER_OPEN');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
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
```

#### Step 2: Refactor `src/middleware/errorHandler.js`
Ensure ALL errors are logged via Winston logger, structured JSON error responses are sent, and 3rd party errors (Multer, JSON SyntaxError) are normalized.

```javascript
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Retrieve bound Winston logger or fallback to console
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
    // Standard JS / unexpected runtime error
    message = err.message || 'An unexpected error occurred';
  }

  // Construct structured JSON error payload
  const errorResponse = {
    error: {
      code,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url
    }
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // Log error using Winston with proper log level & metadata
  const logContext = {
    statusCode,
    code,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip
  };

  if (statusCode >= 500) {
    logger.error(`[${statusCode}] ${req.method} ${req.originalUrl || req.url} - ${message}`, {
      ...logContext,
      stack: err.stack
    });
  } else {
    logger.warn(`[${statusCode}] ${req.method} ${req.originalUrl || req.url} - ${message}`, logContext);
  }

  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;
```

#### Step 3: Enhance `src/utils/logger.js`
Ensure log directory creation, format consistency, and export of HTTP request logging middleware helper.

```javascript
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const config = require('../config/env');

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Ensure log directory exists
const logsDir = path.join(__dirname, '../../data/logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Console output formatter
const consoleFormat = printf(({ level, message, timestamp, service, stack, ...meta }) => {
  let log = `${timestamp} [${service}] ${level}: ${message}`;
  if (Object.keys(meta).length) {
    log += ` ${JSON.stringify(meta)}`;
  }
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

function createLogger(serviceName) {
  const transports = [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      )
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, `${serviceName}.log`),
      format: combine(timestamp(), json())
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: combine(timestamp(), json())
    })
  ];

  return winston.createLogger({
    level: config.SYSTEM.LOG_LEVEL || 'info',
    defaultMeta: { service: serviceName },
    format: errors({ stack: true }),
    transports
  });
}

function createHttpLogger(logger) {
  return morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  });
}

module.exports = {
  createLogger,
  createHttpLogger
};
```

#### Step 4: Wire Logger and 404 Handler in `src/master/server.js` and `src/worker/server.js`

- **In `src/master/server.js`**:
  ```javascript
  const { createLogger, createHttpLogger } = require('../utils/logger');
  const { NotFoundError } = require('../utils/errors');
  const logger = createLogger('master');
  const app = express();
  app.set('logger', logger);

  // Use HTTP logger middleware
  app.use(createHttpLogger(logger));

  // ... (routes) ...

  // 404 Handler
  app.use((req, res, next) => {
    next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
  });

  // Centralized Error Handler (must be last)
  app.use(errorHandler);
  ```

- **In `src/worker/server.js`**:
  ```javascript
  const { createLogger, createHttpLogger } = require('../utils/logger');
  const { NotFoundError, ValidationError } = require('../utils/errors');
  const logger = createLogger(workerId);
  const app = express();
  app.set('logger', logger);

  // Use HTTP logger middleware
  app.use(createHttpLogger(logger));

  // ... (refactor inline error responses to use next(new ValidationError(...)) / next(new NotFoundError(...))) ...

  // 404 Handler
  app.use((req, res, next) => {
    next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
  });

  // Centralized Error Handler (must be last)
  app.use(errorHandler);
  ```

---

## 5. Verification Method

To verify the implementation of error handling and logging baseline:

1. **Automated Verification**:
   - Run unit/integration/E2E test suite: `npx jest tests/e2e/e2e.test.js --runInBand`
   - Confirm test `Rejects request with missing authorization header` receives status 401 and `res.body.error.message` & `res.body.error.code`.
   - Confirm test `Rejects file upload request when no file is attached` receives status 400 and `res.body.error.message`.
   - Confirm test `Rejects retrieval request for non-existent file ID` receives status 404 and `res.body.error`.

2. **Manual / Route Inspection**:
   - Trigger unknown route `GET /api/nonexistent` on Master or Worker -> Verify JSON response `{ error: { code: "NOT_FOUND", message: "Cannot GET /api/nonexistent", timestamp: "..." } }`.
   - Inspect log file creation in `data/logs/master.log`, `data/logs/worker-1.log`, and `data/logs/error.log`. Verify entries contain ISO timestamps, log levels (`info`, `warn`, `error`), HTTP request details, and error stacks for 5xx failures.

3. **Invalidation Conditions**:
   - Any HTTP error returning default Express HTML output instead of JSON.
   - Any `AppError` thrown by a route/controller that fails to generate a log entry in Winston log files.
