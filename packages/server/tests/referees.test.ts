import request from 'supertest';
import app from '../src/index';
import { createAdminToken, createPlayerToken, setupTestDatabase } from './helpers';

describe('Referees', () => {
  let adminToken: string;
  let playerToken: string;
  let venueId: string;
  let refereeId: string;
  const db = require('../src/config/database').default;

  beforeAll(() => {
    setupTestDatabase(db);
    adminToken = createAdminToken();
    playerToken = createPlayerToken('test-player-id');
  });

  beforeEach(async () => {
    // Clean referees and venues between tests
    db.exec('DELETE FROM referees');
    db.exec('DELETE FROM venues');

    // Re-seed users
    const insertUser = db.prepare(
      `INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`
    );
    insertUser.run('test-admin-id', 'test_openid_admin', '管理员', 'admin');
    insertUser.run('test-player-id', 'test_openid_player', '玩家张三', 'player');
    insertUser.run('test-referee-id', 'test_openid_referee', '裁判李四', 'referee');

    // Create a venue
    const venueRes = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '裁判测试赛场' })
      .expect(201);
    venueId = venueRes.body.data.id;
  });

  // Test 1: POST /api/v1/referees/apply -> 201
  it('POST /api/v1/referees/apply creates referee application', async () => {
    const res = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138001', id_number: '110101199001011234' })
      .expect(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.cert_status).toBe('pending');
    refereeId = res.body.data.id;
  });

  // Test 2: Same user duplicate application -> 400
  it('duplicate application returns 400', async () => {
    await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138001' })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138001' })
      .expect(400);
    expect(res.body.code).toBe(400);
    expect(res.body.message).toContain('已有裁判记录');
  });

  // Test 3: GET /api/v1/referees/my -> 200
  it('GET /api/v1/referees/my returns referee info', async () => {
    const applyRes = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138002' })
      .expect(201);
    refereeId = applyRes.body.data.id;

    const res = await request(app)
      .get('/api/v1/referees/my')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.venue_id).toBe(venueId);
  });

  // Test 4: PUT /api/v1/referees/:id/approve admin approve -> 200
  it('PUT /api/v1/referees/:id/approve admin approves referee', async () => {
    const applyRes = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138003' })
      .expect(201);
    refereeId = applyRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/referees/${refereeId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cert_status: 'approved' })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.cert_status).toBe('approved');
  });

  // Test 5: Rejected referee can re-apply -> 200
  it('rejected referee can re-apply returns 200', async () => {
    const applyRes = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138004' })
      .expect(201);
    refereeId = applyRes.body.data.id;

    await request(app)
      .put(`/api/v1/referees/${refereeId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cert_status: 'rejected' })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138004' })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('重新提交');
  });

  // Test 6: PUT /api/v1/referees/:id/bind-venue -> 200
  it('PUT /api/v1/referees/:id/bind-venue updates venue binding', async () => {
    const applyRes = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138005' })
      .expect(201);
    refereeId = applyRes.body.data.id;

    const venue2Res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '第二个赛场' })
      .expect(201);
    const venue2Id = venue2Res.body.data.id;

    const res = await request(app)
      .put(`/api/v1/referees/${refereeId}/bind-venue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ venue_id: venue2Id })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.venue_id).toBe(venue2Id);
  });

  // Test 7: GET /api/v1/referees list (admin) -> 200 + pagination
  it('GET /api/v1/referees returns paginated list', async () => {
    const res = await request(app)
      .get('/api/v1/referees')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('list');
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('page');
    expect(res.body.data).toHaveProperty('pageSize');
  });

  // Test 8: Player tries to approve -> 403
  it('player tries to approve referee returns 403', async () => {
    const applyRes = await request(app)
      .post('/api/v1/referees/apply')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ venue_id: venueId, phone: '13800138006' })
      .expect(201);
    refereeId = applyRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/referees/${refereeId}/approve`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ cert_status: 'approved' })
      .expect(403);
    expect(res.body.code).toBe(403);
  });
});
