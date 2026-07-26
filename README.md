# DFUS - Distributed Resumable File Upload System

A production-ready, full-stack chunked file upload system with parallel concurrency,
per-chunk SHA-256 integrity verification, magic number blocking, and a dark-mode
technical dashboard with an Interactive Packet Matrix.

---

## Architecture Overview

```
Client (Browser)                 Server (Node.js / Express)         Storage
-----------------------------------------------------------------------
File Selection                   GET /api/upload/status
   |                                |-- findOrCreate session
SHA-256 (IncrementalSHA256)         |-- return uploadedChunks[]
   |                                |
Concurrency Pool (3 parallel)    POST /api/upload/chunk
   |-- Chunk 0 (SHA-256 hash)       |-- ChunkHashTransform (stream)
   |-- Chunk 1 (SHA-256 hash)   --> |-- validate hash header
   |-- Chunk 2 (SHA-256 hash)       |-- magic number check (chunk 0)
   |                                |-- write to tmp/<uuid>         --> /tmp/
   |-- Resume: skip SUCCESS chunks  |-- upsert FileChunk record
   |-- Retry: 3x exponential        |
   |                             POST /api/upload/merge
Packet Matrix UI                    |-- verify all chunks present
   PENDING  (dark)                  |-- stream-concat chunks        --> /uploads/
   UPLOADING (blue pulse)           |-- SHA-256 verify merged file
   SUCCESS  (green)                 |-- delete tmp chunk files
   FAILED   (red throb)             |-- mark session complete
```

### Database Collections

**upload_sessions**

| Field          | Type    | Description                                              |
|----------------|---------|----------------------------------------------------------|
| fileHash       | String  | SHA-256 of the entire file (unique, from client)        |
| fileName       | String  | Original filename (sanitized before touching disk)       |
| totalChunks    | Number  | Total number of 5 MB chunks                             |
| fileSizeBytes  | Number  | Total file size                                         |
| status         | Enum    | pending / uploading / merging / complete / failed       |
| finalPath      | String  | Absolute path of merged file (populated on complete)    |

**file_chunks**

| Field           | Type     | Description                                          |
|-----------------|----------|------------------------------------------------------|
| uploadSessionId | ObjectId | Reference to upload_sessions                        |
| chunkIndex      | Number   | Zero-based position in the file                     |
| chunkHash       | String   | SHA-256 of the chunk binary data                    |
| status          | Enum     | pending / uploading / success / failed              |
| storagePath     | String   | Absolute path of the temp chunk file                |
| retryCount      | Number   | Number of times this chunk was retried              |

---

## Prerequisites

- **Node.js** >= 18.0.0
- **MongoDB** >= 6.0 (local instance or Atlas)

Install Node.js from [https://nodejs.org](https://nodejs.org).
Install MongoDB Community from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community).

---

## Setup Instructions

### 1. Clone and install dependencies

```bash
cd DFUS
npm install
```

### 2. Configure environment

```bash
copy .env.example .env
```

Edit `.env`:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/dfus
NODE_ENV=development
MAX_CHUNK_SIZE_BYTES=6291456
UPLOADS_DIR=uploads
TMP_DIR=tmp
```

### 3. Start MongoDB

```bash
# Windows (if installed as a service, it may already be running)
net start MongoDB

# Or run directly:
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath C:\data\db
```

### 4. Run the development server

```bash
npm run dev
```

Open your browser at [http://localhost:3000](http://localhost:3000).

### 5. Production start

```bash
npm start
```

---

## API Reference

### GET /api/upload/status

Initialize or resume an upload session.

**Query Parameters:**

| Param         | Type   | Required | Description                                   |
|---------------|--------|----------|-----------------------------------------------|
| fileHash      | string | Yes      | SHA-256 hex of the full file (64 chars)       |
| fileName      | string | Yes      | Original filename                             |
| totalChunks   | number | Yes      | Number of 5 MB chunks                        |
| fileSizeBytes | number | Yes      | File size in bytes                            |

**Response:**

```json
{
  "sessionId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "status": "pending",
  "uploadedChunks": [0, 2, 5]
}
```

---

### POST /api/upload/chunk

Upload a single raw binary chunk.

**Headers:**

| Header                  | Description                              |
|-------------------------|------------------------------------------|
| Content-Type            | application/octet-stream                |
| x-upload-session-id     | Session ID from /api/upload/status       |
| x-chunk-index           | Zero-based chunk index                  |
| x-chunk-hash            | SHA-256 hex of the chunk binary data    |

**Body:** Raw binary data (max 6 MB)

**Response:**

```json
{
  "chunkIndex": 4,
  "status": "success",
  "bytesReceived": 5242880
}
```

---

### POST /api/upload/merge

Assemble all chunks into the final file and verify integrity.

**Body (JSON):**

```json
{ "sessionId": "64f1a2b3c4d5e6f7a8b9c0d1" }
```

**Response:**

```json
{
  "message": "File merged and SHA-256 verified successfully",
  "finalPath": "/absolute/path/to/uploads/uuid_filename.ext",
  "fileHash": "abc123...def456"
}
```

---

## Running Tests

```bash
npm test
```

Tests use `mongodb-memory-server` (downloads a MongoDB binary on first run) so
no separate MongoDB instance is needed.

```bash
npm run test:coverage
```

### Test Coverage Areas

| Test File         | What it verifies                                                   |
|-------------------|--------------------------------------------------------------------|
| session.test.js   | Session create, idempotent re-init, partial upload tracking, validation |
| chunk.test.js     | Valid upload, hash mismatch, EXE/ELF magic blocking, missing headers, range check |
| merge.test.js     | Full merge, content equality, SHA-256 verify, tmp cleanup, partial chunk rejection, hash tamper detection |

---

## Manual Network Failure / Resume Testing

This procedure simulates a real mid-upload server crash for evaluation purposes.

### Step-by-step

1. Start the server with `npm run dev`
2. Open [http://localhost:3000](http://localhost:3000) in a browser
3. Select a large file (100 MB or more for clear visual results)
4. Observe the SHA-256 computation progress in the File Info panel
5. Click **Start Upload** and watch the Packet Matrix fill with blue uploading blocks
6. **At any point during upload:** press `Ctrl+C` in the terminal to kill the server
7. Observe that some chunks turned green (SUCCESS) before the kill
8. Restart the server: `npm run dev`
9. In the browser, click **Resume Upload**
   - The client calls `GET /api/upload/status` which queries MongoDB for chunks with `status: success`
   - Chunks already green are skipped
   - Only pending/failed chunks are re-uploaded
10. Verify in the Activity Log that only the non-green chunks are re-uploaded
11. After all chunks succeed, the server merges the file and verifies SHA-256

### What to observe

- **Packet Matrix**: Previously green chunks remain green. Only gray/red chunks go blue.
- **Activity Log**: Shows "X of Y chunks already uploaded" on session rehydration.
- **MongoDB** (using Compass or mongosh): Query `db.file_chunks.find({ status: "success" })` before and after to confirm no re-upload of completed chunks.

---

## Security Controls

| Control                | Implementation                                                           |
|------------------------|--------------------------------------------------------------------------|
| Path traversal         | All disk paths use `crypto.randomUUID()` exclusively. No user data in paths. |
| Chunk integrity        | SHA-256 of each chunk computed server-side via stream and compared to header |
| File integrity         | SHA-256 of merged file computed via read stream and compared to client pre-hash |
| Executable blocking    | First 16 bytes of chunk 0 inspected; MZ (EXE/DLL) and ELF headers rejected (HTTP 415) |
| Body size limit        | Express raw body capped at 6 MB; additional guard in ChunkHashTransform |
| Input validation       | All route parameters validated: hash format (regex), ObjectId format (Mongoose), numeric ranges |

---

## Project Structure

```
DFUS/
|- server/
|  |- server.js                    Entry point (exports app, start, stop)
|  |- src/
|     |- config/
|     |  |- env.js                 Lazy env config (getter properties)
|     |  |- db.js                  Mongoose connect/disconnect
|     |- models/
|     |  |- UploadSession.js       upload_sessions collection
|     |  |- FileChunk.js           file_chunks collection
|     |- utils/
|     |  |- hashUtils.js           SHA-256 stream and buffer helpers
|     |  |- pathUtils.js           Safe path generation (UUID-based)
|     |- middleware/
|     |  |- errorHandler.js        Central error -> JSON response
|     |- services/
|     |  |- sessionService.js      findOrCreate session logic
|     |  |- chunkService.js        ChunkHashTransform, magic check, DB write
|     |  |- mergeService.js        Sequential stream merge, SHA-256 verify
|     |- routes/
|        |- upload.js              /api/upload/* route handlers
|- client/
|  |- index.html                   Semantic HTML5 dashboard
|  |- styles.css                   Dark-mode design system
|  |- app.js                       IncrementalSHA256, pool, matrix, retry
|- tests/
|  |- session.test.js
|  |- chunk.test.js
|  |- merge.test.js
|- .env.example
|- nodemon.json
|- jest.config.js
|- package.json
|- README.md
```

---

## Performance Notes

- **RAM**: All file reads and writes use Node.js streams. The server never holds a full
  chunk or merged file in memory simultaneously.
- **Concurrency**: The client uploads 3 chunks in parallel. Increasing `CONCURRENCY_LIMIT`
  in `client/app.js` will improve speed on high-bandwidth connections at the cost of
  increased server-side parallelism.
- **Chunk size**: The 5 MB default is a good balance between the number of HTTP requests
  and per-request overhead. For very large files (>10 GB), increasing chunk size reduces
  the total number of requests.
