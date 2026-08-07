# M1 Handoff Report: Initialization & Baseline Infrastructure

## 1. Observation

Direct code analysis of the baseline infrastructure reveals the following exact states and gaps across the codebase:

### 1.1 Rate Limiting (`express-rate-limit`)
- **Dependency & Config**: `express-rate-limit` (^8.6.2) is present in `package.json` line 23. Configuration exists in `src/config/env.js` lines 69–73:
  ```javascript
  RATE_LIMIT: {
    WINDOW_MS: parseInt(env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 mins
    MAX: parseInt(env.RATE_LIMIT_MAX, 10) || 200,
    AUTH_MAX: parseInt(env.AUTH_RATE_LIMIT_MAX, 10) || 10
  }
  ```
- **State in Master**: `express-rate-limit` is **not imported or mounted** anywhere in `src/master/server.js`.
- **State in Middleware**: No rate limiter file exists in `src/middleware/`.

### 1.2 Graceful Shutdown Signals (`SIGTERM`, `SIGINT`)
- **Master Node (`src/master/server.js`)**:
  - Line 51: `app.listen(PORT, ...)` starts the server without storing the return `http.Server` instance.
  - Line 55: `startHeartbeat()` starts the background timer. `stopHeartbeat()` exists in `src/services/heartbeat.service.js` line 63 but is never invoked on shutdown.
  - `SIGTERM` and `SIGINT` listeners are missing.
- **Worker Node (`src/worker/server.js`)**:
  - Line 82: `app.listen(port, ...)` starts the worker server without storing the return `http.Server` instance.
  - `SIGTERM` and `SIGINT` listeners are missing.
- **Database Repository (`src/repositories/SqliteMetadataRepo.js` & `IMetadataRepository.js`)**:
  - No `close()` method exists on `IMetadataRepository` or `SqliteMetadataRepo` to close `better-sqlite3` database handle cleanly.
- **Cluster Orchestrator (`scripts/start-cluster.js`)**:
  - Lines 47–48 send `SIGTERM` to master and worker processes when cluster receives shutdown signals, but target processes currently terminate abruptly without cleanup.

### 1.3 Helmet, CORS, Body Parser & Winston Logger Audit
- **Winston Logger Application Binding**:
  - `src/middleware/errorHandler.js` line 9 accesses logger via `const logger = req.app.get('logger') || console;`.
  - Neither `src/master/server.js` nor `src/worker/server.js` calls `app.set('logger', logger)`. As a result, `errorHandler` always falls back to `console.error` instead of logging errors to Winston files (`data/logs/master.log`, `data/logs/worker-1.log`, `data/logs/error.log`).
- **CORS Configuration**:
  - `src/master/server.js` line 21 calls `app.use(cors())` with default options.
  - `src/worker/server.js` **completely omits CORS** (cors is not imported or mounted). Browser preflight requests (`OPTIONS`) to worker chunk endpoints will fail.
- **Body Parser Limits**:
  - Both servers use `app.use(express.json())` with default 100kb limit and lack `express.urlencoded` handling. Explicit 10MB limits should be set to prevent `413 Payload Too Large` on chunk/file metadata requests.
- **Helmet Security**:
  - `helmet()` is enabled on both master and worker. For client presentation mode (`app.use(express.static(...))`), `helmet({ contentSecurityPolicy: false })` or explicit CSP options are needed so frontend static assets function without CSP violations.

---

## 2. Logic Chain

1. **Rate Limiting Architecture**:
   - To adhere to modular standards (PROJECT.md R1), create `src/middleware/rateLimiter.js`. Define two limiters using `express-rate-limit`:
     - `generalLimiter`: `windowMs = config.RATE_LIMIT.WINDOW_MS`, `max = config.RATE_LIMIT.MAX`.
     - `authLimiter`: `windowMs = config.RATE_LIMIT.WINDOW_MS`, `max = config.RATE_LIMIT.AUTH_MAX`.
   - In `src/master/server.js`, mount `generalLimiter` on `/api/` and `authLimiter` on `/api/auth/` prior to route handlers.

2. **Graceful Shutdown Flow**:
   - Add `close()` to `IMetadataRepository` and `SqliteMetadataRepo` (`if (this.db) this.db.close()`).
   - Store return value of `app.listen()` as `server` in `src/master/server.js` and `src/worker/server.js`.
   - Implement `gracefulShutdown(signal)` in `src/master/server.js`:
     - Log shutdown event via `logger.info`.
     - Invoke `stopHeartbeat()` from `src/services/heartbeat.service.js`.
     - Call `server.close()` to stop accepting new HTTP connections.
     - Close database connection via `await db.close()`.
     - Exit with code 0 (with a 5-second `setTimeout` forced exit fallback).
   - Implement `gracefulShutdown(signal)` in `src/worker/server.js`:
     - Log shutdown event via `logger.info`.
     - Call `server.close()` to drain active worker streams.
     - Exit with code 0 (with a 5-second `setTimeout` forced exit fallback).

3. **Middleware Optimization Across Master and Worker**:
   - **Winston**: Add `app.set('logger', logger)` immediately after logger initialization in both `master/server.js` and `worker/server.js`.
   - **CORS**: Import `cors` in `src/worker/server.js` and mount `app.use(cors({ origin: '*', exposedHeaders: ['Content-Disposition', 'Content-Length', 'x-worker-secret'] }))` on both master and worker nodes.
   - **Body Parser**: Update `app.use(express.json({ limit: '10mb' }))` and `app.use(express.urlencoded({ extended: true, limit: '10mb' }))` on master and worker.
   - **Helmet**: Update `app.use(helmet({ contentSecurityPolicy: false }))` on master server to ensure client static assets render without CSP conflicts.

---

## 3. Caveats

- **Cloud Mode Placeholders**: `MongoMetadataRepo` and `R2StorageRepo` are placeholders. The `db.close()` invocation is guarded with `if (db && typeof db.close === 'function')` so future DB adapters work seamlessly.
- **Worker Streams**: Long-running chunk upload/download streams on workers will be given up to 5 seconds to complete during `server.close()` before force exit triggers.

---

## 4. Conclusion

The exact code changes required for Milestone M1 are structured as follows:

### Step 4.1: Create `src/middleware/rateLimiter.js`
```javascript
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const generalLimiter = rateLimit({
  windowMs: config.RATE_LIMIT.WINDOW_MS,
  max: config.RATE_LIMIT.MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.'
    }
  }
});

const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT.WINDOW_MS,
  max: config.RATE_LIMIT.AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later.'
    }
  }
});

module.exports = {
  generalLimiter,
  authLimiter
};
```

### Step 4.2: Update Repositories with `close()` Method

#### In `src/repositories/IMetadataRepository.js`:
Add method contract:
```javascript
  async close() { throw new Error('Not implemented'); }
```

#### In `src/repositories/SqliteMetadataRepo.js`:
Add method implementation:
```javascript
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
```

### Step 4.3: Update `src/master/server.js`

```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const config = require('../config/env');
const { createLogger } = require('../utils/logger');
const errorHandler = require('../middleware/errorHandler');
const workerAuth = require('../middleware/workerAuth');
const { generalLimiter, authLimiter } = require('../middleware/rateLimiter');
const { getDatabase } = require('../repositories/database');
const { startHeartbeat, stopHeartbeat } = require('../services/heartbeat.service');
const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');

const logger = createLogger('master');
const app = express();
app.set('logger', logger);

const db = getDatabase();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', exposedHeaders: ['Content-Disposition', 'Content-Length', 'x-worker-secret'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Rate Limiting
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../../client')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// Worker Registration Endpoint
app.post('/api/system/workers/register', workerAuth, async (req, res, next) => {
  try {
    const { id, host, port } = req.body;
    await db.registerWorker({ id, host, port, status: 'alive' });
    
    const hashRing = require('../services/consistentHash');
    hashRing.addNode(id);
    
    logger.info(`Worker ${id} registered successfully from ${host}:${port}`);
    res.json({ message: 'Registered successfully' });
  } catch (err) {
    next(err);
  }
});

// Error handling (must be last middleware)
app.use(errorHandler);

// Start Master Server
const PORT = config.MASTER.PORT;
const server = app.listen(PORT, () => {
  logger.info(`Master node started on port ${PORT} in ${config.MODE} mode`);
  startHeartbeat();
});

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  stopHeartbeat();
  
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        if (db && typeof db.close === 'function') {
          await db.close();
          logger.info('Database connection closed cleanly.');
        }
      } catch (err) {
        logger.error(`Error closing database: ${err.message}`);
      }
      logger.info('Master node graceful shutdown complete.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forcing Master node shutdown after timeout.');
      process.exit(1);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### Step 4.4: Update `src/worker/server.js`

```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const fetch = require('node-fetch');
const config = require('../config/env');
const { createLogger } = require('../utils/logger');
const errorHandler = require('../middleware/errorHandler');
const workerAuth = require('../middleware/workerAuth');
const { getStorage } = require('../repositories/storage');

const workerId = process.env.WORKER_ID || 'worker-1';
const port = process.env.WORKER_PORT || config.WORKER.BASE_PORT;

const logger = createLogger(workerId);
const app = express();
app.set('logger', logger);

// Raw body parser for binary chunk streams
app.use('/api/chunks', express.raw({ limit: `${config.STORAGE.CHUNK_SIZE + 1024}b`, type: 'application/octet-stream' }));

app.use(helmet());
app.use(cors({ origin: '*', exposedHeaders: ['Content-Disposition', 'Content-Length', 'x-worker-secret'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('tiny', { stream: { write: msg => logger.info(msg.trim()) } }));

const storage = getStorage(workerId);

// ================= ROUTES ================= //

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'alive', workerId });
});

// Store Chunk
app.post('/api/chunks/:hash', workerAuth, async (req, res, next) => {
  try {
    const { hash } = req.params;
    const chunkData = req.body;
    
    if (!chunkData || chunkData.length === 0) {
      return res.status(400).json({ error: { message: 'Empty chunk data' } });
    }

    await storage.storeChunk(hash, chunkData);
    res.status(201).json({ message: 'Chunk stored successfully' });
  } catch (err) {
    next(err);
  }
});

// Retrieve Chunk
app.get('/api/chunks/:hash', workerAuth, async (req, res, next) => {
  try {
    const { hash } = req.params;
    const exists = await storage.chunkExists(hash);
    
    if (!exists) {
      return res.status(404).json({ error: { message: 'Chunk not found' } });
    }

    const data = await storage.retrieveChunk(hash);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(data);
  } catch (err) {
    next(err);
  }
});

// Delete Chunk
app.delete('/api/chunks/:hash', workerAuth, async (req, res, next) => {
  try {
    const { hash } = req.params;
    await storage.deleteChunk(hash);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

const server = app.listen(port, async () => {
  logger.info(`Worker node started on port ${port}`);
  
  try {
    const url = `http://${config.MASTER.HOST}:${config.MASTER.PORT}/api/system/workers/register`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': config.WORKER.SECRET
      },
      body: JSON.stringify({
        id: workerId,
        host: 'localhost',
        port: port
      })
    });
    
    if (res.ok) {
      logger.info('Successfully registered with Master node');
    } else {
      logger.error(`Failed to register with Master: ${res.status}`);
    }
  } catch (err) {
    logger.error(`Failed to reach Master: ${err.message}`);
  }
});

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Initiating worker graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      logger.info(`Worker node ${workerId} HTTP server closed.`);
      process.exit(0);
    });

    setTimeout(() => {
      logger.error(`Forcing Worker node ${workerId} shutdown after timeout.`);
      process.exit(1);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## 5. Verification Method

To verify the implementation independently:

1. **Rate Limit Verification**:
   - Start master node: `WORKER_SECRET=test secret node src/master/server.js`.
   - Issue 11 requests to `http://localhost:3000/api/auth/me`. Request #11 must respond with HTTP status `429` and `{ "error": { "code": "AUTH_RATE_LIMIT_EXCEEDED", ... } }`.
   - Issue 201 requests to `http://localhost:3000/api/files`. Request #201 must respond with HTTP status `429` and `{ "error": { "code": "RATE_LIMIT_EXCEEDED", ... } }`.

2. **Graceful Shutdown Verification**:
   - Start cluster: `npm start` (or `WORKER_SECRET=test node scripts/start-cluster.js`).
   - Send `SIGINT` (Ctrl+C) or `kill -SIGTERM <master_pid> <worker_pid>`.
   - Inspect console output and logs to confirm:
     - Master logs: `Received SIGTERM. Initiating graceful shutdown...`, `Heartbeat service stopped`, `HTTP server closed.`, `Database connection closed cleanly.`, `Master node graceful shutdown complete.`
     - Worker logs: `Received SIGTERM. Initiating worker graceful shutdown...`, `Worker node worker-1 HTTP server closed.`
     - Exit code is `0`.

3. **Winston Error Logging Verification**:
   - Make an invalid API call that triggers error middleware.
   - Verify `data/logs/master.log` and `data/logs/error.log` contain structured JSON logs of the unhandled error.

4. **Worker CORS Verification**:
   - Send OPTIONS request: `curl -i -X OPTIONS http://localhost:4001/api/chunks/test -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET"`.
   - Verify response headers include `Access-Control-Allow-Origin: *`.
