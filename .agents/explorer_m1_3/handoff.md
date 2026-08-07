# Handoff Report — M1 Explorer 3: Environment Variable Parsing & CORS Investigation

## 1. Observation

### 1.1 `src/config/env.js` Assessment
Direct inspection of `src/config/env.js` reveals the following:
- **Missing Environment Variables**:
  - `CORS_ORIGINS` & `CORS_CREDENTIALS`: Not declared.
  - `JWT_SECRET` & `JWT_EXPIRES_IN`: Not declared in `config` object (JWT authentication is required for M3 auth).
  - `NODE_ENV`: Not declared in `config` object (defaults to `'development'`).
  - `WORKER_ID` & `WORKER_PORT`: Not parsed in `config` object.
- **Unvalidated Enums**:
  - Line 20: `MODE: env.MODE || 'presentation'`. Any string value (e.g., `MODE=invalid`) is accepted without validation against allowed modes (`['presentation', 'cloud']`).
  - Line 51: `LOG_LEVEL: env.LOG_LEVEL || 'info'`. Not validated against valid Winston log levels (`['error', 'warn', 'info', 'http', 'debug']`).
- **Unvalidated Integer & Range Conversions**:
  - `MASTER.PORT`: `parseInt(env.MASTER_PORT, 10) || 3000` — accepts out-of-range values (<1 or >65535), negative numbers, or decimal numbers. If `MASTER_PORT="0"`, `parseInt` yields `0`, which evaluates to `0 || 3000 => 3000`.
  - `WORKER.COUNT`: `parseInt(env.WORKER_COUNT, 10) || 3` — no lower-bound check (`COUNT >= 1`).
  - `WORKER.BASE_PORT`: `parseInt(env.WORKER_BASE_PORT, 10) || 4001` — no range check.
  - `STORAGE.DEFAULT_QUOTA`: `parseInt(env.DEFAULT_STORAGE_QUOTA, 10) || 1073741824` — no positive integer validation.
  - `STORAGE.CHUNK_SIZE`: `parseInt(env.CHUNK_SIZE_BYTES, 10) || 2097152` — no positive integer validation.
  - `SYSTEM.REPLICATION_FACTOR`: `parseInt(env.REPLICATION_FACTOR, 10) || 2` — no check that `1 <= REPLICATION_FACTOR <= WORKER_COUNT`.
  - `SYSTEM.HEARTBEAT_INTERVAL`: `parseInt(env.HEARTBEAT_INTERVAL_MS, 10) || 5000` — no minimum bound check (`>= 100`).
  - `SYSTEM.MAX_MISSED_BEATS`: `parseInt(env.MAX_MISSED_BEATS, 10) || 3` — no lower-bound check (`>= 1`).
  - `SYSTEM.REPLICATION_CONCURRENCY`: `parseInt(env.REPLICATION_CONCURRENCY, 10) || 5` — no lower-bound check (`>= 1`).
  - `RATE_LIMIT` (`WINDOW_MS`, `MAX`, `AUTH_MAX`): Raw `parseInt` without positive number validation.
- **Secrets Validation**:
  - Line 6: `const required = ['WORKER_SECRET'];`. When `MODE === 'cloud'`, lines 8-10 require `MONGODB_URI`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. However, no validation checks format (e.g. `MONGODB_URI` starting with `mongodb://` or `mongodb+srv://`) or minimum secret strength in production.

### 1.2 CORS Origins Configuration
- **`src/master/server.js` (line 21)**:
  ```js
  app.use(cors());
  ```
  Calling `cors()` without options enables `Access-Control-Allow-Origin: *` without `credentials: true`. Browsers sending Authorization headers or credentials across origins (e.g., frontend running on port 5500 or 8080 connecting to Master on port 3000) will be blocked if credentials are required.
- **`src/worker/server.js`**:
  `cors` middleware is completely missing. If frontend clients or cross-origin scripts attempt direct chunk uploads or downloads from Worker nodes (ports 4001..4003), browser cross-origin preflight checks (`OPTIONS`) will fail due to missing CORS headers.

### 1.3 Baseline Infrastructure Gaps
- **Rate Limiting**: `express-rate-limit` is included in `package.json` dependencies and `config.RATE_LIMIT` is defined, but rate limiting middleware is NOT imported or registered on Express routes in `src/master/server.js`.
- **Direct `process.env` Usage**:
  - `src/middleware/errorHandler.js:29`: `if (process.env.NODE_ENV === 'development')`
  - `src/worker/server.js:11-12`: `const workerId = process.env.WORKER_ID; const port = process.env.WORKER_PORT;`

---

## 2. Logic Chain

1. **Observations 1.1 → Fallback & Validation Deficit**: `src/config/env.js` relies on standard `||` operators following `parseInt()`. This leads to silent fallback failures on invalid numbers (e.g., `MASTER_PORT="0"` yielding default 3000, or `MASTER_PORT="-5"` accepting negative port) and uncaught errors when invalid `MODE` or `LOG_LEVEL` strings are provided.
2. **Observation 1.2 → CORS Vulnerability & Connection Risk**: Client frontend applications running on alternate origins (e.g., `http://localhost:5500`, `http://127.0.0.1:5500`, `http://localhost:8080`) need explicit CORS configuration on Master and Worker nodes. Unconfigured CORS on Master and completely missing CORS on Workers prevents browser-based API calls and direct chunk fetches.
3. **Observation 1.3 → Single Source of Truth Infringement**: Direct reads of `process.env` across `errorHandler.js` and `worker/server.js` bypass `config/env.js`, causing potential configuration drift and inconsistent test behaviors.

---

## 3. Caveats

- **Cloud Mode Verification**: Cloud mode repositories (`MongoMetadataRepo`, `R2StorageRepo`) are scheduled for implementation in M2 and M4. The env validation logic must validate Cloud mode variables when `MODE === 'cloud'` without breaking `MODE === 'presentation'`.
- **Worker Environment Overrides**: During cluster initialization (`scripts/start-cluster.js` and `tests/e2e/clusterTestHelper.js`), worker processes are spawned via `child_process.fork()` with process-specific `WORKER_ID` and `WORKER_PORT`. `config/env.js` should expose these dynamically or allow safe access via `config.WORKER.ID` and `config.WORKER.PORT`.

---

## 4. Conclusion

To fulfill Milestone M1 requirements and establish a robust, fail-safe environment configuration:

1. `src/config/env.js` must be updated with strict integer range parsers, enum validators, and additional configuration keys (`CORS`, `JWT`, `NODE_ENV`).
2. `.env.example` and `.env` must be updated with all missing configuration options (`CORS_ORIGINS`, `JWT_SECRET`, `NODE_ENV`).
3. `src/master/server.js` must configure `cors` with `config.CORS.ALLOWED_ORIGINS` and `credentials: true`, and mount rate-limiting middleware (`express-rate-limit`).
4. `src/worker/server.js` must mount `cors` middleware with `config.CORS.ALLOWED_ORIGINS` and `credentials: true`.

---

## 5. Verification Method

### Independent Verification Steps
1. **Node Environment Validation Test**:
   Run: `node -e "const config = require('./src/config/env'); console.log(config);"`
   - Confirm `config.CORS.ALLOWED_ORIGINS`, `config.JWT.SECRET`, `config.NODE_ENV`, `config.MODE`, `config.MASTER.PORT`, `config.RATE_LIMIT` parse correctly with defaults.
2. **Invalid Input Failure Test**:
   Run: `MODE=invalid node -e "require('./src/config/env')"`
   - Expected output: Fatal log or error indicating invalid MODE `invalid`.
3. **Automated Unit & E2E Verification**:
   Run: `npm test`
   - All tests in `tests/` must pass cleanly without configuration errors.

---

## 6. Implementation Plan for Worker Agent

### Task 1: Refactor `src/config/env.js`
- Create helper validation functions:
  - `parsePositiveInt(val, fallback, min, max, name)`
  - `parseEnum(val, fallback, allowedValues, name)`
  - `parseBoolean(val, fallback)`
  - `parseArray(val, fallback)`
- Expand schema:
  - `NODE_ENV`: `parseEnum(env.NODE_ENV, 'development', ['development', 'production', 'test'], 'NODE_ENV')`
  - `MODE`: `parseEnum(env.MODE, 'presentation', ['presentation', 'cloud'], 'MODE')`
  - `CORS`: `{ ALLOWED_ORIGINS: parseArray(env.CORS_ORIGINS, ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500']), CREDENTIALS: true }`
  - `JWT`: `{ SECRET: env.JWT_SECRET || 'dfus-default-jwt-secret-change-in-production-key-32ch', EXPIRES_IN: env.JWT_EXPIRES_IN || '24h' }`
  - Validate numeric bounds for `MASTER.PORT` [1..65535], `WORKER.COUNT` [1..64], `WORKER.BASE_PORT` [1..65535], `STORAGE.DEFAULT_QUOTA` [>0], `STORAGE.CHUNK_SIZE` [>0], `SYSTEM.REPLICATION_FACTOR` [1..64], `SYSTEM.HEARTBEAT_INTERVAL` [>=100], `SYSTEM.MAX_MISSED_BEATS` [>=1], `SYSTEM.REPLICATION_CONCURRENCY` [>=1], `RATE_LIMIT` values.
  - Expose `WORKER.ID`: `env.WORKER_ID || 'master'` and `WORKER.PORT`: `parseInt(env.WORKER_PORT, 10) || null`.
  - Freeze sub-objects (`CORS`, `JWT`, etc.).

### Task 2: Update `.env.example` and `.env`
Add:
```ini
# Node Environment
NODE_ENV=development

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500

# Authentication & JWT
JWT_SECRET=dfus-default-jwt-secret-change-in-production-key-32ch
JWT_EXPIRES_IN=24h
```

### Task 3: Enhance `src/master/server.js`
- Update CORS middleware:
  ```js
  const corsOptions = {
    origin: config.CORS.ALLOWED_ORIGINS.includes('*') ? '*' : config.CORS.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  };
  app.use(cors(corsOptions));
  ```
- Implement Rate Limiter:
  ```js
  const rateLimit = require('express-rate-limit');
  const apiLimiter = rateLimit({
    windowMs: config.RATE_LIMIT.WINDOW_MS,
    max: config.RATE_LIMIT.MAX,
    message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' } },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api/', apiLimiter);
  ```

### Task 4: Enhance `src/worker/server.js`
- Add CORS middleware:
  ```js
  const cors = require('cors');
  const corsOptions = {
    origin: config.CORS.ALLOWED_ORIGINS.includes('*') ? '*' : config.CORS.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  };
  app.use(cors(corsOptions));
  ```
- Replace direct `process.env.WORKER_ID` / `process.env.WORKER_PORT` reads with safe fallbacks from `config.WORKER.ID` / `config.WORKER.PORT` or `process.env`.

### Task 5: Refactor `src/middleware/errorHandler.js`
- Replace `process.env.NODE_ENV` with `config.NODE_ENV`.
