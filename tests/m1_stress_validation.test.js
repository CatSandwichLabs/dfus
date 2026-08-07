'use strict';

const request = require('supertest');
const { startCluster, stopCluster } = require('./e2e/clusterTestHelper');

describe('M1 Empirical Stress & Baseline Security Verification Suite', () => {
  let cluster = null;

  beforeAll(async () => {
    cluster = await startCluster({
      masterPort: 3098,
      workerBasePort: 4098,
      workerCount: 1,
      workerSecret: 'm1-stress-secret-key',
      replicationFactor: 1,
    });
  }, 40000);

  afterAll(async () => {
    if (cluster) {
      await stopCluster(cluster);
    }
  }, 20000);

  /* --------------------------------------------------------------------------
     1. Rate Limiter Validation
     -------------------------------------------------------------------------- */
  describe('1. Rate Limiter Validation', () => {
    test('Verifies rapid auth requests trigger HTTP 429 Too Many Requests with proper headers & JSON body once limit is reached', async () => {
      // Auth rate limiter limit is MAX = 10 per 15-minute window for /api/auth/*
      // Note: 1 request was consumed during cluster startup pollEndpoint
      const responses = [];
      for (let i = 1; i <= 12; i++) {
        const res = await request(cluster.masterUrl)
          .get('/api/auth/me');
        responses.push(res);
      }

      // Filter 429 responses
      const rateLimitedResponses = responses.filter((r) => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Inspect the first 429 response
      const first429 = rateLimitedResponses[0];
      expect(first429.status).toBe(429);

      // Verify standardized rate limit error payload
      expect(first429.body).toBeDefined();
      expect(first429.body.error).toBeDefined();
      expect(first429.body.error.code).toBe('AUTH_RATE_LIMIT_EXCEEDED');
      expect(first429.body.error.message).toMatch(/Too many authentication attempts/i);

      // Verify standard rate limit headers (ratelimit-limit, ratelimit-remaining, ratelimit-reset, retry-after)
      const headers = first429.headers;
      expect(headers['ratelimit-limit'] || headers['x-ratelimit-limit']).toBeDefined();
      expect(headers['ratelimit-remaining'] || headers['x-ratelimit-remaining']).toBe('0');
      expect(headers['ratelimit-reset'] || headers['retry-after']).toBeDefined();
    });
  });

  /* --------------------------------------------------------------------------
     2. Error Handling & 404 Catch-All
     -------------------------------------------------------------------------- */
  describe('2. Error Handling & 404 Catch-All', () => {
    test('Verifies undefined routes return standard 404 JSON response', async () => {
      const resGET = await request(cluster.masterUrl).get('/api/nonexistent');
      expect(resGET.status).toBe(404);
      expect(resGET.body.error).toBeDefined();
      expect(resGET.body.error.code).toBe('NOT_FOUND');
      expect(resGET.body.error.message).toBe('Cannot GET /api/nonexistent');
      expect(resGET.body.error.timestamp).toBeDefined();
      expect(resGET.body.error.path).toBe('/api/nonexistent');

      const resPOST = await request(cluster.masterUrl).post('/api/undefined/route');
      expect(resPOST.status).toBe(404);
      expect(resPOST.body.error).toBeDefined();
      expect(resPOST.body.error.code).toBe('NOT_FOUND');
      expect(resPOST.body.error.message).toBe('Cannot POST /api/undefined/route');
      expect(resPOST.body.error.timestamp).toBeDefined();
      expect(resPOST.body.error.path).toBe('/api/undefined/route');
    });
  });

  /* --------------------------------------------------------------------------
     3. Payload Limits & Security
     -------------------------------------------------------------------------- */
  describe('3. Payload Limits & Security', () => {
    test('Sends malformed JSON payload and verifies clean 400 response without crashing server', async () => {
      const res = await request(cluster.masterUrl)
        .post('/api/system/workers/register')
        .set('Content-Type', 'application/json')
        .send('{"id": "worker-test", "host": "127.0.0.1", "port": ');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_JSON');
      expect(res.body.error.message).toBe('Malformed JSON in request body');

      // Verify Master process is still healthy and responsive
      const healthCheck = await request(cluster.masterUrl).get('/api/nonexistent');
      expect(healthCheck.status).toBe(404);
    });

    test('Sends oversized JSON payload exceeding 10MB limit and verifies clean error response without crashing', async () => {
      // Generate 11MB payload (exceeding Express 10MB body limit)
      const hugeString = 'x'.repeat(11 * 1024 * 1024);
      const res = await request(cluster.masterUrl)
        .post('/api/system/workers/register')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ data: hugeString }));

      expect([413, 400]).toContain(res.status);
      expect(res.body.error).toBeDefined();

      // Verify Master process is still responsive after oversized payload attempt
      const healthCheck = await request(cluster.masterUrl).get('/api/nonexistent');
      expect(healthCheck.status).toBe(404);
    });
  });
});
