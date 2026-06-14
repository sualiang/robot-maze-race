import request from 'supertest';
import app from '../src/index';
import { createAdminToken, createPlayerToken, setupTestDatabase } from './helpers';

describe('Venues CRUD', () => {
  let adminToken: string;
  let createdVenueId: string;

  beforeAll(() => {
    const db = require('../src/config/database').default;
    setupTestDatabase(db);
    adminToken = createAdminToken();
  });

  // Test 1: GET /api/v1/venues empty list -> 200
  it('GET /api/v1/venues returns empty list', async () => {
    const res = await request(app)
      .get('/api/v1/venues')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list).toEqual([]);
  });

  // Test 2: POST /api/v1/venues create (with auth) -> 201
  it('POST /api/v1/venues creates a venue', async () => {
    const res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '测试赛场-A', address: '北京市朝阳区' })
      .expect(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('测试赛场-A');
    createdVenueId = res.body.data.id;
  });

  // Test 3: GET /api/v1/venues with data -> 200 + list
  it('GET /api/v1/venues returns list with data', async () => {
    const res = await request(app)
      .get('/api/v1/venues')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  // Test 4: GET /api/v1/venues/:id detail -> 200
  it('GET /api/v1/venues/:id returns venue detail', async () => {
    const res = await request(app)
      .get(`/api/v1/venues/${createdVenueId}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe(createdVenueId);
    expect(res.body.data.name).toBe('测试赛场-A');
  });

  // Test 5: PUT /api/v1/venues/:id update -> 200
  it('PUT /api/v1/venues/:id updates venue', async () => {
    const res = await request(app)
      .put(`/api/v1/venues/${createdVenueId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '测试赛场-A-已更新', address: '上海市浦东新区' })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.name).toBe('测试赛场-A-已更新');
  });

  // Test 6: DELETE /api/v1/venues/:id admin delete -> 200
  it('DELETE /api/v1/venues/:id admin deletes venue', async () => {
    const res = await request(app)
      .delete(`/api/v1/venues/${createdVenueId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('已删除');
  });

  // Test 7: GET /api/v1/venues/:id not exists -> 404
  it('GET /api/v1/venues/:id non-existent returns 404', async () => {
    const res = await request(app)
      .get('/api/v1/venues/non-existent-id')
      .expect(404);
    expect(res.body.code).toBe(404);
    expect(res.body.message).toContain('不存在');
  });

  // Test 8: POST /api/v1/venues without name -> 400
  it('POST /api/v1/venues without name returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ address: '某地' })
      .expect(400);
    expect(res.body.code).toBe(400);
    expect(res.body.message).toContain('名称不能为空');
  });

  // Test 9: Player tries to delete venue -> 403
  it('player tries to delete venue returns 403', async () => {
    // First create a venue to delete
    const createRes = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '临时赛场' })
      .expect(201);
    const venueId = createRes.body.data.id;

    const playerToken = createPlayerToken();
    const res = await request(app)
      .delete(`/api/v1/venues/${venueId}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(403);
    expect(res.body.code).toBe(403);
  });
});
