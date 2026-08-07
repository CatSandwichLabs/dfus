const request = require('supertest');
const { app } = require('../../src/master/server');

// Mock database to prevent actual connections
jest.mock('../../src/repositories/database', () => ({
  initDatabase: jest.fn().mockResolvedValue(),
  getDatabase: () => ({
    users: { findOne: jest.fn().mockResolvedValue(null) },
    files: {},
    folders: {}
  })
}));

describe('Master Node API', () => {
  test('GET /api/v1/auth/login should return 400 without credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.statusCode).toBe(400);
  });
  
  test('GET /metrics should return Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });
});
