const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const IMetadataRepository = require('./IMetadataRepository');
const config = require('../config/env');

class SqliteMetadataRepo extends IMetadataRepository {
  constructor() {
    super();
    const dbPath = path.resolve(config.SQLITE.DB_PATH);
    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT DEFAULT 'user',
        storageUsed INTEGER DEFAULT 0,
        storageQuota INTEGER DEFAULT ${config.STORAGE.DEFAULT_QUOTA},
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastLoginAt DATETIME
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        originalName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        totalSize INTEGER NOT NULL,
        chunkSize INTEGER NOT NULL,
        totalChunks INTEGER NOT NULL,
        checksum TEXT,
        shareToken TEXT UNIQUE,
        isPublic INTEGER DEFAULT 0,
        status TEXT DEFAULT 'uploading',
        expiresAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chunks (
        hash TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        workerIds TEXT NOT NULL, -- JSON array of worker IDs
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

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        tokenHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt DATETIME NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  // --- Users ---
  async createUser(user) {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, role)
      VALUES (@id, @username, @email, @role)
    `);
    
    stmt.run({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'user'
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

  async updateUser(userId, updateData) {
    const keys = Object.keys(updateData);
    if (keys.length === 0) return this.findUserById(userId);
    
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => updateData[k]);
    values.push(userId);
    
    this.db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values);
    return this.findUserById(userId);
  }

  async deleteUser(userId) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // --- Files ---
  async createFile(fileData) {
    const stmt = this.db.prepare(
      'INSERT INTO files (id, userId, originalName, mimeType, totalSize, chunkSize, totalChunks, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(fileData.id, fileData.userId, fileData.originalName, fileData.mimeType, fileData.totalSize, fileData.chunkSize, fileData.totalChunks, fileData.status || 'uploading');
    return this.findFileById(fileData.id);
  }

  async findFileById(fileId) {
    return this.db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  }
  
  async findFilesByUserId(userId, options = {}) {
    // Pagination & sort logic could go here
    return this.db.prepare('SELECT * FROM files WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  }

  async updateFileStatus(fileId, status, checksum) {
    if (checksum) {
      this.db.prepare('UPDATE files SET status = ?, checksum = ? WHERE id = ?').run(status, checksum, fileId);
    } else {
      this.db.prepare('UPDATE files SET status = ? WHERE id = ?').run(status, fileId);
    }
  }

  async deleteFile(fileId) {
    // Rely on ON DELETE CASCADE for file_chunks
    this.db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  }

  // --- Chunks ---
  async createChunk(chunkData) {
    // UPSERT basically (if chunk already exists, we might just update it)
    const workerIdsStr = JSON.stringify(chunkData.workerIds || []);
    this.db.prepare(`
      INSERT INTO chunks (hash, size, workerIds, status) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET workerIds=excluded.workerIds
    `).run(chunkData.hash, chunkData.size, workerIdsStr, chunkData.status || 'stored');
  }

  async linkChunkToFile(fileId, chunkHash, chunkIndex) {
    this.db.prepare('INSERT INTO file_chunks (fileId, chunkHash, chunkIndex) VALUES (?, ?, ?)').run(fileId, chunkHash, chunkIndex);
  }

  async findChunksByFileId(fileId) {
    const rows = this.db.prepare(`
      SELECT c.*, fc.chunkIndex 
      FROM chunks c 
      JOIN file_chunks fc ON c.hash = fc.chunkHash 
      WHERE fc.fileId = ? 
      ORDER BY fc.chunkIndex ASC
    `).all(fileId);
    
    return rows.map(r => ({...r, workerIds: JSON.parse(r.workerIds)}));
  }

  async findChunkByHash(chunkHash) {
    const row = this.db.prepare('SELECT * FROM chunks WHERE hash = ?').get(chunkHash);
    if (row) row.workerIds = JSON.parse(row.workerIds);
    return row;
  }

  // --- Workers ---
  async registerWorker(workerData) {
    this.db.prepare(`
      INSERT INTO workers (id, host, port, status) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status='alive', lastHeartbeat=CURRENT_TIMESTAMP, missedBeats=0, host=excluded.host, port=excluded.port
    `).run(workerData.id, workerData.host, workerData.port, workerData.status || 'alive');
  }

  async getAliveWorkers() {
    return this.db.prepare("SELECT * FROM workers WHERE status = 'alive'").all();
  }

  async getAllWorkers() {
    return this.db.prepare("SELECT * FROM workers").all();
  }

  async updateWorkerHeartbeat(workerId, stats) {
    this.db.prepare(`
      UPDATE workers 
      SET lastHeartbeat = CURRENT_TIMESTAMP, missedBeats = 0, status = 'alive', chunksStored = ?, diskUsage = ?
      WHERE id = ?
    `).run(stats.chunksStored || 0, stats.diskUsage || 0, workerId);
  }
}

module.exports = SqliteMetadataRepo;
