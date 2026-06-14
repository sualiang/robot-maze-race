import request from 'supertest';
import app from '../src/index';
import { createPlayerToken, createAdminToken, setupTestDatabase } from './helpers';

describe('Users', () => {
  let adminToken: string;
  let playerToken: string;
  const db = require('../src/config/database').default;

  beforeAll(() => {
    setupTestDatabase(db);
    adminToken = createAdminToken('test-admin-id');
    playerToken = createPlayerToken('test-player-id');
  });

  // Test 1: GET /api/v1/users list -> 200
  it('GET /api/v1/users returns user list', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list.length).toBeGreaterThanOrEqual(4);
  });

  // Test 2: GET /api/v1/users/:id -> 200
  it('GET /api/v1/users/:id returns user detail', async () => {
    const res = await request(app)
      .get('/api/v1/users/test-player-id')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.id).toBe('test-player-id');
    expect(res.body.data.nickname).toBe('玩家张三');
  });

  // Test 3: PUT /api/v1/users/:id update self -> 200
  it('PUT /api/v1/users/:id allows update own profile', async () => {
    const res = await request(app)
      .put('/api/v1/users/test-player-id')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ nickname: '玩家张三-已改名', avatar_url: 'https://example.com/avatar.png' })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.nickname).toBe('玩家张三-已改名');
  });

  // Test 4: PUT /api/v1/users/:id update others (non-admin) -> 403
  it('PUT /api/v1/users/:id non-admin updating others returns 403', async () => {
    const res = await request(app)
      .put('/api/v1/users/test-referee-id')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ nickname: 'hacker' })
      .expect(403);
    expect(res.body.code).toBe(403);
  });
});
