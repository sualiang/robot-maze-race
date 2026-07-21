import request from 'supertest';
import app from '../src/index';
import { createPlayerToken, createAdminToken, setupTestDatabase, resetDatabase } from './helpers';
import { initSchema } from '../src/config/database';

describe('Auth Routes', () => {
  beforeAll(() => {
    initSchema(); // 确保表结构存在
    const db = require('../src/config/database').default;
    setupTestDatabase(db);
  });

  afterAll(() => {
    // 清理：禁用外键，删所有表的数据，再启用
    const db = require('../src/config/database').default;
    db.pragma('foreign_keys = OFF');
    const { resetDatabase } = require('./helpers');
    resetDatabase(db);
    db.pragma('foreign_keys = ON');
  });

  // Test 1: POST /api/v1/auth/wx-login without code -> 400
  it('POST /api/v1/auth/wx-login without code returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/wx-login')
      .send({})
      .expect(400);
    expect(res.body.code).toBe(400);
    expect(res.body.message).toContain('缺少登录凭证');
  });

  // Test 2: POST /api/v1/auth/wx-login with dev-test-code -> 200
  it('POST /api/v1/auth/wx-login with dev-test-code returns 200 + token + user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/wx-login')
      .send({ code: 'dev-test-code' })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data).toHaveProperty('is_new_user');
    expect(res.body.data.is_new_user).toBe(true);
    expect(res.body.data.user.role).toBe('player');
  });

  // Test 3: POST /api/v1/auth/admin-login with correct credentials -> 200
  it('POST /api/v1/auth/admin-login admin/admin123 returns 200', async () => {
    const db = require('../src/config/database').default;
    db.prepare(`INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`)
      .run('auth-admin-id', 'auth_admin_openid', 'admin', 'admin');

    const res = await request(app)
      .post('/api/v1/auth/admin-login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('user');
  });

  // Test 4: POST /api/v1/auth/admin-login with wrong password -> 401
  it('POST /api/v1/auth/admin-login wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/admin-login')
      .send({ username: 'admin', password: 'wrong_password' })
      .expect(401);
    expect(res.body.code).toBe(401);
  });

  // Test 5: POST /api/v1/auth/login mock referee login -> 200
  it('POST /api/v1/auth/login mock referee login returns 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '13800138000', password: '123456', role: 'referee' })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.role).toBe('referee');
  });

  // Test 6: GET /api/v1/auth/me with token -> 200
  it('GET /api/v1/auth/me with valid token returns 200', async () => {
    const token = createAdminToken('auth-me-admin');
    const db = require('../src/config/database').default;
    db.prepare(`INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`)
      .run('auth-me-admin', 'auth_me_openid', 'AuthMe', 'admin');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('id');
  });

  // Test 7: GET /api/v1/auth/me without token -> 401
  it('GET /api/v1/auth/me without token returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);
    expect(res.body.code).toBe(401);
  });

  // Test 8: wx-login creates a new user on first call, then the user can login with token
  it('wx-login creates user and GET /auth/me returns the created user', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/wx-login')
      .send({ code: 'dev-test-code' })
      .expect(200);
    expect(loginRes.body.data).toHaveProperty('token');
    expect(loginRes.body.data).toHaveProperty('user');
    expect(loginRes.body.data.is_new_user).toBe(true);

    // Verify the user can access /auth/me with the token
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`)
      .expect(200);
    expect(meRes.body.code).toBe(0);
    expect(meRes.body.data.id).toBe(loginRes.body.data.user.id);
  });
});
