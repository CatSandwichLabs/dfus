'use strict';

const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { createTestContext, teardownTestContext, clearDatabase } = require('./testHelper');

let ctx;

beforeAll(async () => {
  ctx = await createTestContext('chunk');
}, 120000);

afterAll(async () => {
  await teardownTestContext(ctx);
}, 30000);

afterEach(async () => {
  await clearDatabase();
  // Remove any leftover chunk files in tmp dir
  for (const f of fs.readdirSync(ctx.testTmpDir)) {
    try { fs.unlinkSync(path.join(ctx.testTmpDir, f)); } catch { /* ignore */ }
  }
});

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function makeChunkBuffer(size = 1024) {
  return crypto.randomBytes(size);
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function createSession(overrides = {}) {
  const fileHash = 'a'.repeat(64);
  const params = {
    fileHash,
    fileName: 'test.bin',
    totalChunks: '5',
    fileSizeBytes: String(5 * 1024),
    ...overrides,
  };
  const res = await request(ctx.server).get('/api/upload/status').query(params);
  return { sessionId: res.body.sessionId, fileHash };
}

/* --------------------------------------------------------------------------
   POST /api/upload/chunk
   -------------------------------------------------------------------------- */
describe('POST /api/upload/chunk', () => {
  test('accepts a valid chunk and returns success', async () => {
    const { sessionId } = await createSession({ totalChunks: '1', fileSizeBytes: '1024' });
    const chunkData = makeChunkBuffer(1024);
    const chunkHash = sha256Hex(chunkData);

    const res = await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '0')
      .set('x-chunk-hash', chunkHash)
      .send(chunkData)
      .expect(200);

    expect(res.body).toMatchObject({ chunkIndex: 0, status: 'success' });
    expect(res.body.bytesReceived).toBe(1024);
  });

  test('creates a physical file in the tmp directory', async () => {
    const { sessionId } = await createSession({ totalChunks: '1', fileSizeBytes: '2048' });
    const chunkData = makeChunkBuffer(2048);
    const chunkHash = sha256Hex(chunkData);

    await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '0')
      .set('x-chunk-hash', chunkHash)
      .send(chunkData)
      .expect(200);

    const files = fs.readdirSync(ctx.testTmpDir);
    expect(files.length).toBe(1);
    const savedSize = fs.statSync(path.join(ctx.testTmpDir, files[0])).size;
    expect(savedSize).toBe(2048);
  });

  test('records the chunk as success in the database', async () => {
    const { sessionId } = await createSession({ totalChunks: '2', fileSizeBytes: '2048' });
    const chunkData = makeChunkBuffer(1024);
    const chunkHash = sha256Hex(chunkData);

    await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '0')
      .set('x-chunk-hash', chunkHash)
      .send(chunkData)
      .expect(200);

    const FileChunk = require('../server/src/models/FileChunk');
    const record = await FileChunk.findOne({ uploadSessionId: sessionId, chunkIndex: 0 });
    expect(record).not.toBeNull();
    expect(record.status).toBe('success');
    expect(record.chunkHash).toBe(chunkHash);
    expect(fs.existsSync(record.storagePath)).toBe(true);
  });

  test('rejects a chunk with a mismatched SHA-256 hash', async () => {
    const { sessionId } = await createSession({ totalChunks: '1', fileSizeBytes: '1024' });
    const chunkData = makeChunkBuffer(1024);
    const wrongHash = 'b'.repeat(64);

    const res = await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '0')
      .set('x-chunk-hash', wrongHash)
      .send(chunkData)
      .expect(400);

    expect(res.body.error.message).toMatch(/hash mismatch|integrity/i);
    // No file should remain in tmp on hash failure
    expect(fs.readdirSync(ctx.testTmpDir).length).toBe(0);
  });

  test('rejects a Windows PE executable (MZ magic header) on chunk 0', async () => {
    const { sessionId } = await createSession({ totalChunks: '1', fileSizeBytes: '1024' });
    const chunkData = Buffer.concat([
      Buffer.from([0x4d, 0x5a]), // MZ
      crypto.randomBytes(1022),
    ]);
    const chunkHash = sha256Hex(chunkData);

    const res = await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '0')
      .set('x-chunk-hash', chunkHash)
      .send(chunkData)
      .expect(415);

    expect(res.body.error.message).toMatch(/not permitted|executable/i);
  });

  test('rejects an ELF binary magic header on chunk 0', async () => {
    const { sessionId } = await createSession({ totalChunks: '1', fileSizeBytes: '1024' });
    const chunkData = Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF
      crypto.randomBytes(1020),
    ]);
    const chunkHash = sha256Hex(chunkData);

    const res = await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '0')
      .set('x-chunk-hash', chunkHash)
      .send(chunkData)
      .expect(415);

    expect(res.body.error.message).toMatch(/ELF|not permitted/i);
  });

  test('skips magic check on non-zero chunk index', async () => {
    const { sessionId } = await createSession({ totalChunks: '3', fileSizeBytes: '3072' });
    const chunkData = Buffer.concat([
      Buffer.from([0x4d, 0x5a]), // MZ header - only blocked on chunk 0
      crypto.randomBytes(1022),
    ]);
    const chunkHash = sha256Hex(chunkData);

    await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '1')
      .set('x-chunk-hash', chunkHash)
      .send(chunkData)
      .expect(200);
  });

  test('rejects upload with missing required headers', async () => {
    const chunkData = makeChunkBuffer(512);
    const res = await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .send(chunkData)
      .expect(400);
    expect(res.body.error.message).toMatch(/missing/i);
  });

  test('rejects invalid sessionId format', async () => {
    const chunkData = makeChunkBuffer(512);
    const res = await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', 'not-valid-object-id')
      .set('x-chunk-index', '0')
      .set('x-chunk-hash', 'a'.repeat(64))
      .send(chunkData)
      .expect(400);
    expect(res.body.error.message).toMatch(/session/i);
  });

  test('rejects chunk index exceeding totalChunks', async () => {
    const { sessionId } = await createSession({ totalChunks: '2', fileSizeBytes: '2048' });
    const chunkData = makeChunkBuffer(1024);
    const chunkHash = sha256Hex(chunkData);

    const res = await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', '99')
      .set('x-chunk-hash', chunkHash)
      .send(chunkData)
      .expect(400);

    expect(res.body.error.message).toMatch(/exceeds/i);
  });

  test('is idempotent: re-uploading the same chunk returns success and keeps one DB record', async () => {
    const { sessionId } = await createSession({ totalChunks: '2', fileSizeBytes: '2048' });
    const chunkData = makeChunkBuffer(1024);
    const chunkHash = sha256Hex(chunkData);

    const headers = {
      'Content-Type': 'application/octet-stream',
      'x-upload-session-id': sessionId,
      'x-chunk-index': '0',
      'x-chunk-hash': chunkHash,
    };

    await request(ctx.server).post('/api/upload/chunk').set(headers).send(chunkData).expect(200);
    await request(ctx.server).post('/api/upload/chunk').set(headers).send(chunkData).expect(200);

    const FileChunk = require('../server/src/models/FileChunk');
    const count = await FileChunk.countDocuments({ uploadSessionId: sessionId, chunkIndex: 0 });
    expect(count).toBe(1);
  });
});
