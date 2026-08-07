# Handoff Report: Milestone M2 - Database Layer Factory & Lifecycle

## 1. Observation

### Codebase Inspection & Direct References
- **`src/repositories/database.js` (lines 1-22)**:
  ```javascript
  const config = require('../config/env');
  const SqliteMetadataRepo = require('./SqliteMetadataRepo');
  // const MongoMetadataRepo = require('./MongoMetadataRepo');

  let dbInstance = null;

  function getDatabase() {
    if (!dbInstance) {
      if (config.MODE === 'presentation') {
        dbInstance = new SqliteMetadataRepo();
      } else {
        throw new Error('Cloud mode (MongoDB) repository not yet initialized. Use presentation mode.');
        // dbInstance = new MongoMetadataRepo();
      }
    }
    return dbInstance;
  }

  module.exports = {
    getDatabase
  };
  ```
  *Observation*: `getDatabase()` is synchronous and hardcoded to check `config.MODE === 'presentation'`. In `cloud` mode, it throws an unhandled Error. `MongoMetadataRepo` module import is commented out.

- **`src/config/env.js` (lines 48-116)**:
  *Observation*: Defines `config.MODE` ('presentation' | 'cloud'), `config.SQLITE.DB_PATH`, and `config.MONGO.URI`. In `cloud` mode (`env.MODE === 'cloud'`), `MONGODB_URI` is verified as required.

- **`src/repositories/SqliteMetadataRepo.js` (lines 224-229)**:
  *Observation*: Contains an `async close()` method:
  ```javascript
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
  ```
  *Observation*: Does not currently have an explicit `connect()` method (initialization occurs synchronously inside constructor).

- **`src/master/server.js` (lines 22, 76-80, 83-110)**:
  *Observation*:
  - Line 22: `const db = getDatabase();` initializes database synchronously on module load.
  - Lines 83-110: `gracefulShutdown` function closes HTTP server and then calls `await db.close()`.
  - Server start (`app.listen(PORT, ...)`) is synchronous and does not wait for database async connection.

- **Dependencies (`package.json`)**:
  *Observation*: `mongoose` (`^8.24.2`) is installed under `dependencies`, and `mongodb-memory-server` (`^10.1.4`) is installed under `devDependencies`.

---

## 2. Logic Chain

1. **Dynamic Instantiation Requirement**:
   - The system must dynamically select between `SqliteMetadataRepo` and `MongoMetadataRepo` based on configuration.
   - `config.MODE` ('presentation' vs 'cloud') or explicit `DB_TYPE` ('sqlite' vs 'mongodb') determines the target class.
   - SQLite initialization is synchronous (in constructor / `_initSchema`), while MongoDB connection via Mongoose is asynchronous (`mongoose.connect(uri, options)`).
   - Therefore, `database.js` must expose both:
     1) `getDatabase(typeOverride)`: Returns the initialized database instance.
     2) `connectDatabase(options)`: Asynchronously connects and initializes the repository (handling MongoDB connection retries if in cloud mode).
     3) `closeDatabase()`: Cleans up database connections gracefully.

2. **MongoDB Connection Retry & Exponential Backoff**:
   - Cloud MongoDB Atlas connections can suffer from transient network outages, cold start latency, or DNS lookup delays during server boot.
   - Without retry logic, initial boot failure would crash the Master node process immediately.
   - An exponential backoff loop (`connectWithRetry`) must wrap `mongoose.connect()`.
   - Algorithm specs:
     - `maxRetries`: default 5 (configurable via env/options)
     - `initialDelayMs`: 1000ms
     - `backoffFactor`: 2x
     - `maxDelayMs`: 16000ms
     - `jitter`: random 0–200ms addition to prevent thundering herd.
   - Connection event monitoring: Listeners for `'error'`, `'disconnected'`, and `'reconnected'` must be registered on `mongoose.connection` for production telemetry.

3. **Lifecycle Management & Graceful Shutdown**:
   - SQLite requires calling `this.db.close()`.
   - MongoDB requires calling `await mongoose.disconnect()` (or `await mongoose.connection.close()`).
   - `closeDatabase()` in `database.js` must check `dbInstance`, call `await dbInstance.close()`, and reset `dbInstance = null`.
   - In `src/master/server.js`, server initialization should execute `await connectDatabase()` prior to `app.listen()`, ensuring database readiness before accepting HTTP traffic.
   - Shutdown signals (`SIGTERM`, `SIGINT`) must trigger `closeDatabase()`.

---

## 3. Caveats

1. **Mongoose Version & Connection Options**:
   - Mongoose v8.x deprecates legacy options like `useNewUrlParser` and `useUnifiedTopology`. Standard connection call is `mongoose.connect(uri, options)`. Options supplied should include `serverSelectionTimeoutMS: 5000` for rapid failure detection during retries.
2. **Synchronous vs Asynchronous Caller Expectations**:
   - Controllers currently access `getDatabase()` synchronously. To avoid breaking existing controller calls, `getDatabase()` must return the existing `dbInstance` synchronously once initialized by `connectDatabase()`. If called before initialization in presentation mode, it lazily creates `SqliteMetadataRepo`. In cloud mode, `connectDatabase()` MUST be called during server startup before `getDatabase()`.
3. **MongoDB Memory Server for Testing**:
   - In test environments (`NODE_ENV === 'test'`), integration tests using cloud mode can pass an in-memory MongoDB URI provided by `mongodb-memory-server` without needing external internet access.

---

## 4. Conclusion

`src/repositories/database.js` requires structural refactoring into a full Database Lifecycle Manager and Repository Factory:
1. Export `getDatabase(typeOverride)`: returns single repo instance supporting presentation (`SqliteMetadataRepo`) and cloud (`MongoMetadataRepo`).
2. Export `connectDatabase(options)`: performs async initialization with exponential backoff connection retries (5 attempts, 1s to 16s backoff with jitter) for MongoDB Atlas.
3. Export `closeDatabase()`: executes clean `close()` across SQLite (`db.close()`) and MongoDB (`mongoose.disconnect()`).
4. Export `setDatabaseInstance(instance)` and `resetDatabase()`: supports test isolation and mocking.
5. Update `src/master/server.js`: async startup flow with `await connectDatabase()` and clean `closeDatabase()` on `SIGTERM`/`SIGINT`.

---

## 5. Verification Method

1. **Unit & Integration Test Plan**:
   - Create `tests/unit/databaseFactory.test.js` to verify:
     - Instantiation of `SqliteMetadataRepo` in `presentation` mode.
     - Instantiation of `MongoMetadataRepo` in `cloud` mode.
     - Connection retry behavior on connection failure using mocked Mongoose failure.
     - Graceful connection teardown via `closeDatabase()`.
2. **Commands**:
   ```bash
   # Run unit test suite
   npm test
   
   # Run E2E test suite
   npm run test:e2e
   ```
3. **Invalidation Conditions**:
   - If `getDatabase()` throws when `config.MODE === 'cloud'` after calling `connectDatabase()`.
   - If MongoDB connection failure causes process crash without attempting configured retries.
   - If database connections remain open after `closeDatabase()` or process shutdown.

---

## 6. Worker Implementation Plan (Code Recommendations)

### Step 1: Refactor `src/repositories/database.js`
Replace contents of `src/repositories/database.js` with:
```javascript
const config = require('../config/env');
const { createLogger } = require('../utils/logger');
const SqliteMetadataRepo = require('./SqliteMetadataRepo');
const MongoMetadataRepo = require('./MongoMetadataRepo');

const logger = createLogger('database-factory');
let dbInstance = null;

/**
 * Connection retry logic with exponential backoff for MongoDB Atlas
 */
async function connectWithRetry(mongoRepo, options = {}) {
  const maxRetries = options.maxRetries || (config.MONGO && config.MONGO.MAX_RETRIES) || 5;
  const initialDelay = options.initialDelayMs || 1000;
  const maxDelay = options.maxDelayMs || 16000;
  const backoffFactor = options.backoffFactor || 2;

  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      attempt++;
      logger.info(`Connecting to MongoDB Atlas (Attempt ${attempt}/${maxRetries})...`);
      await mongoRepo.connect(options);
      logger.info(`Successfully connected to MongoDB Atlas on attempt ${attempt}`);
      return;
    } catch (err) {
      logger.error(`MongoDB connection attempt ${attempt} failed: ${err.message}`);
      if (attempt >= maxRetries) {
        throw new Error(`Failed to connect to MongoDB Atlas after ${maxRetries} attempts: ${err.message}`);
      }
      const jitter = Math.floor(Math.random() * 200);
      const currentDelay = Math.min(delay, maxDelay) + jitter;
      logger.info(`Retrying MongoDB connection in ${currentDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      delay *= backoffFactor;
    }
  }
}

/**
 * Initializes and connects the metadata database repository
 */
async function connectDatabase(options = {}) {
  const dbType = options.dbType || (config.MODE === 'cloud' ? 'mongodb' : 'sqlite');

  if (!dbInstance) {
    if (dbType === 'sqlite' || config.MODE === 'presentation') {
      dbInstance = new SqliteMetadataRepo();
      if (typeof dbInstance.connect === 'function') {
        await dbInstance.connect();
      }
      logger.info('Initialized SqliteMetadataRepo for presentation mode.');
    } else if (dbType === 'mongodb' || config.MODE === 'cloud') {
      dbInstance = new MongoMetadataRepo();
      await connectWithRetry(dbInstance, options);
      logger.info('Initialized MongoMetadataRepo for cloud mode.');
    } else {
      throw new Error(`Unsupported database type: ${dbType}`);
    }
  }
  return dbInstance;
}

/**
 * Retrieves the current database repository instance
 */
function getDatabase(typeOverride) {
  if (!dbInstance) {
    const dbType = typeOverride || (config.MODE === 'cloud' ? 'mongodb' : 'sqlite');
    if (dbType === 'sqlite' || config.MODE === 'presentation') {
      dbInstance = new SqliteMetadataRepo();
    } else if (dbType === 'mongodb' || config.MODE === 'cloud') {
      dbInstance = new MongoMetadataRepo();
      // Uninitialized MongoDB instance warning if connectDatabase wasn't called
      logger.warn('MongoMetadataRepo instantiated via getDatabase before connectDatabase was called.');
    } else {
      throw new Error(`Unsupported database type: ${dbType}`);
    }
  }
  return dbInstance;
}

/**
 * Gracefully closes database connection
 */
async function closeDatabase() {
  if (dbInstance) {
    try {
      if (typeof dbInstance.close === 'function') {
        await dbInstance.close();
      }
      logger.info('Database connection closed cleanly.');
    } catch (err) {
      logger.error(`Error while closing database connection: ${err.message}`);
      throw err;
    } finally {
      dbInstance = null;
    }
  }
}

/**
 * Helper to set or mock database instance (for unit testing)
 */
function setDatabaseInstance(instance) {
  dbInstance = instance;
}

/**
 * Reset database singleton state
 */
function resetDatabase() {
  dbInstance = null;
}

module.exports = {
  connectDatabase,
  getDatabase,
  closeDatabase,
  setDatabaseInstance,
  resetDatabase
};
```

### Step 2: Add `connect()` method to `SqliteMetadataRepo.js`
In `src/repositories/SqliteMetadataRepo.js`, ensure `async connect()` is defined for contract symmetry:
```javascript
  async connect() {
    // Database connection opened in constructor; return true to confirm readiness
    return true;
  }
```

### Step 3: Update `src/master/server.js` Startup & Shutdown Flow
Update `src/master/server.js`:
```javascript
const { connectDatabase, getDatabase, closeDatabase } = require('../repositories/database');

let db = null;
let server = null;

async function startMasterServer() {
  try {
    db = await connectDatabase();
    
    // Express routes and server listening setup...
    const PORT = config.MASTER.PORT;
    server = app.listen(PORT, () => {
      logger.info(`Master node started on port ${PORT} in ${config.MODE} mode`);
      startHeartbeat();
    });
  } catch (err) {
    logger.error(`Failed to initialize Master database or server: ${err.message}`);
    process.exit(1);
  }
}

// In gracefulShutdown:
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Initiating Master graceful shutdown...`);
  stopHeartbeat();
  if (server) {
    server.close(async () => {
      logger.info('Master HTTP server closed.');
      try {
        await closeDatabase();
      } catch (err) {
        logger.error(`Error closing database: ${err.message}`);
      }
      logger.info('Master node graceful shutdown complete.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forcing Master node shutdown after 5s timeout.');
      process.exit(1);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
};

startMasterServer();
```
