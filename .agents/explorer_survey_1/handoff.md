# DFUS Codebase Architecture & Implementation Survey Report

## 1. Observation

Direct inspection of the codebase at `c:\Users\xavir\OneDrive\Desktop\DFUS` revealed the following structural details and observations:

### A. Dual Codebase Architecture & Test Failures
- **Root Files & Configurations**:
  - `package.json` specifies `"start": "node scripts/start-cluster.js"` and `"test": "jest --runInBand --forceExit"`.
  - `.env` and `.env.example` configure `MODE=presentation` vs `cloud`, `MASTER_PORT=3000`, `WORKER_COUNT=3`, `WORKER_BASE_PORT=4001`, `WORKER_SECRET`, `REPLICATION_FACTOR=2`, `HEARTBEAT_INTERVAL_MS=5000`, `SQLITE_DB_PATH`, `MONGODB_URI`, and rate limiting options (`RATE_LIMIT_WINDOW_MS=900000`, `RATE_LIMIT_MAX=200`, `AUTH_RATE_LIMIT_MAX=10`).
  - Two parallel code directories exist in the project:
    1. `server/`: Monolithic server structure using `server/server.js`, Mongoose models (`server/src/models/*`), and worker node forks (`server/src/storageNode.js`).
    2. `src/`: Master-Worker distributed system architecture using `src/master/server.js`, `src/worker/server.js`, repository pattern (`src/repositories/*`), and consistent hash ring (`src/services/consistentHash.js`).
  - `scripts/start-cluster.js` (lines 11 & 27) forks `src/master/server.js` and `src/worker/server.js`.
  - `tests/testHelper.js` (lines 35 & 47) requires `../server/src/config/db` and `../server/server`, binding the test runner to the legacy monolithic `server/` codebase rather than the new `src/` Master-Worker codebase.
  - Running `npm test` executed 3 test suites (`tests/chunk.test.js`, `tests/merge.test.js`, `tests/session.test.js`) resulting in 18 failed tests out of 29 total tests:
    ```
    Test Suites: 3 failed, 3 total
    Tests:       18 failed, 11 passed, 29 total
    ```

### B. Server Initialization & Middleware (`src/master/server.js` & `src/worker/server.js`)
- **Master Server (`src/master/server.js`)**:
  - Initializes Express, mounts `helmet()`, `cors()`, `express.json()`, and `morgan('combined')` logging with Winston (lines 20-23).
  - Serves static assets from `../../client` (line 26).
  - Routes mounted: `/api/auth` (`auth.routes.js`), `/api/files` (`file.routes.js`), `/api/system/workers/register`.
  - Starts heartbeat service (`startHeartbeat()` line 55).
  - Attaches `errorHandler` middleware (line 59).
  - **Omission**: `express-rate-limit` is included in `package.json` and parsed in `src/config/env.js` (lines 69-73), but is **NOT** mounted on any route in `src/master/server.js`.
  - **Omission**: Master server lacks `SIGTERM`/`SIGINT` graceful shutdown handlers (only handled at the launcher level in `scripts/start-cluster.js`).
- **Worker Server (`src/worker/server.js`)**:
  - Express app listening on worker port (lines 12 & 82).
  - Parses raw binary bodies for `/api/chunks`: `express.raw({ limit: '${config.STORAGE.CHUNK_SIZE + 1024}b', type: 'application/octet-stream' })` (line 18).
  - Endpoints: `GET /health`, `POST /api/chunks/:hash`, `GET /api/chunks/:hash`, `DELETE /api/chunks/:hash` protected by `workerAuth` middleware (lines 35, 52, 70).
  - Registers with Master on startup via `POST http://localhost:3000/api/system/workers/register` (lines 87-99).
  - **Omission**: `/health` endpoint (line 30) returns `{ status: 'alive', workerId }` without reporting disk storage usage or stored chunk counts. Circuit breaker pattern is missing.

### C. Database Layer & Repository Pattern (`src/repositories/*`)
- **Interfaces**:
  - `src/repositories/IMetadataRepository.js` defines contract methods for Users, Files, Chunks, Workers, and Refresh Tokens.
  - `src/repositories/IStorageRepository.js` defines contract methods for `storeChunk`, `retrieveChunk`, `deleteChunk`, `chunkExists`, and `getStorageStats`.
- **Factories (`database.js` & `storage.js`)**:
  - `database.js` returns `SqliteMetadataRepo` when `MODE === 'presentation'`. Line 12 throws: `Error('Cloud mode (MongoDB) repository not yet initialized. Use presentation mode.')`.
  - `storage.js` returns `LocalStorageRepo` when `MODE === 'presentation'`. Line 12 throws: `Error('Cloud mode (R2) repository not yet initialized. Use presentation mode.')`.
- **SQLite Metadata Repo (`SqliteMetadataRepo.js`)**:
  - Uses `better-sqlite3` with WAL mode and foreign keys enabled.
  - Creates tables: `users`, `files`, `chunks`, `file_chunks`, `workers`, `refresh_tokens`.
  - Missing implementation methods:
    - `findWorkerById(workerId)` is **not defined** in `SqliteMetadataRepo.js`. However, `src/services/chunk.service.js` (line 40) explicitly calls `await db.findWorkerById(workerId)`, which results in a `TypeError: db.findWorkerById is not a function` at runtime during file download.
    - Missing methods declared in `IMetadataRepository`: `updateWorkerStatus`, `findFileByShareToken`, `updateFileShareToken`, `getAllFiles`, `getFileCount`, `getTotalStorageUsed`, `updateChunkWorkers`, `updateChunkStatus`, `deleteChunksByFileId`, `getChunksByWorkerId`, `getOrphanedChunks`, `getDeadWorkers`, `removeWorker`, and all refresh token methods (`createRefreshToken`, `findRefreshToken`, `deleteRefreshToken`, `deleteAllUserRefreshTokens`, `deleteExpiredTokens`).
- **MongoDB Repository (`MongoMetadataRepo.js`)**:
  - Missing. Commented out in `database.js`.
- **R2 Storage Repository (`R2StorageRepo.js`)**:
  - Missing. Commented out in `storage.js`.

### D. Authentication & Security Implementation (`src/middleware/*`, `src/config/firebase.js`)
- **Firebase Auth (`src/middleware/authenticate.js`)**:
  - Expects `Authorization: Bearer <token>`.
  - Calls `admin.auth().verifyIdToken(token)`. Auto-provisions user in database if not found; assigns `'admin'` role to the first user if `FIRST_USER_ADMIN === 'true'`.
- **RBAC (`src/middleware/authorize.js`)**:
  - Middleware checks `req.user.role` against authorized roles list.
- **Worker Auth (`src/middleware/workerAuth.js`)**:
  - Validates `x-worker-secret` header against `config.WORKER.SECRET`.
- **Missing Auth Components**:
  - Native JWT login/register routes (`auth.controller.js` only contains `getMe`).
  - 2FA (Two-Factor Authentication / OTP / TOTP).
  - API Keys generation and verification middleware.
  - Refresh Tokens database operations and rotation endpoint.

### E. Storage, Chunking & Distributed Mechanics (`src/services/*`)
- **Chunking (`src/services/chunker.js`)**:
  - Streams incoming file in 2MB chunks (`config.STORAGE.CHUNK_SIZE`).
  - Calculates SHA-256 hash per chunk.
  - Uses `consistentHash.js` (150 virtual nodes) to pick workers according to `REPLICATION_FACTOR` (2).
  - Uploads chunk to target worker HTTP endpoints concurrently.
- **Streaming Download (`src/services/chunk.service.js`)**:
  - Queries `file_chunks` and `chunks` tables.
  - Sequentially fetches chunks from alive workers and pipes to HTTP response stream.
- **Heartbeat & Replication (`src/services/heartbeat.service.js`)**:
  - Periodically (every 5000ms) pings workers. Marks worker dead after 3 missed beats.
  - Line 48 contains a stub comment: `// TODO: Trigger replication service to re-replicate chunks stored on this node`. Auto-re-replication process is missing.

---

## 2. Logic Chain

1. **Observation**: `scripts/start-cluster.js` runs `src/master/server.js` and `src/worker/server.js`, whereas `tests/testHelper.js` requires `../server/server.js` and Mongoose.
   **Inference**: The project underwent a architectural migration from a legacy single Express + Mongoose server (`server/`) to a Master-Worker topology using repository abstraction (`src/`). However, the existing test suite was left bound to the legacy server, causing `npm test` failures and leaving the actual system (`src/`) without automated tests.

2. **Observation**: `src/services/chunk.service.js` line 40 calls `db.findWorkerById(workerId)`, but `SqliteMetadataRepo.js` lacks `findWorkerById`.
   **Inference**: The file download streaming logic will fail when attempting to resolve worker endpoints, breaking file downloads in presentation mode.

3. **Observation**: `database.js` and `storage.js` throw errors when `config.MODE === 'cloud'`.
   **Inference**: Cloud Mode (MongoDB + Cloudflare R2) is entirely unconstructed. Only Presentation Mode (SQLite + Local Disk Storage) has foundational code.

4. **Observation**: `config/env.js` parses rate limit parameters (`RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`), but `src/master/server.js` never initializes or mounts `express-rate-limit`.
   **Inference**: Server initialization for master node is incomplete regarding rate limiting and DOS protection.

5. **Observation**: Requirement R2 specifies 10 build stages including 2FA, API Keys, Deduplication, Compression, Encryption, Circuit Breaker, Auto-Re-replication, Folders, Versioning, Trash, Search, Tags, WebSockets, Webhooks, Public Shares, and E2E testing.
   **Inference**: Current codebase has implemented Stage 1 (partial master/worker init), Stage 2 (presentation DB layer), Stage 3 (Firebase auth only), Stage 4 (basic chunking without dedup/compression/encryption), Stage 5 (worker storage without circuit breaker), and Stage 6 (heartbeat ping without re-replication). Stages 7, 8, 9, and 10 are either partial or missing.

---

## 3. Caveats

- **Client Codebase**: `client/` files (`app.js`, `dashboard.html`, `js/api.js`, etc.) were inspected for API integration. They reference `/api/upload`, `/api/download`, and Firebase Auth, but full UI interaction testing was not performed as backend APIs are missing several endpoints.
- **R2 and MongoDB Cloud Environment**: Cloud credentials and remote endpoints were not tested live since Cloud Mode repository classes do not exist in code yet.

---

## 4. Conclusion

The DFUS project has a solid architectural layout under `src/` (Master-Worker topology, repository interfaces, consistent hashing ring, streaming chunker), but requires critical consolidation and completion:

1. **Architecture & Cleanup**: The legacy `server/` folder should be removed or retired, and the test suite under `tests/` must be rewritten to test the `src/` Master-Worker architecture.
2. **Server & Security**: Master server needs `express-rate-limit` middleware attached, CORS configured, and graceful signal handling. Worker nodes need health metric reporting and circuit breaker logic.
3. **Database Layer**:
   - `SqliteMetadataRepo.js` must implement `findWorkerById` and missing repository methods (`updateWorkerStatus`, share tokens, refresh tokens, analytics queries).
   - `MongoMetadataRepo.js` and `R2StorageRepo.js` must be implemented to fulfill Dual-Mode System requirement (Cloud Mode).
4. **Authentication**: Add local JWT auth (register/login), 2FA support, API key management, and refresh token endpoints alongside existing Firebase auth.
5. **Storage & Distributed Mechanics**: Implement chunk deduplication, compression, encryption, auto-re-replication on worker death, folder hierarchy, search/tags, public sharing, WebSockets/Webhooks, and an E2E Jest/Supertest test suite.

---

## 5. Verification Method

To verify these findings independently:

1. **Verify Dual Architecture & Test Discrepancy**:
   - Inspect `scripts/start-cluster.js` lines 11 and 27.
   - Inspect `tests/testHelper.js` lines 35 and 47.
   - Run `npm test` in `c:\Users\xavir\OneDrive\Desktop\DFUS` to observe the 18 failing tests on legacy `server/server.js`.

2. **Verify Missing Repository Method (`findWorkerById`)**:
   - Search `findWorkerById` in `SqliteMetadataRepo.js` (`grep_search` query: `findWorkerById`). Note 0 occurrences in `SqliteMetadataRepo.js` while present in `IMetadataRepository.js` and `chunk.service.js:40`.

3. **Verify Unmounted Rate Limiter**:
   - Inspect `src/master/server.js` to confirm `express-rate-limit` is not imported or used.

4. **Verify Cloud Mode Error Triggers**:
   - Set `MODE=cloud` in `.env` and start `node scripts/start-cluster.js`. Observe error thrown from `database.js` / `storage.js`.
