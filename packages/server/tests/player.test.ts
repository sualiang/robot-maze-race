import request from 'supertest';
import app from '../src/index';
import { resetDatabase } from './helpers';

describe('Player Mock Routes', () => {
  beforeAll(() => {
    resetDatabase();
  });

  // Test 1: GET /api/v1/player/home -> 200
  it('GET /api/v1/player/home returns home data', async () => {
    const res = await request(app)
      .get('/api/v1/player/home')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('raceCount');
    expect(res.body.data).toHaveProperty('totalPlayers');
    expect(res.body.data).toHaveProperty('announcements');
    expect(Array.isArray(res.body.data.announcements)).toBe(true);
  });

  // Test 2: GET /api/v1/player/packages -> 200
  it('GET /api/v1/player/packages returns packages list', async () => {
    const res = await request(app)
      .get('/api/v1/player/packages')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  // Test 3: GET /api/v1/player/leaderboard -> 200
  it('GET /api/v1/player/leaderboard returns leaderboard', async () => {
    const res = await request(app)
      .get('/api/v1/player/leaderboard')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('entries');
    expect(res.body.data).toHaveProperty('myRanking');
    expect(Array.isArray(res.body.data.entries)).toBe(true);
  });

  // Test 4: GET /api/v1/player/me/stats -> 200
  it('GET /api/v1/player/me/stats returns player stats', async () => {
    const res = await request(app)
      .get('/api/v1/player/me/stats')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('raceCount');
    expect(res.body.data).toHaveProperty('helpCount');
    expect(res.body.data).toHaveProperty('couponCount');
  });

  // Test 5: GET /api/v1/player/me/race-records -> 200
  it('GET /api/v1/player/me/race-records returns race records', async () => {
    const res = await request(app)
      .get('/api/v1/player/me/race-records')
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
