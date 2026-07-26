'use strict';

const request = require('supertest');
const { createTestContext, teardownTestContext, clearDatabase } = require('./testHelper');

let ctx;

beforeAll(async () => {
  ctx = await createTestContext('session');
}, 120000);

afterAll(async () => {
  await teardownTestContext(ctx);
}, 30000);

afterEach(async () => {
  await clearDatabase();
});

/* --------------------------------------------------------------------------
   GET /api/upload/status
   -------------------------------------------------------------------------- */
describe('GET /api/upload/status', () => {
  const validFileHash = 'a'.repeat(64);
  const validParams = {
    fileHash: validFileHash,
    fileName: 'test-file.bin',
    totalChunks: '3',
    fileSizeBytes: '15728640',
  };

  test('creates a new session when fileHash does not exist', async () => {
    const res = await request(ctx.server)
      .get('/api/upload/status')
      .query(validParams)
      .expect(200);

    expect(res.body).toMatchObject({
      sessionId: expect.any(String),
      status: 'pending',
      uploadedChunks: [],
    });
    expect(res.body.sessionId).toHaveLength(24);
  });

  test('returns the same sessionId on duplicate fileHash', async () => {
    const first = await request(ctx.server).get('/api/upload/status').query(validParams).expect(200);
    const second = await request(ctx.server).get('/api/upload/status').query(validParams).expect(200);

    expect(first.body.sessionId).toBe(second.body.sessionId);
  });

  test('returns uploadedChunks with previously succeeded chunk indices', async () => {
    const sessionRes = await request(ctx.server)
      .get('/api/upload/status')
      .query(validParams)
      .expect(200);
    const { sessionId } = sessionRes.body;

    const FileChunk = require('../server/src/models/FileChunk');
    await FileChunk.create([
      {
        uploadSessionId: sessionId,
        chunkIndex: 0,
        chunkHash: 'b'.repeat(64),
        status: 'success',
        storagePath: '/tmp/fake0',
      },
      {
        uploadSessionId: sessionId,
        chunkIndex: 2,
        chunkHash: 'c'.repeat(64),
        status: 'success',
        storagePath: '/tmp/fake2',
      },
    ]);

    const statusRes = await request(ctx.server)
      .get('/api/upload/status')
      .query(validParams)
      .expect(200);

    expect(statusRes.body.uploadedChunks).toEqual(expect.arrayContaining([0, 2]));
    expect(statusRes.body.uploadedChunks).not.toContain(1);
  });

  test('rejects requests missing required query params', async () => {
    const res = await request(ctx.server).get('/api/upload/status').expect(400);
    expect(res.body.error.status).toBe(400);
  });

  test('rejects invalid fileHash format (not 64 hex chars)', async () => {
    const res = await request(ctx.server)
      .get('/api/upload/status')
      .query({ ...validParams, fileHash: 'not-a-valid-hash' })
      .expect(400);
    expect(res.body.error.message).toMatch(/fileHash/i);
  });

  test('rejects totalChunks of 0', async () => {
    const res = await request(ctx.server)
      .get('/api/upload/status')
      .query({ ...validParams, totalChunks: '0' })
      .expect(400);
    expect(res.body.error.status).toBe(400);
  });

  test('rejects negative fileSizeBytes', async () => {
    const res = await request(ctx.server)
      .get('/api/upload/status')
      .query({ ...validParams, fileSizeBytes: '-1' })
      .expect(400);
    expect(res.body.error.status).toBe(400);
  });
});
