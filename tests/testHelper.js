'use strict';

/**
 * Shared test bootstrapper.
 *
 * Design: Each test file gets its own MongoMemoryServer and its own Express
 * app instance, but they share the Mongoose singleton connection. To avoid
 * teardown races between test files, each context connects Mongoose to its own
 * in-memory server at the start of beforeAll, and disconnects in afterAll.
 *
 * The Mongoose singleton is reconnected per-test-file by calling connect() with
 * the new URI — Mongoose 8 handles this gracefully.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function createTestContext(tmpSuffix = 'shared') {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();

  const testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `dfus-${tmpSuffix}-tmp-`));
  const testUploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), `dfus-${tmpSuffix}-upl-`));

  // Must be set before any require of env.js so lazy getters resolve correctly
  process.env.MONGODB_URI = mongoUri;
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0';
  process.env.TMP_DIR = testTmpDir;
  process.env.UPLOADS_DIR = testUploadsDir;

  const { mongoose, connectDB } = require('../server/src/config/db');

  // If already connected to a different URI, disconnect first
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await connectDB(mongoUri);

  // Re-initialise pathUtils with the per-test tmp dirs
  const pathUtils = require('../server/src/utils/pathUtils');
  pathUtils.init({ tmpDir: testTmpDir, uploadsDir: testUploadsDir });

  const { createApp } = require('../server/server');
  const app = createApp();

  // Start an HTTP server on a random OS-assigned port
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  return { mongod, mongoUri, testTmpDir, testUploadsDir, app, server, mongoose };
}

async function teardownTestContext(ctx) {
  if (!ctx) return;

  // Close the HTTP server first so no new requests arrive
  if (ctx.server) {
    await new Promise((resolve) => ctx.server.close(resolve));
  }

  // Disconnect Mongoose
  try {
    if (ctx.mongoose.connection.readyState !== 0) {
      await ctx.mongoose.disconnect();
    }
  } catch { /* ignore */ }

  // Stop in-memory MongoDB
  try { await ctx.mongod.stop({ doCleanup: true }); } catch { /* ignore */ }

  // Remove temp directories
  fs.rmSync(ctx.testTmpDir, { recursive: true, force: true });
  fs.rmSync(ctx.testUploadsDir, { recursive: true, force: true });
}

/**
 * Clear all documents from all collections between tests.
 * Compatible with Mongoose 8 / MongoDB Node driver 6.
 */
async function clearDatabase() {
  const { mongoose } = require('../server/src/config/db');
  if (mongoose.connection.readyState !== 1) return;
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections.map((col) => db.collection(col.name).deleteMany({}))
  );
}

module.exports = { createTestContext, teardownTestContext, clearDatabase };
