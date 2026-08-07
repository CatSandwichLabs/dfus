# Handoff Report: Milestone M2 - Database Layer (Interface & SQLite Implementation)

## 1. Observation

A comprehensive code investigation of `src/repositories/IMetadataRepository.js`, `src/repositories/SqliteMetadataRepo.js`, `src/repositories/database.js`, and caller services/middlewares (`src/services/chunk.service.js`, `src/services/heartbeat.service.js`, `src/middleware/authenticate.js`, `tests/e2e/e2e.test.js`) revealed the following exact observations:

1. **Missing Methods in Existing SQLite Repository**:
   - `src/services/chunk.service.js` line 40 invokes `await db.findWorkerById(workerId)`. `SqliteMetadataRepo.js` lacks `findWorkerById`, causing runtime exceptions when attempting to resolve worker node details during chunk downloading.
   - `src/middleware/authenticate.js` line 29 checks `await db.getAllUsers()`. `SqliteMetadataRepo.js` lacks `getAllUsers()`, falling back to `[]` and breaking first-user admin provisioning logic (`config.AUTH.FIRST_USER_ADMIN`).

2. **Incomplete Repository Interface Contract (`IMetadataRepository.js`)**:
   - The interface currently declares 24 methods, omitting method signatures required by upcoming milestones:
     - **Users**: missing `updateUserRole` / `updateRole`, `updateUserStorageUsed` / `updateStorageUsed`.
     - **Files**: missing `findFilesByParentId` / `findByParentId`, `updateFileMetadata` / `updateMetadata`, `searchFiles` / `search`.
     - **Chunks**: missing explicit `linkFileChunk` alias and `updateChunkWorkers` signature alignment.
     - **Workers**: missing `findWorkerById`, `getDeadWorkers`, `removeWorker`.
     - **Resumable Upload Sessions**: completely absent (`createUploadSession`, `findUploadSessionById`, `addChunkToSession`, `getUploadedChunksForSession`, `completeUploadSession`, `cancelUploadSession`).
     - **Share Tokens**: completely absent (`createShareToken`, `findFileByShareToken`, `revokeShareToken`).
     - **Folders**: completely absent (`createFolder`, `getChildFolders`, `getFolderBreadcrumb`).
     - **Refresh Tokens**: missing `deleteAllUserRefreshTokens` and `deleteExpiredTokens`.

3. **Database Schema Gaps (`SqliteMetadataRepo.js`)**:
   - `files` table lacks columns for hierarchical folder management (`parentId`), folder flag (`isFolder`), file tagging (`tags`), soft deletion (`isDeleted`, `deletedAt`), and timestamp auditing (`updatedAt`).
   - `users` table lacks authentication metadata columns (`passwordHash`, `twoFactorEnabled`, `twoFactorSecret`).
   - Tables for `upload_sessions` and `share_tokens` are missing entirely.
   - Database lacks performance indexes on query filters and foreign keys (`idx_files_userId`, `idx_files_parentId`, `idx_files_shareToken`, `idx_files_status`, `idx_file_chunks_chunkHash`, `idx_workers_status`, `idx_upload_sessions_userId`, `idx_share_tokens_token`, `idx_refresh_tokens_userId`).

---

## 2. Logic Chain

1. **Caller Requirement Verification**:
   - In `chunk.service.js:40`, the file streaming service resolves `workerId` via `findWorkerById(workerId)` to retrieve worker IP and port. Adding `findWorkerById(workerId)` to `SqliteMetadataRepo.js` directly satisfies this dependency.
   - In `authenticate.js:29`, the authentication middleware checks user count via `getAllUsers()`. Adding `getAllUsers()` guarantees accurate first-user admin bootstrapping.

2. **Interface Specification & Backward Compatibility**:
   - To accommodate both explicit method calls (`createUser`, `findUserById`, `linkChunkToFile`) and standard spec aliases (`create`, `findById`, `linkFileChunk`, `updateRole`, `updateStorageUsed`), `IMetadataRepository.js` should declare standard methods and delegate alias methods.
   - This ensures full backward compatibility with M1 code while establishing a standard contract for M2 SQLite and MongoDB implementations.

3. **Database Performance & Integrity**:
   - `better-sqlite3` provides high performance when configured with `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, and `PRAGMA synchronous = NORMAL`.
   - Adding explicit DDL indexes on foreign key relationships and frequently queried filter columns (`userId`, `parentId`, `shareToken`, `status`, `fileHash`, `tokenHash`) prevents table scans when managing thousands of 5MB chunks.
   - SQLite recursive CTEs (`WITH RECURSIVE breadcrumb AS (...)`) provide zero-dependency, single-query breadcrumb generation for folder hierarchies (`getFolderBreadcrumb`).

---

## 3. Caveats

- **MongoDB Cloud Mode**: `MongoMetadataRepo.js` is part of the parallel MongoDB M2 task. This handoff focuses on completing `IMetadataRepository.js` interface contract and `SqliteMetadataRepo.js`.
- **E2E Baseline**: The current E2E test suite (`tests/e2e/e2e.test.js`) verifies basic file upload and chunking, passing with 15/15 tests. Unit tests for new repository methods (upload sessions, folders, share tokens) will be added during implementation.

---

## 4. Conclusion

The database layer interface (`IMetadataRepository.js`) and SQLite implementation (`SqliteMetadataRepo.js`) must be upgraded to support all 8 domain modules (Users, Files, Chunks, Workers, Upload Sessions, Share Tokens, Folders, Refresh Tokens) plus lifecycle management.

Below is the exact code implementation plan for the implementer agent.

---

## 5. Verification Method

To verify the changes after implementation:

1. **Verify Interface & SQLite Implementation Completeness**:
   Inspect `src/repositories/IMetadataRepository.js` and `src/repositories/SqliteMetadataRepo.js` to ensure every declared method is implemented.

2. **Run E2E Verification Suite**:
   Execute the automated E2E test suite:
   ```bash
   npx jest tests/e2e/e2e.test.js
   ```
   All 15 tests must pass with 0 errors.

3. **Execute Custom Repository Method Test**:
   Run a node script verifying every method across all 8 domain modules against an in-memory or temporary SQLite database.

---

# Implementation Plan & Source Code Specification

### File 1: `src/repositories/IMetadataRepository.js`

```javascript
/**
 * IMetadataRepository - Abstract Interface for Database Operations
 * Strictly defines contract for SQLite and MongoDB implementations.
 */
class IMetadataRepository {
  // --- Users ---
  async createUser(userData) { throw new Error('Not implemented'); }
  async create(userData) { return this.createUser(userData); }
  async findUserById(userId) { throw new Error('Not implemented'); }
  async findById(userId) { return this.findUserById(userId); }
  async findUserByEmail(email) { throw new Error('Not implemented'); }
  async findByEmail(email) { return this.findUserByEmail(email); }
  async findUserByUsername(username) { throw new Error('Not implemented'); }
  async getAllUsers(options) { throw new Error('Not implemented'); }
  async updateUser(userId, updateData) { throw new Error('Not implemented'); }
  async updateUserRole(userId, role) { throw new Error('Not implemented'); }
  async updateRole(userId, role) { return this.updateUserRole(userId, role); }
  async updateUserStorageUsed(userId, storageUsed) { throw new Error('Not implemented'); }
  async updateStorageUsed(userId, storageUsed) { return this.updateUserStorageUsed(userId, storageUsed); }
  async deleteUser(userId) { throw new Error('Not implemented'); }

  // --- Files ---
  async createFile(fileData) { throw new Error('Not implemented'); }
  async findFileById(fileId) { throw new Error('Not implemented'); }
  async findFilesByUserId(userId, options) { throw new Error('Not implemented'); }
  async findFilesByParentId(userId, parentId, options) { throw new Error('Not implemented'); }
  async findByParentId(userId, parentId, options) { return this.findFilesByParentId(userId, parentId, options); }
  async updateFileStatus(fileId, status, checksum) { throw new Error('Not implemented'); }
  async updateFileMetadata(fileId, updateData) { throw new Error('Not implemented'); }
  async updateMetadata(fileId, updateData) { return this.updateFileMetadata(fileId, updateData); }
  async searchFiles(userId, query, options) { throw new Error('Not implemented'); }
  async search(userId, query, options) { return this.searchFiles(userId, query, options); }
  async deleteFile(fileId) { throw new Error('Not implemented'); }
  async delete(fileId) { return this.deleteFile(fileId); }
  async getAllFiles(options) { throw new Error('Not implemented'); }
  async getFileCount() { throw new Error('Not implemented'); }
  async getTotalStorageUsed() { throw new Error('Not implemented'); }

  // --- Chunks ---
  async createChunk(chunkData) { throw new Error('Not implemented'); }
  async findChunkByHash(chunkHash) { throw new Error('Not implemented'); }
  async findByHash(chunkHash) { return this.findChunkByHash(chunkHash); }
  async findChunksByFileId(fileId) { throw new Error('Not implemented'); }
  async findByFileId(fileId) { return this.findChunksByFileId(fileId); }
  async linkChunkToFile(fileId, chunkHash, chunkIndex) { throw new Error('Not implemented'); }
  async linkFileChunk(fileId, chunkHash, chunkIndex) { return this.linkChunkToFile(fileId, chunkHash, chunkIndex); }
  async updateChunkWorkers(chunkHash, workerIds) { throw new Error('Not implemented'); }
  async updateChunkStatus(chunkHash, status) { throw new Error('Not implemented'); }
  async getOrphanedChunks() { throw new Error('Not implemented'); }
  async deleteChunksByFileId(fileId) { throw new Error('Not implemented'); }
  async getChunksByWorkerId(workerId) { throw new Error('Not implemented'); }

  // --- Workers ---
  async registerWorker(workerData) { throw new Error('Not implemented'); }
  async register(workerData) { return this.registerWorker(workerData); }
  async findWorkerById(workerId) { throw new Error('Not implemented'); }
  async updateWorkerHeartbeat(workerId, stats) { throw new Error('Not implemented'); }
  async updateWorkerStatus(workerId, status) { throw new Error('Not implemented'); }
  async getAllWorkers() { throw new Error('Not implemented'); }
  async getAliveWorkers() { throw new Error('Not implemented'); }
  async getDeadWorkers() { throw new Error('Not implemented'); }
  async removeWorker(workerId) { throw new Error('Not implemented'); }

  // --- Resumable Upload Sessions ---
  async createUploadSession(sessionData) { throw new Error('Not implemented'); }
  async findUploadSessionById(sessionId) { throw new Error('Not implemented'); }
  async addChunkToSession(sessionId, chunkIndex, chunkHash) { throw new Error('Not implemented'); }
  async getUploadedChunksForSession(sessionId) { throw new Error('Not implemented'); }
  async completeUploadSession(sessionId) { throw new Error('Not implemented'); }
  async cancelUploadSession(sessionId) { throw new Error('Not implemented'); }

  // --- Share Tokens ---
  async createShareToken(shareData) { throw new Error('Not implemented'); }
  async findFileByShareToken(shareToken) { throw new Error('Not implemented'); }
  async revokeShareToken(shareToken) { throw new Error('Not implemented'); }

  // --- Folders ---
  async createFolder(folderData) { throw new Error('Not implemented'); }
  async getChildFolders(userId, parentId) { throw new Error('Not implemented'); }
  async getFolderBreadcrumb(folderId) { throw new Error('Not implemented'); }

  // --- Refresh Tokens ---
  async createRefreshToken(tokenData) { throw new Error('Not implemented'); }
  async findRefreshToken(tokenHash) { throw new Error('Not implemented'); }
  async deleteRefreshToken(tokenHash) { throw new Error('Not implemented'); }
  async deleteAllUserRefreshTokens(userId) { throw new Error('Not implemented'); }
  async deleteExpiredTokens() { throw new Error('Not implemented'); }

  // --- Lifecycle ---
  async close() { throw new Error('Not implemented'); }
}

module.exports = IMetadataRepository;
```

---

### File 2: `src/repositories/SqliteMetadataRepo.js`

```javascript
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const IMetadataRepository = require('./IMetadataRepository');
const config = require('../config/env');

class SqliteMetadataRepo extends IMetadataRepository {
  constructor() {
    super();
    const dbPath = path.resolve(config.SQLITE.DB_PATH);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT,
        role TEXT DEFAULT 'user',
        storageUsed INTEGER DEFAULT 0,
        storageQuota INTEGER DEFAULT ${config.STORAGE.DEFAULT_QUOTA},
        twoFactorEnabled INTEGER DEFAULT 0,
        twoFactorSecret TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastLoginAt DATETIME
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        parentId TEXT DEFAULT NULL,
        originalName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        totalSize INTEGER NOT NULL,
        chunkSize INTEGER NOT NULL,
        totalChunks INTEGER NOT NULL,
        checksum TEXT,
        shareToken TEXT UNIQUE,
        isPublic INTEGER DEFAULT 0,
        isFolder INTEGER DEFAULT 0,
        status TEXT DEFAULT 'uploading',
        tags TEXT,
        version INTEGER DEFAULT 1,
        isDeleted INTEGER DEFAULT 0,
        deletedAt DATETIME,
        expiresAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parentId) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chunks (
        hash TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        workerIds TEXT NOT NULL,
        status TEXT DEFAULT 'stored',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS file_chunks (
        fileId TEXT NOT NULL,
        chunkHash TEXT NOT NULL,
        chunkIndex INTEGER NOT NULL,
        PRIMARY KEY (fileId, chunkIndex),
        FOREIGN KEY (fileId) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY (chunkHash) REFERENCES chunks(hash) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        status TEXT DEFAULT 'alive',
        lastHeartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
        missedBeats INTEGER DEFAULT 0,
        chunksStored INTEGER DEFAULT 0,
        diskUsage INTEGER DEFAULT 0,
        registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        fileId TEXT,
        fileHash TEXT,
        originalName TEXT NOT NULL,
        mimeType TEXT,
        totalSize INTEGER NOT NULL,
        chunkSize INTEGER NOT NULL,
        totalChunks INTEGER NOT NULL,
        uploadedChunks TEXT DEFAULT '[]',
        status TEXT DEFAULT 'in_progress',
        expiresAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS share_tokens (
        id TEXT PRIMARY KEY,
        fileId TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        permissions TEXT DEFAULT 'read',
        passwordHash TEXT,
        maxDownloads INTEGER DEFAULT NULL,
        downloadCount INTEGER DEFAULT 0,
        expiresAt DATETIME DEFAULT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fileId) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        tokenHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt DATETIME NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_files_userId ON files(userId);
      CREATE INDEX IF NOT EXISTS idx_files_parentId ON files(userId, parentId);
      CREATE INDEX IF NOT EXISTS idx_files_shareToken ON files(shareToken);
      CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
      CREATE INDEX IF NOT EXISTS idx_files_isFolder ON files(userId, isFolder);
      CREATE INDEX IF NOT EXISTS idx_file_chunks_chunkHash ON file_chunks(chunkHash);
      CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_userId ON upload_sessions(userId);
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_fileHash ON upload_sessions(fileHash);
      CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_share_tokens_fileId ON share_tokens(fileId);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userId ON refresh_tokens(userId);
    `);
  }

  // --- Users ---
  async createUser(user) {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, passwordHash, role, storageQuota)
      VALUES (@id, @username, @email, @passwordHash, @role, @storageQuota)
    `);
    stmt.run({
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash || null,
      role: user.role || 'user',
      storageQuota: user.storageQuota || config.STORAGE.DEFAULT_QUOTA
    });
    return this.findUserById(user.id);
  }

  async findUserById(userId) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }

  async findUserByEmail(email) {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  async findUserByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  async getAllUsers(options = {}) {
    return this.db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
  }

  async updateUser(userId, updateData) {
    const keys = Object.keys(updateData);
    if (keys.length === 0) return this.findUserById(userId);
    
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => updateData[k]);
    values.push(userId);
    
    this.db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values);
    return this.findUserById(userId);
  }

  async updateUserRole(userId, role) {
    this.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    return this.findUserById(userId);
  }

  async updateUserStorageUsed(userId, storageUsed) {
    this.db.prepare('UPDATE users SET storageUsed = ? WHERE id = ?').run(storageUsed, userId);
    return this.findUserById(userId);
  }

  async deleteUser(userId) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // --- Files ---
  async createFile(fileData) {
    const stmt = this.db.prepare(`
      INSERT INTO files (id, userId, parentId, originalName, mimeType, totalSize, chunkSize, totalChunks, checksum, status, isFolder, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tagsStr = fileData.tags ? (Array.isArray(fileData.tags) ? JSON.stringify(fileData.tags) : fileData.tags) : null;
    stmt.run(
      fileData.id,
      fileData.userId,
      fileData.parentId || null,
      fileData.originalName,
      fileData.mimeType,
      fileData.totalSize,
      fileData.chunkSize,
      fileData.totalChunks,
      fileData.checksum || null,
      fileData.status || 'uploading',
      fileData.isFolder ? 1 : 0,
      tagsStr
    );
    return this.findFileById(fileData.id);
  }

  async findFileById(fileId) {
    return this.db.prepare('SELECT * FROM files WHERE id = ? AND isDeleted = 0').get(fileId);
  }

  async findFilesByUserId(userId, options = {}) {
    return this.db.prepare('SELECT * FROM files WHERE userId = ? AND isDeleted = 0 ORDER BY createdAt DESC').all(userId);
  }

  async findFilesByParentId(userId, parentId = null, options = {}) {
    return this.db.prepare('SELECT * FROM files WHERE userId = ? AND parentId IS ? AND isDeleted = 0 ORDER BY isFolder DESC, originalName ASC').all(userId, parentId);
  }

  async updateFileStatus(fileId, status, checksum) {
    if (checksum) {
      this.db.prepare('UPDATE files SET status = ?, checksum = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(status, checksum, fileId);
    } else {
      this.db.prepare('UPDATE files SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(status, fileId);
    }
    return this.findFileById(fileId);
  }

  async updateFileMetadata(fileId, updateData) {
    const keys = Object.keys(updateData);
    if (keys.length === 0) return this.findFileById(fileId);
    
    if (updateData.tags && Array.isArray(updateData.tags)) {
      updateData.tags = JSON.stringify(updateData.tags);
    }
    const setClause = keys.map(k => `${k} = ?`).join(', ') + ', updatedAt = CURRENT_TIMESTAMP';
    const values = keys.map(k => updateData[k]);
    values.push(fileId);

    this.db.prepare(`UPDATE files SET ${setClause} WHERE id = ?`).run(...values);
    return this.findFileById(fileId);
  }

  async searchFiles(userId, query, options = {}) {
    const pattern = `%${query}%`;
    return this.db.prepare('SELECT * FROM files WHERE userId = ? AND originalName LIKE ? AND isDeleted = 0 ORDER BY createdAt DESC').all(userId, pattern);
  }

  async deleteFile(fileId) {
    this.db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  }

  async getAllFiles(options = {}) {
    return this.db.prepare('SELECT * FROM files WHERE isDeleted = 0 ORDER BY createdAt DESC').all();
  }

  async getFileCount() {
    const res = this.db.prepare('SELECT COUNT(*) as count FROM files WHERE isFolder = 0 AND isDeleted = 0').get();
    return res ? res.count : 0;
  }

  async getTotalStorageUsed() {
    const res = this.db.prepare('SELECT SUM(totalSize) as total FROM files WHERE isFolder = 0 AND isDeleted = 0').get();
    return res ? (res.total || 0) : 0;
  }

  // --- Chunks ---
  async createChunk(chunkData) {
    const workerIdsStr = JSON.stringify(chunkData.workerIds || []);
    this.db.prepare(`
      INSERT INTO chunks (hash, size, workerIds, status) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET workerIds=excluded.workerIds, status=excluded.status
    `).run(chunkData.hash, chunkData.size, workerIdsStr, chunkData.status || 'stored');
  }

  async findChunkByHash(chunkHash) {
    const row = this.db.prepare('SELECT * FROM chunks WHERE hash = ?').get(chunkHash);
    if (row && row.workerIds) row.workerIds = JSON.parse(row.workerIds);
    return row;
  }

  async findChunksByFileId(fileId) {
    const rows = this.db.prepare(`
      SELECT c.*, fc.chunkIndex 
      FROM chunks c 
      JOIN file_chunks fc ON c.hash = fc.chunkHash 
      WHERE fc.fileId = ? 
      ORDER BY fc.chunkIndex ASC
    `).all(fileId);
    
    return rows.map(r => ({ ...r, workerIds: JSON.parse(r.workerIds) }));
  }

  async linkChunkToFile(fileId, chunkHash, chunkIndex) {
    this.db.prepare('INSERT INTO file_chunks (fileId, chunkHash, chunkIndex) VALUES (?, ?, ?)').run(fileId, chunkHash, chunkIndex);
  }

  async updateChunkWorkers(chunkHash, workerIds) {
    const workerIdsStr = JSON.stringify(workerIds);
    this.db.prepare('UPDATE chunks SET workerIds = ? WHERE hash = ?').run(workerIdsStr, chunkHash);
  }

  async updateChunkStatus(chunkHash, status) {
    this.db.prepare('UPDATE chunks SET status = ? WHERE hash = ?').run(status, chunkHash);
  }

  async getOrphanedChunks() {
    const rows = this.db.prepare(`
      SELECT * FROM chunks 
      WHERE hash NOT IN (SELECT DISTINCT chunkHash FROM file_chunks)
    `).all();
    return rows.map(r => ({ ...r, workerIds: JSON.parse(r.workerIds) }));
  }

  async deleteChunksByFileId(fileId) {
    this.db.prepare('DELETE FROM file_chunks WHERE fileId = ?').run(fileId);
  }

  async getChunksByWorkerId(workerId) {
    const rows = this.db.prepare('SELECT * FROM chunks').all();
    return rows
      .map(r => ({ ...r, workerIds: JSON.parse(r.workerIds) }))
      .filter(r => r.workerIds.includes(workerId));
  }

  // --- Workers ---
  async registerWorker(workerData) {
    this.db.prepare(`
      INSERT INTO workers (id, host, port, status) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status='alive', lastHeartbeat=CURRENT_TIMESTAMP, missedBeats=0, host=excluded.host, port=excluded.port
    `).run(workerData.id, workerData.host, workerData.port, workerData.status || 'alive');
    return this.findWorkerById(workerData.id);
  }

  async findWorkerById(workerId) {
    return this.db.prepare('SELECT * FROM workers WHERE id = ?').get(workerId);
  }

  async updateWorkerHeartbeat(workerId, stats) {
    this.db.prepare(`
      UPDATE workers 
      SET lastHeartbeat = CURRENT_TIMESTAMP, missedBeats = 0, status = 'alive', chunksStored = ?, diskUsage = ?
      WHERE id = ?
    `).run(stats.chunksStored || 0, stats.diskUsage || 0, workerId);
  }

  async updateWorkerStatus(workerId, status) {
    this.db.prepare('UPDATE workers SET status = ? WHERE id = ?').run(status, workerId);
  }

  async getAllWorkers() {
    return this.db.prepare('SELECT * FROM workers').all();
  }

  async getAliveWorkers() {
    return this.db.prepare("SELECT * FROM workers WHERE status = 'alive'").all();
  }

  async getDeadWorkers() {
    return this.db.prepare("SELECT * FROM workers WHERE status = 'dead'").all();
  }

  async removeWorker(workerId) {
    this.db.prepare('DELETE FROM workers WHERE id = ?').run(workerId);
  }

  // --- Resumable Upload Sessions ---
  async createUploadSession(sessionData) {
    const stmt = this.db.prepare(`
      INSERT INTO upload_sessions (id, userId, fileId, fileHash, originalName, mimeType, totalSize, chunkSize, totalChunks, uploadedChunks, status, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const uploadedChunksStr = JSON.stringify(sessionData.uploadedChunks || []);
    stmt.run(
      sessionData.id,
      sessionData.userId,
      sessionData.fileId || null,
      sessionData.fileHash || null,
      sessionData.originalName,
      sessionData.mimeType || 'application/octet-stream',
      sessionData.totalSize,
      sessionData.chunkSize,
      sessionData.totalChunks,
      uploadedChunksStr,
      sessionData.status || 'in_progress',
      sessionData.expiresAt || null
    );
    return this.findUploadSessionById(sessionData.id);
  }

  async findUploadSessionById(sessionId) {
    const row = this.db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);
    if (row && row.uploadedChunks) row.uploadedChunks = JSON.parse(row.uploadedChunks);
    return row;
  }

  async addChunkToSession(sessionId, chunkIndex, chunkHash) {
    const session = await this.findUploadSessionById(sessionId);
    if (!session) return null;

    const uploaded = new Set(session.uploadedChunks || []);
    uploaded.add(chunkIndex);
    const updatedChunksStr = JSON.stringify(Array.from(uploaded));

    this.db.prepare(`
      UPDATE upload_sessions 
      SET uploadedChunks = ?, updatedAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(updatedChunksStr, sessionId);

    return this.findUploadSessionById(sessionId);
  }

  async getUploadedChunksForSession(sessionId) {
    const session = await this.findUploadSessionById(sessionId);
    return session ? session.uploadedChunks : [];
  }

  async completeUploadSession(sessionId) {
    this.db.prepare("UPDATE upload_sessions SET status = 'completed', updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
    return this.findUploadSessionById(sessionId);
  }

  async cancelUploadSession(sessionId) {
    this.db.prepare("UPDATE upload_sessions SET status = 'cancelled', updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
    return this.findUploadSessionById(sessionId);
  }

  // --- Share Tokens ---
  async createShareToken(shareData) {
    const stmt = this.db.prepare(`
      INSERT INTO share_tokens (id, fileId, token, permissions, passwordHash, maxDownloads, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      shareData.id,
      shareData.fileId,
      shareData.token,
      shareData.permissions || 'read',
      shareData.passwordHash || null,
      shareData.maxDownloads || null,
      shareData.expiresAt || null
    );
    this.db.prepare('UPDATE files SET shareToken = ?, isPublic = 1 WHERE id = ?').run(shareData.token, shareData.fileId);
    return this.db.prepare('SELECT * FROM share_tokens WHERE token = ?').get(shareData.token);
  }

  async findFileByShareToken(shareToken) {
    return this.db.prepare(`
      SELECT f.*, st.permissions, st.passwordHash as sharePasswordHash
      FROM files f
      LEFT JOIN share_tokens st ON f.id = st.fileId
      WHERE f.shareToken = ? OR st.token = ?
    `).get(shareToken, shareToken);
  }

  async revokeShareToken(shareToken) {
    this.db.prepare('DELETE FROM share_tokens WHERE token = ?').run(shareToken);
    this.db.prepare('UPDATE files SET shareToken = NULL, isPublic = 0 WHERE shareToken = ?').run(shareToken);
  }

  // --- Folders ---
  async createFolder(folderData) {
    return this.createFile({
      id: folderData.id,
      userId: folderData.userId,
      parentId: folderData.parentId || null,
      originalName: folderData.name || folderData.originalName,
      mimeType: 'application/x-directory',
      totalSize: 0,
      chunkSize: 0,
      totalChunks: 0,
      status: 'active',
      isFolder: 1
    });
  }

  async getChildFolders(userId, parentId = null) {
    return this.db.prepare('SELECT * FROM files WHERE userId = ? AND parentId IS ? AND isFolder = 1 AND isDeleted = 0 ORDER BY originalName ASC').all(userId, parentId);
  }

  async getFolderBreadcrumb(folderId) {
    const stmt = this.db.prepare(`
      WITH RECURSIVE breadcrumb AS (
        SELECT id, userId, parentId, originalName, 0 as depth FROM files WHERE id = ?
        UNION ALL
        SELECT f.id, f.userId, f.parentId, f.originalName, b.depth + 1
        FROM files f JOIN breadcrumb b ON f.id = b.parentId
      )
      SELECT id, originalName, parentId FROM breadcrumb ORDER BY depth DESC;
    `);
    return stmt.all(folderId);
  }

  // --- Refresh Tokens ---
  async createRefreshToken(tokenData) {
    this.db.prepare('INSERT INTO refresh_tokens (tokenHash, userId, expiresAt) VALUES (?, ?, ?)').run(tokenData.tokenHash, tokenData.userId, tokenData.expiresAt);
    return this.findRefreshToken(tokenData.tokenHash);
  }

  async findRefreshToken(tokenHash) {
    return this.db.prepare('SELECT * FROM refresh_tokens WHERE tokenHash = ?').get(tokenHash);
  }

  async deleteRefreshToken(tokenHash) {
    this.db.prepare('DELETE FROM refresh_tokens WHERE tokenHash = ?').run(tokenHash);
  }

  async deleteAllUserRefreshTokens(userId) {
    this.db.prepare('DELETE FROM refresh_tokens WHERE userId = ?').run(userId);
  }

  async deleteExpiredTokens() {
    this.db.prepare('DELETE FROM refresh_tokens WHERE expiresAt < CURRENT_TIMESTAMP').run();
  }

  // --- Lifecycle ---
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = SqliteMetadataRepo;
```
