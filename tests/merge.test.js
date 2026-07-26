'use strict';

const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { createTestContext, teardownTestContext, clearDatabase } = require('./testHelper');

let ctx;

beforeAll(async () => {
  ctx = await createTestContext('merge');
}, 120000);

afterAll(async () => {
  await teardownTestContext(ctx);
}, 30000);

afterEach(async () => {
  await clearDatabase();
  for (const f of fs.readdirSync(ctx.testTmpDir)) {
    try { fs.unlinkSync(path.join(ctx.testTmpDir, f)); } catch { /* ignore */ }
  }
  for (const f of fs.readdirSync(ctx.testUploadsDir)) {
    try { fs.unlinkSync(path.join(ctx.testUploadsDir, f)); } catch { /* ignore */ }
  }
});

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Upload all chunks for a test file and return the sessionId and buffers.
 */
async function uploadAllChunks(numChunks, chunkSize = 512) {
  const chunkBuffers = Array.from({ length: numChunks }, () => crypto.randomBytes(chunkSize));
  const fullBuffer = Buffer.concat(chunkBuffers);
  const fileHash = sha256Hex(fullBuffer);

  const sessionRes = await request(ctx.server)
    .get('/api/upload/status')
    .query({
      fileHash,
      fileName: 'test.bin',
      totalChunks: String(numChunks),
      fileSizeBytes: String(fullBuffer.length),
    })
    .expect(200);

  const { sessionId } = sessionRes.body;

  for (let i = 0; i < numChunks; i++) {
    await request(ctx.server)
      .post('/api/upload/chunk')
      .set('Content-Type', 'application/octet-stream')
      .set('x-upload-session-id', sessionId)
      .set('x-chunk-index', String(i))
      .set('x-chunk-hash', sha256Hex(chunkBuffers[i]))
      .send(chunkBuffers[i])
      .expect(200);
  }

  return { sessionId, fileHash, fullBuffer, chunkBuffers };
}

/* --------------------------------------------------------------------------
   POST /api/upload/merge
   -------------------------------------------------------------------------- */
describe('POST /api/upload/merge', () => {
  test('successfully merges 3 chunks and verifies SHA-256', async () => {
    const { sessionId, fileHash } = await uploadAllChunks(3, 1024);

    const res = await request(ctx.server)
      .post('/api/upload/merge')
      .send({ sessionId })
      .expect(200);

    expect(res.body).toMatchObject({
      message: expect.stringMatching(/verified/i),
      fileHash,
      finalPath: expect.any(String),
    });
  });

  test('final merged file on disk exactly matches original content', async () => {
    const { sessionId, fullBuffer } = await uploadAllChunks(4, 512);

    const res = await request(ctx.server)
      .post('/api/upload/merge')
      .send({ sessionId })
      .expect(200);

    const written = fs.readFileSync(res.body.finalPath);
    expect(Buffer.compare(written, fullBuffer)).toBe(0);
  });

  test('SHA-256 of merged file matches server-reported fileHash', async () => {
    const { sessionId, fileHash } = await uploadAllChunks(2, 2048);

    const res = await request(ctx.server)
      .post('/api/upload/merge')
      .send({ sessionId })
      .expect(200);

    const mergedHash = sha256Hex(fs.readFileSync(res.body.finalPath));
    expect(mergedHash).toBe(fileHash);
  });

  test('deletes all temporary chunk files after successful merge', async () => {
    const { sessionId } = await uploadAllChunks(3, 512);
    expect(fs.readdirSync(ctx.testTmpDir).length).toBe(3);

    await request(ctx.server).post('/api/upload/merge').send({ sessionId }).expect(200);

    expect(fs.readdirSync(ctx.testTmpDir).length).toBe(0);
  });

  test('marks session status as complete in database', async () => {
    const { sessionId } = await uploadAllChunks(2, 512);
    await request(ctx.server).post('/api/upload/merge').send({ sessionId }).expect(200);

    const UploadSession = require('../server/src/models/UploadSession');
    const session = await UploadSession.findById(sessionId).lean();
    expect(session.status).toBe('complete');
    expect(session.finalPath).toBeTruthy();
  });

  test('returns cached result and 200 on duplicate merge request', async () => {
    const { sessionId } = await uploadAllChunks(2, 512);
    const first = await request(ctx.server).post('/api/upload/merge').send({ sessionId }).expect(200);
    const second = await request(ctx.server).post('/api/upload/merge').send({ sessionId }).expect(200);

    expect(second.body.message).toMatch(/already merged/i);
    expect(second.body.finalPath).toBe(first.body.finalPath);
  });

  test('rejects merge when chunks are missing', async () => {
    const chunkBuffers = [
      crypto.randomBytes(512),
      crypto.randomBytes(512),
      crypto.randomBytes(512),
    ];
    const fullBuffer = Buffer.concat(chunkBuffers);
    const fileHash = sha256Hex(fullBuffer);

    const sessionRes = await request(ctx.server)
      .get('/api/upload/status')
      .query({
        fileHash,
        fileName: 'partial.bin',
        totalChunks: '3',
        fileSizeBytes: String(fullBuffer.length),
      })
      .expect(200);
    const { sessionId } = sessionRes.body;

    // Only upload chunks 0 and 2, skip chunk 1
    for (const i of [0, 2]) {
      await request(ctx.server)
        .post('/api/upload/chunk')
        .set('Content-Type', 'application/octet-stream')
        .set('x-upload-session-id', sessionId)
        .set('x-chunk-index', String(i))
        .set('x-chunk-hash', sha256Hex(chunkBuffers[i]))
        .send(chunkBuffers[i])
        .expect(200);
    }

    const res = await request(ctx.server).post('/api/upload/merge').send({ sessionId }).expect(400);
    expect(res.body.error.message).toMatch(/missing chunk/i);
  });

  test('detects SHA-256 mismatch and marks session as failed', async () => {
    const { sessionId } = await uploadAllChunks(2, 512);

    const UploadSession = require('../server/src/models/UploadSession');
    // Tamper with the stored file hash so verification fails
    await UploadSession.updateOne({ _id: sessionId }, { $set: { fileHash: 'f'.repeat(64) } });

    const res = await request(ctx.server).post('/api/upload/merge').send({ sessionId }).expect(422);
    expect(res.body.error.message).toMatch(/SHA-256 mismatch|integrity/i);

    const session = await UploadSession.findById(sessionId).lean();
    expect(session.status).toBe('failed');
  });

  test('rejects merge with missing sessionId body field', async () => {
    const res = await request(ctx.server).post('/api/upload/merge').send({}).expect(400);
    expect(res.body.error.message).toMatch(/sessionId/i);
  });

  test('returns 404 for non-existent sessionId', async () => {
    const res = await request(ctx.server)
      .post('/api/upload/merge')
      .send({ sessionId: '6'.repeat(24) })
      .expect(404);
    expect(res.body.error.status).toBe(404);
  });

  test('correctly streams and concatenates 4 large chunks (128KB each)', async () => {
    const { sessionId, fullBuffer } = await uploadAllChunks(4, 128 * 1024);

    const res = await request(ctx.app).post('/api/upload/merge').send({ sessionId }).expect(200);

    const mergedHash = sha256Hex(fs.readFileSync(res.body.finalPath));
    const expectedHash = sha256Hex(fullBuffer);
    expect(mergedHash).toBe(expectedHash);
  });
});
