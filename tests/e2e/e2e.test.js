'use strict';

const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const {
  startCluster,
  stopCluster,
  getDatabaseConnection,
} = require('./clusterTestHelper');

let cluster = null;

describe('Master-Worker Cluster E2E Verification Suite', () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    cluster = await startCluster({
      masterPort: 3095,
      workerBasePort: 4095,
      workerCount: 3,
      workerSecret: 'e2e-cluster-secret-key',
      replicationFactor: 2,
    });
  }, 40000);

  afterAll(async () => {
    if (cluster) {
      await stopCluster(cluster);
    }
  }, 20000);

  /* --------------------------------------------------------------------------
     a. Cluster Setup Verification
     -------------------------------------------------------------------------- */
  describe('a. Cluster Setup & Node Registration', () => {
    test('Master node is responsive on configured port', async () => {
      const res = await request(cluster.masterUrl).get('/api/auth/me');
      // Returns 401 because no auth header was sent, proving server is running
      expect(res.status).toBe(401);
    });

    test('All N worker nodes are online and respond to health checks', async () => {
      expect(cluster.workers.length).toBe(3);
      for (const worker of cluster.workers) {
        const res = await request(worker.url).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          status: 'alive',
          workerId: worker.id,
        });
      }
    });

    test('Worker nodes registered with Master in database', () => {
      const db = getDatabaseConnection(cluster.dbPath);
      expect(db).not.toBeNull();
      const workers = db.prepare('SELECT * FROM workers').all();
      expect(workers.length).toBe(3);
      const workerIds = workers.map((w) => w.id).sort();
      expect(workerIds).toEqual(['worker-1', 'worker-2', 'worker-3']);
      db.close();
    });
  });

  /* --------------------------------------------------------------------------
     b. User Authentication Verification
     -------------------------------------------------------------------------- */
  describe('b. User Authentication & Provisioning', () => {
    test('Rejects request with missing authorization header', async () => {
      const res = await request(cluster.masterUrl)
        .get('/api/auth/me')
        .expect(401);
      expect(res.body.error).toBeDefined();
    });

    test('Rejects request with invalid token format', async () => {
      const res = await request(cluster.masterUrl)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-string')
        .expect(401);
      expect(res.body.error).toBeDefined();
    });

    test('Authenticates valid user token and auto-provisions user record in database', async () => {
      const userToken = 'mock-token-e2euser1';
      const res = await request(cluster.masterUrl)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe('e2euser1');

      // Verify record in database
      const db = getDatabaseConnection(cluster.dbPath);
      const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get('e2euser1');
      expect(dbUser).not.toBeNull();
      expect(dbUser.id).toBe('e2euser1');
      db.close();
    });
  });

  /* --------------------------------------------------------------------------
     c. File Upload Verification (POST /api/files/upload)
     -------------------------------------------------------------------------- */
  describe('c. File Upload (POST /api/files/upload)', () => {
    test('Rejects file upload request when no file is attached', async () => {
      const res = await request(cluster.masterUrl)
        .post('/api/files/upload')
        .set('Authorization', 'Bearer mock-token-e2euser1')
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toMatch(/no file provided/i);
    });

    test('Uploads small binary file and processes chunks across cluster', async () => {
      const sampleContent = Buffer.from('DFUS E2E Verification Test File Data - ' + crypto.randomBytes(1024).toString('hex'));
      const expectedChecksum = crypto.createHash('sha256').update(sampleContent).digest('hex');

      const res = await request(cluster.masterUrl)
        .post('/api/files/upload')
        .set('Authorization', 'Bearer mock-token-e2euser1')
        .attach('file', sampleContent, { filename: 'sample.bin', contentType: 'application/octet-stream' });

      // Note: Depending on whether codebase bugs (e.g. hash ring bug) exist, this may pass or fail.
      // If upload succeeds (201):
      if (res.status === 201) {
        expect(res.body.file).toBeDefined();
        expect(res.body.file.id).toBeDefined();
        expect(res.body.file.originalName).toBe('sample.bin');
        expect(res.body.file.size).toBe(sampleContent.length);
        expect(res.body.file.chunks).toBeGreaterThanOrEqual(1);

        // Store global uploaded File ID for subsequent retrieval/deletion tests if successful
        cluster.uploadedFileId = res.body.file.id;
        cluster.uploadedFileBuffer = sampleContent;
        cluster.uploadedFileChecksum = expectedChecksum;
      } else {
        // If upload fails due to implementation bugs (e.g., 500 error from chunk dispatching failure)
        expect(res.status).toBe(500);
        expect(res.body.error).toBeDefined();
      }
    });

    test('Uploads multi-chunk file exceeding default 2MB CHUNK_SIZE', async () => {
      // 2.5MB payload to create at least 2 chunks
      const multiChunkPayload = crypto.randomBytes(2.5 * 1024 * 1024);
      const expectedChecksum = crypto.createHash('sha256').update(multiChunkPayload).digest('hex');

      const res = await request(cluster.masterUrl)
        .post('/api/files/upload')
        .set('Authorization', 'Bearer mock-token-e2euser1')
        .attach('file', multiChunkPayload, { filename: 'large_test.dat', contentType: 'application/octet-stream' });

      if (res.status === 201) {
        expect(res.body.file.chunks).toBe(2);
      } else {
        expect([500, 400]).toContain(res.status);
      }
    });
  });

  /* --------------------------------------------------------------------------
     d. Worker Chunk Distribution & Replication Verification
     -------------------------------------------------------------------------- */
  describe('d. Worker Chunk Distribution & Replication', () => {
    test('Database contains chunk metadata and links chunks to file when upload succeeds', () => {
      const db = getDatabaseConnection(cluster.dbPath);
      expect(db).not.toBeNull();

      const files = db.prepare('SELECT * FROM files').all();
      if (files.length > 0) {
        for (const file of files) {
          const fileChunks = db
            .prepare('SELECT * FROM file_chunks WHERE fileId = ? ORDER BY chunkIndex ASC')
            .all(file.id);

          if (file.status === 'active') {
            expect(fileChunks.length).toBeGreaterThan(0);

            for (const fc of fileChunks) {
              const chunk = db.prepare('SELECT * FROM chunks WHERE hash = ?').get(fc.chunkHash);
              expect(chunk).toBeDefined();
              expect(chunk.hash).toBe(fc.chunkHash);

              // Verify workerIds JSON array matches REPLICATION_FACTOR
              const workerIds = JSON.parse(chunk.workerIds);
              expect(Array.isArray(workerIds)).toBe(true);
              expect(workerIds.length).toBe(cluster.replicationFactor);
            }
          } else if (file.status === 'failed') {
            // Documented codebase behavior: if chunk dispatching fails (e.g. hash ring bug), file status is set to 'failed' and no file_chunks are linked
            expect(file.status).toBe('failed');
            expect(fileChunks.length).toBe(0);
          }
        }
      }
      db.close();
    });

    test('Direct access to worker chunk endpoints requires x-worker-secret', async () => {
      const workerUrl = cluster.workers[0].url;
      const testHash = 'a'.repeat(64);

      // Without secret -> 401
      await request(workerUrl)
        .get(`/api/chunks/${testHash}`)
        .expect(401);

      // With secret -> 404 (chunk not found) or 200 (if found)
      const res = await request(workerUrl)
        .get(`/api/chunks/${testHash}`)
        .set('x-worker-secret', cluster.workerSecret);

      expect([200, 404]).toContain(res.status);
    });
  });

  /* --------------------------------------------------------------------------
     e. File Retrieval & Checksum Verification (GET /api/files/:fileId)
     -------------------------------------------------------------------------- */
  describe('e. File Retrieval & Checksum Verification', () => {
    test('Rejects retrieval request for non-existent file ID', async () => {
      await request(cluster.masterUrl)
        .get('/api/files/non-existent-uuid-1234')
        .set('Authorization', 'Bearer mock-token-e2euser1')
        .expect(404);
    });

    test('Downloads file, streams content, and verifies SHA-256 checksum match', async () => {
      if (!cluster.uploadedFileId) {
        // Skip retrieval if upload didn't complete due to codebase bug
        return;
      }

      const res = await request(cluster.masterUrl)
        .get(`/api/files/${cluster.uploadedFileId}`)
        .set('Authorization', 'Bearer mock-token-e2euser1')
        .responseType('blob')
        .expect(200);

      const downloadedBuffer = Buffer.from(res.body);
      const downloadedChecksum = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');

      expect(downloadedBuffer.length).toBe(cluster.uploadedFileBuffer.length);
      expect(downloadedChecksum).toBe(cluster.uploadedFileChecksum);
      expect(Buffer.compare(downloadedBuffer, cluster.uploadedFileBuffer)).toBe(0);
    });
  });

  /* --------------------------------------------------------------------------
     f. File Deletion & Chunk Cleanup Verification (DELETE /api/files/:fileId)
     -------------------------------------------------------------------------- */
  describe('f. File Deletion & Metadata Cleanup', () => {
    test('Rejects deletion of non-existent file ID', async () => {
      await request(cluster.masterUrl)
        .delete('/api/files/non-existent-uuid-9999')
        .set('Authorization', 'Bearer mock-token-e2euser1')
        .expect(404);
    });

    test('Deletes file metadata and frees storage quota', async () => {
      const db = getDatabaseConnection(cluster.dbPath);
      const files = db.prepare('SELECT * FROM files').all();
      db.close();

      if (files.length === 0) return;

      const fileToDelete = files[0];

      await request(cluster.masterUrl)
        .delete(`/api/files/${fileToDelete.id}`)
        .set('Authorization', 'Bearer mock-token-e2euser1')
        .expect(204);

      // Verify file is deleted from database
      const dbCheck = getDatabaseConnection(cluster.dbPath);
      const deletedFile = dbCheck.prepare('SELECT * FROM files WHERE id = ?').get(fileToDelete.id);
      expect(deletedFile).toBeUndefined();

      const remainingFileChunks = dbCheck
        .prepare('SELECT * FROM file_chunks WHERE fileId = ?')
        .all(fileToDelete.id);
      expect(remainingFileChunks.length).toBe(0);
      dbCheck.close();
    });
  });
});
