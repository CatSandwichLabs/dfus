# Milestone M2 Handoff Report: MongoDB Repository & Mongoose Schemas Implementation

## 1. Observation

### 1.1 Existing Abstract Interface (`src/repositories/IMetadataRepository.js`)
Inspection of `src/repositories/IMetadataRepository.js` (lines 1-58) reveals 31 methods defining the standard database contract for DFUS:
- **Users**: `createUser`, `findUserById`, `findUserByEmail`, `findUserByUsername`, `updateUser`, `deleteUser`, `getAllUsers`
- **Files**: `createFile`, `findFileById`, `findFilesByUserId`, `findFileByShareToken`, `updateFileStatus`, `updateFileShareToken`, `deleteFile`, `getAllFiles`, `getFileCount`, `getTotalStorageUsed`
- **Chunks**: `createChunk`, `findChunksByFileId`, `findChunkByHash`, `updateChunkWorkers`, `updateChunkStatus`, `deleteChunksByFileId`, `getChunksByWorkerId`, `getOrphanedChunks`
- **Workers**: `registerWorker`, `findWorkerById`, `updateWorkerHeartbeat`, `updateWorkerStatus`, `getAllWorkers`, `getAliveWorkers`, `getDeadWorkers`, `removeWorker`
- **Refresh Tokens**: `createRefreshToken`, `findRefreshToken`, `deleteRefreshToken`, `deleteAllUserRefreshTokens`, `deleteExpiredTokens`
- **Lifecycle**: `close`

### 1.2 Database Factory (`src/repositories/database.js`)
Inspection of `src/repositories/database.js` (lines 1-22) shows:
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
    }
  }
  return dbInstance;
}
```
`MongoMetadataRepo` is currently commented out, and calling `getDatabase()` in `cloud` mode throws an unhandled Error.

### 1.3 System Dependencies (`package.json`)
Inspection of `package.json` confirms that Mongoose and MongoDB test tooling are already installed:
- `"mongoose": "^8.24.2"` (dependencies)
- `"mongodb-memory-server": "^10.1.4"` (devDependencies)

### 1.4 Required Entities & Indexing Specs
Per project prompt & milestone specs, the system requires Mongoose schemas for 8 entities with specific index requirements:
1. `User` (Index: `email`, `username`)
2. `FileRecord` (Index: `userId`, `shareToken`)
3. `FileChunk` (Index: `hash`, `fileId`, `workerIds`)
4. `WorkerNode` (Index: `status`, `lastHeartbeat`)
5. `UploadSession` (Index: `uploadId`, `fileId`)
6. `ShareToken` (Index: `shareToken`, `fileId`)
7. `Folder` (Index: `userId`, `parentId`)
8. `RefreshToken` (Index: `token`, `expiresAt` TTL)

---

## 2. Logic Chain

1. **Entity Structure & Mongoose Schema Mapping**:
   - To prevent floating files and follow modular layout guidelines (`PROJECT.md`), schemas must be placed under `src/models/` as individual ES modules (`User.js`, `FileRecord.js`, `FileChunk.js`, `WorkerNode.js`, `UploadSession.js`, `ShareToken.js`, `Folder.js`, `RefreshToken.js`), with `src/models/index.js` exporting all models.
   - String primary keys (`_id: { type: String, required: true }`) must be used for explicit ID compatibility with DFUS domain objects (UUIDs, hashes, custom worker/user IDs).

2. **Index Optimization**:
   - `FileChunk.hash`: B-tree index `{ hash: 1 }` for O(1) deduplication and chunk retrieval.
   - `User.email`: Unique B-tree index `{ email: 1 }` (lowercased) for instant user lookup during auth.
   - `FileChunk.fileId`, `UploadSession.fileId`, `ShareToken.fileId`: B-tree index `{ fileId: 1 }` for efficient relational joins.
   - `UploadSession.uploadId`: Unique index `{ uploadId: 1 }` for tracking resumable 5GB uploads.
   - `ShareToken.shareToken`: Unique index `{ shareToken: 1 }` for zero-latency token resolution.
   - `RefreshToken.expiresAt`: TTL index `{ expireAfterSeconds: 0 }` so MongoDB Atlas automatically purges expired tokens in background.

3. **Repository Parity (`MongoMetadataRepo.js`)**:
   - `MongoMetadataRepo` must extend `IMetadataRepository` and implement all 31 methods plus the extended methods (`createUploadSession`, `updateUploadSessionProgress`, `createFolder`, etc.).
   - Call `.lean()` on all Mongoose query promises to return plain JS objects, matching the exact return shape of `SqliteMetadataRepo`.
   - Map `_id` to `id` (or standardize `id` getter) on output objects so callers can seamlessly interchange SQLite and MongoDB implementations.

4. **Connection Lifecycle**:
   - `MongoMetadataRepo` constructor or `connect(uri)` connects using `mongoose.connect(config.MONGO.URI)`.
   - `close()` cleanly calls `mongoose.disconnect()`.

---

## 3. Caveats

- **InMemory MongoDB for Tests**: In CI/test environments (`NODE_ENV === 'test'`), Mongoose must connect to `mongodb-memory-server` URI instead of attempting to connect to external MongoDB Atlas cluster.
- **Atomic Progress Updates**: `updateUploadSessionProgress` uses Mongoose `$addToSet` for chunk index array to prevent duplicate index registrations under concurrent direct-to-worker chunk uploads.

---

## 4. Conclusion & Recommended Code Implementations

The following 11 concrete code implementations are defined for the Worker implementation agent:

### 4.1 Schema 1: `src/models/User.js`
```javascript
const mongoose = require('mongoose');
const config = require('../config/env');

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // custom userId or UUID
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
  passwordHash: { type: String, default: null },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  storageUsed: { type: Number, default: 0, min: 0 },
  storageQuota: { type: Number, default: config.STORAGE.DEFAULT_QUOTA },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, default: null },
  apiKey: { type: String, default: null, sparse: true, index: true },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.virtual('id').get(function() { return this._id; });

module.exports = mongoose.model('User', userSchema);
```

### 4.2 Schema 2: `src/models/FileRecord.js`
```javascript
const mongoose = require('mongoose');

const fileRecordSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // fileId UUID
  userId: { type: String, required: true, index: true },
  folderId: { type: String, default: null, index: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  totalSize: { type: Number, required: true },
  chunkSize: { type: Number, required: true },
  totalChunks: { type: Number, required: true },
  checksum: { type: String, default: null },
  shareToken: { type: String, default: null, unique: true, sparse: true, index: true },
  isPublic: { type: Boolean, default: false },
  status: { type: String, enum: ['uploading', 'active', 'failed', 'deleted'], default: 'uploading' },
  version: { type: Number, default: 1 },
  isTrash: { type: Boolean, default: false },
  tags: [{ type: String }],
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

fileRecordSchema.virtual('id').get(function() { return this._id; });
fileRecordSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('FileRecord', fileRecordSchema);
```

### 4.3 Schema 3: `src/models/FileChunk.js`
```javascript
const mongoose = require('mongoose');

const fileChunkSchema = new mongoose.Schema({
  hash: { type: String, required: true, index: true },
  fileId: { type: String, required: true, index: true },
  chunkIndex: { type: Number, required: true },
  size: { type: Number, required: true },
  workerIds: [{ type: String }],
  status: { type: String, enum: ['stored', 'uploading', 'replicating', 'corrupted', 'orphaned'], default: 'stored' },
  createdAt: { type: Date, default: Date.now }
});

fileChunkSchema.index({ fileId: 1, chunkIndex: 1 }, { unique: true });
fileChunkSchema.index({ workerIds: 1 });

module.exports = mongoose.model('FileChunk', fileChunkSchema);
```

### 4.4 Schema 4: `src/models/WorkerNode.js`
```javascript
const mongoose = require('mongoose');

const workerNodeSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // worker ID (e.g. worker-1)
  host: { type: String, required: true },
  port: { type: Number, required: true },
  status: { type: String, enum: ['alive', 'suspect', 'dead'], default: 'alive', index: true },
  lastHeartbeat: { type: Date, default: Date.now },
  missedBeats: { type: Number, default: 0 },
  chunksStored: { type: Number, default: 0 },
  diskUsage: { type: Number, default: 0 },
  registeredAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

workerNodeSchema.virtual('id').get(function() { return this._id; });

module.exports = mongoose.model('WorkerNode', workerNodeSchema);
```

### 4.5 Schema 5: `src/models/UploadSession.js`
```javascript
const mongoose = require('mongoose');

const uploadSessionSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // uploadId
  uploadId: { type: String, required: true, unique: true, index: true },
  fileId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  fileSizeBytes: { type: Number, required: true },
  totalChunks: { type: Number, required: true },
  uploadedChunks: [{ type: Number }],
  receivedChunkHashes: { type: Map, of: String, default: {} },
  status: { type: String, enum: ['pending', 'uploading', 'completed', 'cancelled', 'expired'], default: 'pending' },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('UploadSession', uploadSessionSchema);
```

### 4.6 Schema 6: `src/models/ShareToken.js`
```javascript
const mongoose = require('mongoose');

const shareTokenSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // shareToken
  shareToken: { type: String, required: true, unique: true, index: true },
  fileId: { type: String, required: true, index: true },
  createdBy: { type: String, required: true },
  permission: { type: String, enum: ['read', 'write'], default: 'read' },
  maxDownloads: { type: Number, default: null },
  downloadCount: { type: Number, default: 0 },
  passwordHash: { type: String, default: null },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ShareToken', shareTokenSchema);
```

### 4.7 Schema 7: `src/models/Folder.js`
```javascript
const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // folderId UUID
  userId: { type: String, required: true, index: true },
  parentId: { type: String, default: null, index: true },
  name: { type: String, required: true },
  path: { type: String, default: '/' },
  isTrash: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

folderSchema.virtual('id').get(function() { return this._id; });
folderSchema.index({ userId: 1, parentId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Folder', folderSchema);
```

### 4.8 Schema 8: `src/models/RefreshToken.js`
```javascript
const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // tokenHash
  token: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Automatic TTL cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
```

### 4.9 Schema Barrel: `src/models/index.js`
```javascript
const User = require('./User');
const FileRecord = require('./FileRecord');
const FileChunk = require('./FileChunk');
const WorkerNode = require('./WorkerNode');
const UploadSession = require('./UploadSession');
const ShareToken = require('./ShareToken');
const Folder = require('./Folder');
const RefreshToken = require('./RefreshToken');

module.exports = {
  User,
  FileRecord,
  FileChunk,
  WorkerNode,
  UploadSession,
  ShareToken,
  Folder,
  RefreshToken
};
```

### 4.10 Repository Implementation: `src/repositories/MongoMetadataRepo.js`
```javascript
const mongoose = require('mongoose');
const IMetadataRepository = require('./IMetadataRepository');
const config = require('../config/env');
const {
  User,
  FileRecord,
  FileChunk,
  WorkerNode,
  UploadSession,
  ShareToken,
  Folder,
  RefreshToken
} = require('../models');

class MongoMetadataRepo extends IMetadataRepository {
  constructor() {
    super();
    this.connected = false;
  }

  async connect(uri = config.MONGO.URI) {
    if (mongoose.connection.readyState === 0) {
      if (!uri) {
        throw new Error('MONGODB_URI environment variable is required for MongoMetadataRepo');
      }
      await mongoose.connect(uri);
    }
    this.connected = true;
  }

  _formatDoc(doc) {
    if (!doc) return null;
    if (Array.isArray(doc)) return doc.map(d => this._formatDoc(d));
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    if (obj._id && !obj.id) obj.id = obj._id;
    return obj;
  }

  // --- Users ---
  async createUser(userData) {
    const id = userData.id || userData._id;
    const doc = await User.create({ _id: id, ...userData });
    return this._formatDoc(doc);
  }

  async findUserById(userId) {
    const doc = await User.findById(userId).lean();
    return this._formatDoc(doc);
  }

  async findUserByEmail(email) {
    if (!email) return null;
    const doc = await User.findOne({ email: email.toLowerCase() }).lean();
    return this._formatDoc(doc);
  }

  async findUserByUsername(username) {
    if (!username) return null;
    const doc = await User.findOne({ username }).lean();
    return this._formatDoc(doc);
  }

  async updateUser(userId, updateData) {
    const doc = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();
    return this._formatDoc(doc);
  }

  async deleteUser(userId) {
    await User.findByIdAndDelete(userId);
  }

  async getAllUsers(options = {}) {
    const query = User.find();
    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    const docs = await query.lean();
    return this._formatDoc(docs);
  }

  // --- Files ---
  async createFile(fileData) {
    const id = fileData.id || fileData._id;
    const doc = await FileRecord.create({ _id: id, ...fileData });
    return this._formatDoc(doc);
  }

  async findFileById(fileId) {
    const doc = await FileRecord.findById(fileId).lean();
    return this._formatDoc(doc);
  }

  async findFilesByUserId(userId, options = {}) {
    const docs = await FileRecord.find({ userId }).sort({ createdAt: -1 }).lean();
    return this._formatDoc(docs);
  }

  async findFileByShareToken(shareToken) {
    const doc = await FileRecord.findOne({ shareToken }).lean();
    return this._formatDoc(doc);
  }

  async updateFileStatus(fileId, status, checksum = null) {
    const update = { status };
    if (checksum) update.checksum = checksum;
    const doc = await FileRecord.findByIdAndUpdate(fileId, { $set: update }, { new: true }).lean();
    return this._formatDoc(doc);
  }

  async updateFileShareToken(fileId, shareData) {
    const doc = await FileRecord.findByIdAndUpdate(
      fileId,
      { $set: { shareToken: shareData.shareToken, isPublic: shareData.isPublic } },
      { new: true }
    ).lean();
    return this._formatDoc(doc);
  }

  async deleteFile(fileId) {
    await FileRecord.findByIdAndDelete(fileId);
    await FileChunk.deleteMany({ fileId });
  }

  async getAllFiles(options = {}) {
    const docs = await FileRecord.find().sort({ createdAt: -1 }).lean();
    return this._formatDoc(docs);
  }

  async getFileCount() {
    return await FileRecord.countDocuments({ status: { $ne: 'deleted' } });
  }

  async getTotalStorageUsed() {
    const result = await FileRecord.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, total: { $sum: '$totalSize' } } }
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  // --- Chunks ---
  async createChunk(chunkData) {
    const doc = await FileChunk.findOneAndUpdate(
      { fileId: chunkData.fileId, chunkIndex: chunkData.chunkIndex },
      { $set: chunkData },
      { upsert: true, new: true }
    ).lean();
    return this._formatDoc(doc);
  }

  async linkChunkToFile(fileId, chunkHash, chunkIndex) {
    await FileChunk.updateOne(
      { fileId, chunkIndex },
      { $set: { hash: chunkHash, fileId, chunkIndex } },
      { upsert: true }
    );
  }

  async findChunksByFileId(fileId) {
    const docs = await FileChunk.find({ fileId }).sort({ chunkIndex: 1 }).lean();
    return docs;
  }

  async findChunkByHash(chunkHash) {
    const doc = await FileChunk.findOne({ hash: chunkHash }).lean();
    return doc;
  }

  async updateChunkWorkers(chunkId, workerIds) {
    await FileChunk.updateMany({ hash: chunkId }, { $set: { workerIds } });
  }

  async updateChunkStatus(chunkId, status) {
    await FileChunk.updateMany({ hash: chunkId }, { $set: { status } });
  }

  async deleteChunksByFileId(fileId) {
    await FileChunk.deleteMany({ fileId });
  }

  async getChunksByWorkerId(workerId) {
    const docs = await FileChunk.find({ workerIds: workerId }).lean();
    return docs;
  }

  async getOrphanedChunks() {
    const activeFileIds = await FileRecord.find({ status: 'active' }).distinct('_id');
    const docs = await FileChunk.find({ fileId: { $nin: activeFileIds } }).lean();
    return docs;
  }

  // --- Workers ---
  async registerWorker(workerData) {
    const doc = await WorkerNode.findByIdAndUpdate(
      workerData.id,
      {
        $set: {
          host: workerData.host,
          port: workerData.port,
          status: workerData.status || 'alive',
          lastHeartbeat: new Date(),
          missedBeats: 0
        }
      },
      { upsert: true, new: true }
    ).lean();
    return this._formatDoc(doc);
  }

  async findWorkerById(workerId) {
    const doc = await WorkerNode.findById(workerId).lean();
    return this._formatDoc(doc);
  }

  async updateWorkerHeartbeat(workerId, stats = {}) {
    const doc = await WorkerNode.findByIdAndUpdate(
      workerId,
      {
        $set: {
          lastHeartbeat: new Date(),
          missedBeats: 0,
          status: 'alive',
          chunksStored: stats.chunksStored || 0,
          diskUsage: stats.diskUsage || 0
        }
      },
      { new: true }
    ).lean();
    return this._formatDoc(doc);
  }

  async updateWorkerStatus(workerId, status) {
    const doc = await WorkerNode.findByIdAndUpdate(
      workerId,
      { $set: { status } },
      { new: true }
    ).lean();
    return this._formatDoc(doc);
  }

  async getAllWorkers() {
    const docs = await WorkerNode.find().lean();
    return this._formatDoc(docs);
  }

  async getAliveWorkers() {
    const docs = await WorkerNode.find({ status: 'alive' }).lean();
    return this._formatDoc(docs);
  }

  async getDeadWorkers() {
    const docs = await WorkerNode.find({ status: 'dead' }).lean();
    return this._formatDoc(docs);
  }

  async removeWorker(workerId) {
    await WorkerNode.findByIdAndDelete(workerId);
  }

  // --- Refresh Tokens ---
  async createRefreshToken(tokenData) {
    const tokenHash = tokenData.tokenHash || tokenData.token;
    const doc = await RefreshToken.create({ _id: tokenHash, ...tokenData });
    return this._formatDoc(doc);
  }

  async findRefreshToken(token) {
    const doc = await RefreshToken.findOne({ $or: [{ _id: token }, { token }] }).lean();
    return this._formatDoc(doc);
  }

  async deleteRefreshToken(token) {
    await RefreshToken.deleteMany({ $or: [{ _id: token }, { token }] });
  }

  async deleteAllUserRefreshTokens(userId) {
    await RefreshToken.deleteMany({ userId });
  }

  async deleteExpiredTokens() {
    await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });
  }

  // --- Upload Sessions (Resumable 5GB Upload Tracking) ---
  async createUploadSession(sessionData) {
    const uploadId = sessionData.uploadId || sessionData.id;
    const doc = await UploadSession.create({ _id: uploadId, uploadId, ...sessionData });
    return this._formatDoc(doc);
  }

  async findUploadSessionById(uploadId) {
    const doc = await UploadSession.findById(uploadId).lean();
    return this._formatDoc(doc);
  }

  async updateUploadSessionProgress(uploadId, chunkIndex, chunkHash) {
    const update = {
      $addToSet: { uploadedChunks: chunkIndex },
      $set: { updatedAt: new Date() }
    };
    if (chunkHash) {
      update.$set[`receivedChunkHashes.${chunkIndex}`] = chunkHash;
    }
    const doc = await UploadSession.findByIdAndUpdate(uploadId, update, { new: true }).lean();
    return this._formatDoc(doc);
  }

  async completeUploadSession(uploadId) {
    const doc = await UploadSession.findByIdAndUpdate(
      uploadId,
      { $set: { status: 'completed', updatedAt: new Date() } },
      { new: true }
    ).lean();
    return this._formatDoc(doc);
  }

  async deleteUploadSession(uploadId) {
    await UploadSession.findByIdAndDelete(uploadId);
  }

  // --- Folders ---
  async createFolder(folderData) {
    const id = folderData.id || folderData._id;
    const doc = await Folder.create({ _id: id, ...folderData });
    return this._formatDoc(doc);
  }

  async findFolderById(folderId) {
    const doc = await Folder.findById(folderId).lean();
    return this._formatDoc(doc);
  }

  async findFoldersByUserId(userId, parentId = null) {
    const docs = await Folder.find({ userId, parentId }).sort({ name: 1 }).lean();
    return this._formatDoc(docs);
  }

  async deleteFolder(folderId) {
    await Folder.findByIdAndDelete(folderId);
  }

  // --- Share Tokens ---
  async createShareToken(shareData) {
    const doc = await ShareToken.create({ _id: shareData.shareToken, ...shareData });
    return this._formatDoc(doc);
  }

  async findShareToken(shareToken) {
    const doc = await ShareToken.findOne({ shareToken }).lean();
    return this._formatDoc(doc);
  }

  async deleteShareToken(shareToken) {
    await ShareToken.deleteOne({ shareToken });
  }

  // --- Lifecycle ---
  async close() {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    this.connected = false;
  }
}

module.exports = MongoMetadataRepo;
```

### 4.11 Updating Factory: `src/repositories/database.js`
```javascript
const config = require('../config/env');
const SqliteMetadataRepo = require('./SqliteMetadataRepo');
const MongoMetadataRepo = require('./MongoMetadataRepo');

let dbInstance = null;

function getDatabase() {
  if (!dbInstance) {
    if (config.MODE === 'presentation') {
      dbInstance = new SqliteMetadataRepo();
    } else {
      dbInstance = new MongoMetadataRepo();
    }
  }
  return dbInstance;
}

module.exports = {
  getDatabase
};
```

---

## 5. Verification Method

To independently verify the implementation, execute the following steps:

1. **Static Analysis & Schema Validation**:
   - Check that all 8 Mongoose models (`User`, `FileRecord`, `FileChunk`, `WorkerNode`, `UploadSession`, `ShareToken`, `Folder`, `RefreshToken`) are present in `src/models/`.
   - Confirm explicit indexes are present for `hash`, `email`, `fileId`, `uploadId`, and `shareToken`.

2. **Unit & Integration Test Execution**:
   - Run existing unit tests:
     ```bash
     npm test
     ```
   - Create and run a dedicated Mongo repository test `tests/mongoMetadataRepo.test.js` using `mongodb-memory-server`:
     ```bash
     npx jest tests/mongoMetadataRepo.test.js --forceExit
     ```

3. **E2E Suite Verification**:
   - Run the E2E verification suite to confirm 0 failures:
     ```bash
     npm run test:e2e
     ```
