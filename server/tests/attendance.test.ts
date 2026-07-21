import request from 'supertest';
import app from '../src/index';
import { createAdminToken, setupTestDatabase } from './helpers';

describe('Attendance + Checkin', () => {
  let adminToken: string;
  let refToken: string;
  let venueId: string;
  let refereePhone: string;
  let refereeUserId: string;
  const db = require('../src/config/database').default;

  beforeAll(() => {
    setupTestDatabase(db);
    adminToken = createAdminToken();
  });

  beforeEach(async () => {
    db.exec('DELETE FROM attendance');
    db.exec('DELETE FROM referees');
    db.exec('DELETE FROM venues');
    db.exec('DELETE FROM users');

    // Re-seed required users
    const insertUser = db.prepare(
      `INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`
    );
    insertUser.run('test-admin-id', 'test_openid_admin', '管理员', 'admin');

    // Create a venue
    const venueRes = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '签到测试赛场' })
      .expect(201);
    venueId = venueRes.body.data.id;

    // Login as mock referee - uses phone to create user+token
    // The route generates: openid='mock_openid_'+phone, user_id='ref_'+Date.now()
    refereePhone = '13900139001';
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: refereePhone, password: '123456', role: 'referee' })
      .expect(200);
    refToken = loginRes.body.data.token;
    const user = loginRes.body.data.user;
    refereeUserId = user.id;

    // The login route returns a user object but doesn't INSERT into DB.
    // We need to insert the user so that the referee's user_id FK is satisfied.
    insertUser.run(refereeUserId, 'mock_openid_' + refereePhone, user.nickname, 'referee');

    // Create a referee record linked to the phone that the check-in route expects
    // The check-in route does: openid.replace('mock_openid_', '') to derive the phone
    const refId = 'ref_' + Date.now();
    db.prepare(
      `INSERT INTO referees (id, user_id, venue_id, cert_status, phone) VALUES (?, ?, ?, ?, ?)`
    ).run(refId, refereeUserId, venueId, 'approved', refereePhone);
  });

  // Test 1: GET /api/v1/referees/attendance/status -> 200
  it('GET /api/v1/referees/attendance/status returns 200', async () => {
    const res = await request(app)
      .get('/api/v1/referees/attendance/status')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toBeDefined();
    expect(res.body.data).toHaveProperty('isReferee');
    expect(res.body.data).toHaveProperty('checkedIn');
  });

  // Test 2: POST /api/v1/referees/attendance/check-in -> 200
  it('POST /api/v1/referees/attendance/check-in returns 200', async () => {
    const res = await request(app)
      .post('/api/v1/referees/attendance/check-in')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ venueId })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('签到成功');
  });

  // Test 3: Duplicate check-in -> 400
  it('duplicate check-in returns 400', async () => {
    await request(app)
      .post('/api/v1/referees/attendance/check-in')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ venueId })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/referees/attendance/check-in')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ venueId })
      .expect(400);
    expect(res.body.code).toBe(400);
    expect(res.body.message).toContain('已签到');
  });

  // Test 4: POST /api/v1/referees/attendance/check-out -> 200
  it('check-in then check-out returns 200', async () => {
    await request(app)
      .post('/api/v1/referees/attendance/check-in')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ venueId })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/referees/attendance/check-out')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('签退成功');
  });

  // Test 5: GET /api/v1/attendance and /api/v1/attendance/stats -> 200
  it('GET /api/v1/attendance and stats return 200', async () => {
    await request(app)
      .post('/api/v1/referees/attendance/check-in')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ venueId })
      .expect(200);

    const listRes = await request(app)
      .get('/api/v1/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listRes.body.code).toBe(0);

    const statsRes = await request(app)
      .get('/api/v1/attendance/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(statsRes.body.code).toBe(0);
    expect(statsRes.body.data).toHaveProperty('total');
    expect(statsRes.body.data).toHaveProperty('today');
  });
});
