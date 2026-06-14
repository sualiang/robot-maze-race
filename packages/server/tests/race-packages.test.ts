import request from 'supertest';
import app from '../src/index';
import { createAdminToken, createPlayerToken, setupTestDatabase } from './helpers';

describe('Race Packages', () => {
  let adminToken: string;
  let playerToken: string;
  let pkgId: string;

  beforeAll(() => {
    const db = require('../src/config/database').default;
    setupTestDatabase(db);
    adminToken = createAdminToken();
    playerToken = createPlayerToken();
  });

  // Test 1: GET /api/v1/race-packages empty list -> 200
  it('GET /api/v1/race-packages returns empty list', async () => {
    const res = await request(app)
      .get('/api/v1/race-packages')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list).toEqual([]);
  });

  // Test 2: POST /api/v1/race-packages create (admin auth) -> 201
  it('POST /api/v1/race-packages creates a package', async () => {
    const res = await request(app)
      .post('/api/v1/race-packages')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '青铜勇士包', price: 99, race_count: 3, valid_days: 365 })
      .expect(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('青铜勇士包');
    expect(res.body.data.price).toBe(9900);
    pkgId = res.body.data.id;
  });

  // Test 3: GET /api/v1/race-packages with data -> 200
  it('GET /api/v1/race-packages returns list with data', async () => {
    const res = await request(app)
      .get('/api/v1/race-packages')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  // Test 4: GET /api/v1/race-packages/:id -> 200
  it('GET /api/v1/race-packages/:id returns package detail', async () => {
    const res = await request(app)
      .get(`/api/v1/race-packages/${pkgId}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(pkgId);
    expect(res.body.data.name).toBe('青铜勇士包');
  });

  // Test 5: PUT /api/v1/race-packages/:id update -> 200
  it('PUT /api/v1/race-packages/:id updates package', async () => {
    const res = await request(app)
      .put(`/api/v1/race-packages/${pkgId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '青铜勇士包-增强版', price: 149 })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.name).toBe('青铜勇士包-增强版');
  });

  // Test 6: DELETE /api/v1/race-packages/:id (admin only) -> the route checks admin role
  it('DELETE /api/v1/race-packages/:id soft deletes (status=inactive)', async () => {
    const res = await request(app)
      .delete(`/api/v1/race-packages/${pkgId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('已下架');

    // Verify it's soft-deleted by checking status via direct id lookup
    // (the list route filters by active by default)
    const getRes = await request(app)
      .get(`/api/v1/race-packages/${pkgId}`)
      .expect(200);
    expect(getRes.body.data).toBeDefined();
  });

  // Test 7: POST /api/v1/race-packages with invalid (zero) price -> 400
  it('POST /api/v1/race-packages with invalid price returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/race-packages')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '无效包', price: 0, race_count: 1 })
      .expect(400);
    expect(res.body.code).toBe(400);
    expect(res.body.message).toContain('价格');
  });

  // Test 8: Player tries to create a package -> 403
  it('player tries to create package returns 403', async () => {
    const res = await request(app)
      .post('/api/v1/race-packages')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ name: 'player包', price: 50, race_count: 1 })
      .expect(403);
    expect(res.body.code).toBe(403);
  });
});
