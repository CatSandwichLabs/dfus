# Comprehensive Investigation Report: DFUS Codebase Architecture & Feature Status

**Date**: 2026-08-07  
**Explorer**: Explorer 2  
**Target Codebase**: `c:\Users\xavir\OneDrive\Desktop\DFUS`  

---

## 1. Observation

### Codebase Structure & Dual Architectures
- The repository contains two distinct server directories:
  1. `src/`: Represents the new modular Master-Worker architecture (`src/master/server.js`, `src/worker/server.js`, `src/repositories/`, `src/services/`) designed according to the requirements in `ORIGINAL_REQUEST.md`.
  2. `server/`: Represents a legacy monolithic Express/MongoDB server (`server/server.js`, `server/src/models/`, `server/src/routes/`) which current Jest tests (`tests/chunk.test.js`, `tests/session.test.js`, `tests/merge.test.js`) target.
- `package.json` script `"start": "node scripts/start-cluster.js"` launches `src/master/server.js` and N instances of `src/worker/server.js` defined by `config.WORKER.COUNT` (default 3).

### Focus Area 1: Storage Engine & Chunking
- **Streams**:
  - `src/services/chunker.js` (lines 84-118) consumes `fileStream` using `'data'` and `'end'` events, slicing data into 2MB chunks (`config.STORAGE.CHUNK_SIZE`). Stream reading is paused during worker uploads (`fileStream.pause()`) and resumed after dispatch (`fileStream.resume()`).
  - `src/services/chunk.service.js` (lines 53-57) pipes chunk response streams directly to the Express client response (`response.body.pipe(res, { end: false })`).
  - `src/repositories/LocalStorageRepo.js` (lines 24-41) does **not** stream chunks to/from disk; it uses `fs.writeFile(filePath, dataBuffer)` and `fs.readFile(filePath)` with complete Buffers in RAM.
- **Hashing**:
  - `src/services/chunker.js` (line 22) computes SHA-256 hash per chunk: `crypto.createHash('sha256').update(buffer).digest('hex')`.
  - `src/repositories/LocalStorageRepo.js` (lines 14-17) uses the first 2 characters of the SHA-256 hash as a directory subfolder (`data/chunks/<workerId>/<prefix>/<hash>`).
- **Deduplication**:
  - `src/repositories/SqliteMetadataRepo.js` (lines 167-175) performs `ON CONFLICT(hash) DO UPDATE SET workerIds=excluded.workerIds` in SQLite table `chunks`.
  - **Missing**: `src/services/chunker.js` has no pre-upload hash check. It sends the chunk payload over HTTP to worker nodes even if the hash already exists in the database.
- **Compression**:
  - **Missing**: No zlib/gzip/brotli stream compression or decompression layer in `src/repositories/` or `src/services/`.
- **Encryption**:
  - **Missing**: No server-side AES-256 chunk encryption at rest or streaming decryption.
- **Storage Abstraction**:
  - Interface defined in `src/repositories/IStorageRepository.js` with methods `storeChunk`, `retrieveChunk`, `deleteChunk`, `chunkExists`, `getStorageStats`.
  - Implementation in `src/repositories/LocalStorageRepo.js`.
  - Factory in `src/repositories/storage.js` throws an error if `config.MODE === 'cloud'` because `R2StorageRepo.js` is not implemented.

### Focus Area 2: Worker Nodes
- **Chunk CRUD Endpoints**:
  - Implemented in `src/worker/server.js`:
    - `POST /api/chunks/:hash` (line 35): Accepts `application/octet-stream` raw buffer and calls `storage.storeChunk(hash, chunkData)`. Protected by `workerAuth`.
    - `GET /api/chunks/:hash` (line 52): Retrieves raw chunk buffer and sends it back. Protected by `workerAuth`.
    - `DELETE /api/chunks/:hash` (line 70): Calls `storage.deleteChunk(hash)`. Protected by `workerAuth`.
  - Directory structure anomaly: `src/worker/controllers` and `src/worker/routes` are completely empty directories.
- **Registration**:
  - `src/worker/server.js` (lines 86-108) sends POST request on startup to `http://${MASTER.HOST}:${MASTER.PORT}/api/system/workers/register` with `{ id, host, port }`.
  - `src/master/server.js` (lines 33-47) handles registration, calls `db.registerWorker()`, and adds worker to `hashRing`.
- **Circuit Breaker**:
  - **Missing**: No circuit breaker pattern (e.g. Opossum or failure threshold tracking) implemented in master or worker clients. Failed HTTP calls immediately throw or log errors without state transitions (Closed/Open/Half-Open).
- **Worker Management & Consistent Hashing**:
  - `src/services/consistentHash.js` implements a virtual node ring (`ConsistentHashRing`, default 150 virtual nodes per physical node).
  - **CRITICAL BUG IDENTIFIED**:
    - `src/services/consistentHash.js` (lines 93-98) returns an array of string worker IDs, e.g. `['worker-1', 'worker-2']`.
    - `src/services/chunker.js` (lines 24, 36, 43) expects `targetWorkers` to be an array of objects `{ id, host, port }`:
      ```javascript
      // Line 24
      const targetWorkers = hashRing.getNodes(hash, workerCount); 
      // Line 36
      workerIds: targetWorkers.map(w => w.id), // Evaluates to undefined!
      // Line 43
      const url = `http://${worker.host}:${worker.port}/api/chunks/${hash}`; // Evaluates to http://undefined:undefined/...
      ```
    - Result: Any call to upload a file fails with invalid URL / network error because `worker.host` and `worker.port` are `undefined`.

### Focus Area 3: Heartbeat & Replication Engine
- **Worker Health Checks**:
  - `src/services/heartbeat.service.js` (lines 15-60) runs a periodic interval (`HEARTBEAT_INTERVAL` default 5000ms).
  - Pings `http://${worker.host}:${worker.port}/health` for each registered worker.
  - On HTTP 200: Calls `db.updateWorkerHeartbeat()` and `hashRing.addNode(worker.id)`.
  - On HTTP failure: Increments `missedBeats`. If `missedBeats >= MAX_MISSED_BEATS` (3), marks worker status as `'dead'` in DB and executes `hashRing.removeNode(worker.id)`.
- **Chunk Replication**:
  - Initial chunk upload in `src/services/chunker.js` sends chunks to `REPLICATION_FACTOR` (default 2) workers.
  - **Missing**: No background replication service for fixing under-replicated chunks or re-balancing.
  - `src/services/heartbeat.service.js` line 48 contains an explicit unfulfilled comment: `// TODO: Trigger replication service to re-replicate chunks stored on this node`.
- **Failover**:
  - **Read Failover**: Implemented in `src/services/chunk.service.js` (lines 39-64). Iterates through `chunk.workerIds`, checks `worker.status === 'alive'`, and attempts download. If one worker fails, attempts next worker in `workerIds`.
  - **Write Failover**: `src/services/chunker.js` (lines 41-68) sends chunk to target workers. If all worker uploads fail (`successfulUploads === 0`), throws `ChunkError`. However, if 1 of 2 replicas fails, it does **not** pick a backup worker from the ring to maintain `REPLICATION_FACTOR`.

### Focus Area 4: File Management Implementation
- **File CRUD**:
  - `src/master/controllers/file.controller.js` and `src/master/routes/file.routes.js`:
    - `POST /api/files/upload`: Accepts file upload via Multer, checks storage quota against DB `users` table, creates file record with status `'uploading'`, calls `processFileStream`, updates file status to `'active'`, and deletes local temporary file.
    - `GET /api/files/:fileId`: Checks file ownership/public status, calls `streamDownload`.
    - `GET /api/files/`: Lists files owned by `req.user.id`.
    - `DELETE /api/files/:fileId`: Deletes record from `files` table and updates user `storageUsed`. Note: Orphaned chunk records and physical chunk files on worker disk are not deleted.
- **Directory Hierarchy / Folders**:
  - **Missing**: Database schema (`SqliteMetadataRepo.js` lines 34-49) has no `parentId`, `path`, or `isFolder` columns. No folder CRUD endpoints exist.
- **Versioning**:
  - **Missing**: No file versioning schema or logic in `src/`.
- **Trash / Soft Delete**:
  - **Missing**: File deletion is a hard SQL `DELETE`. No `isTrashed`, `deletedAt`, or restore functionality.
- **Search**:
  - **Missing**: No search endpoint or filename/metadata filtering.
- **Tagging**:
  - **Missing**: No tags schema, tagging endpoints, or tag-based filtering.

---

## 2. Logic Chain

1. **Architecture Misalignment**:
   - `package.json` specifies `"start": "node scripts/start-cluster.js"`, which boots `src/master/server.js` and `src/worker/server.js`.
   - However, existing unit/integration tests in `tests/` import and test `server/server.js` (the legacy monolithic MongoDB server).
   - *Conclusion*: The test suite is disconnected from the actual Master-Worker system in `src/`, meaning current tests pass/fail based on legacy code rather than verifying the new architecture.

2. **Chunker - Hash Ring Interface Mismatch**:
   - Observation: `ConsistentHashRing.getNodes()` returns `['worker-1', 'worker-2']` (array of strings).
   - Observation: `chunker.js` does `targetWorkers.map(w => w.id)` and `http://${worker.host}:${worker.port}/api/chunks/${hash}`.
   - Deduction: `worker.host` evaluates to `undefined`, `worker.port` evaluates to `undefined`.
   - *Conclusion*: File uploading in `src/` is currently broken and cannot communicate with worker nodes until `chunker.js` looks up worker objects from the DB using the returned worker IDs.

3. **Incomplete Core Features (Stage 4-7)**:
   - Observation: `IStorageRepository` has `LocalStorageRepo` implemented, but `R2StorageRepo` is missing.
   - Observation: `IMetadataRepository` has `SqliteMetadataRepo` implemented, but `MongoMetadataRepo` is missing.
   - Observation: Compression, Encryption, Circuit Breaker, Background Replication Engine, Folders, Versioning, Trash, Search, and Tagging have 0 implementation code in `src/`.
   - *Conclusion*: While basic structure exists for single-node presentation mode, critical enterprise storage, resilience, and file management features must be implemented from scratch.

---

## 3. Caveats

- **Network Mode**: Codebase investigation was performed strictly via local filesystem tools (`view_file`, `grep_search`, `find_by_name`, `list_dir`).
- **Cloud Mode Testing**: Cloud mode (`MODE=cloud`) relying on MongoDB Atlas and Cloudflare R2 was verified by code inspection only, as credentials in `.env` are placeholder strings (`your-account-id`, etc.).

---

## 4. Conclusion

### Summary Table of Component Status

| Component | Status | Location | Notes / Missing Items |
|---|---|---|---|
| **Master-Worker Topology** | **Implemented** | `src/master/server.js`, `src/worker/server.js` | Basic cluster startup working via `scripts/start-cluster.js`. |
| **Consistent Hashing** | **Buggy** | `src/services/consistentHash.js`, `src/services/chunker.js` | **BUG**: `getNodes()` returns strings, `chunker.js` expects `{ host, port }` objects. |
| **Storage Engine Streams** | **Partial** | `src/services/chunker.js`, `src/repositories/LocalStorageRepo.js` | Chunker streams reading, but `LocalStorageRepo` uses Buffer read/write. |
| **Deduplication** | **Partial** | `src/repositories/SqliteMetadataRepo.js` | DB upsert exists, but no pre-upload hash check to skip chunk transfer. |
| **Compression & Encryption** | **Missing** | N/A | No zlib compression or AES-256 encryption layers. |
| **Worker Node CRUD** | **Implemented** | `src/worker/server.js` | POST/GET/DELETE chunk endpoints working. Routes/controllers dirs empty. |
| **Circuit Breaker** | **Missing** | N/A | No circuit breaker or retry mechanism for worker requests. |
| **Heartbeat Service** | **Implemented** | `src/services/heartbeat.service.js` | Master pings worker `/health`, detects dead nodes, updates hash ring. |
| **Replication Engine** | **Missing** | `src/services/heartbeat.service.js:48` | Read failover works; background chunk re-replication on node failure missing. |
| **File CRUD** | **Implemented** | `src/master/controllers/file.controller.js` | Upload, Download, List, Delete implemented. |
| **Folders / Directory Hierarchy** | **Missing** | N/A | No `parentId` schema or folder endpoints. |
| **Versioning, Trash, Search, Tags** | **Missing** | N/A | No version history, soft delete, search API, or tagging system. |
| **Dual Mode (Cloud/R2/Mongo)** | **Missing** | `src/repositories/` | `MongoMetadataRepo.js` and `R2StorageRepo.js` do not exist. |
| **Automated E2E Test Suite** | **Missing** | `tests/` | Existing tests target legacy `server/` codebase instead of `src/` cluster. |

---

## 5. Verification Method

To independently verify the observations and findings in this report:

1. **Verify Hash Ring Bug in `chunker.js`**:
   - Inspect `c:\Users\xavir\OneDrive\Desktop\DFUS\src\services\consistentHash.js` lines 92-98 (`getNodes` returns string IDs).
   - Inspect `c:\Users\xavir\OneDrive\Desktop\DFUS\src\services\chunker.js` lines 24 & 43 (`worker.host` and `worker.port` called on string ID).

2. **Verify Missing Replication Engine**:
   - Inspect `c:\Users\xavir\OneDrive\Desktop\DFUS\src\services\heartbeat.service.js` line 48 (`// TODO: Trigger replication service...`).

3. **Verify Disconnected Test Suite**:
   - Inspect `c:\Users\xavir\OneDrive\Desktop\DFUS\tests\chunk.test.js` line 107 (`require('../server/src/models/FileChunk')` references `server/` instead of `src/`).

4. **Run Cluster & Test**:
   - Command: `npm start` (launches `scripts/start-cluster.js`).
