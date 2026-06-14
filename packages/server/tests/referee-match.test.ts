import request from 'supertest';
import app from '../src/index';
import { createRefereeToken, setupTestDatabase } from './helpers';

describe('Referee Match (Mock)', () => {
  let refToken: string;

  beforeAll(() => {
    const db = require('../src/config/database').default;
    setupTestDatabase(db);
    refToken = createRefereeToken();
  });

  // Test 1: GET /api/v1/referees/match/queue -> 200
  it('GET /api/v1/referees/match/queue returns queue', async () => {
    const res = await request(app)
      .get('/api/v1/referees/match/queue')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('queue');
    expect(res.body.data).toHaveProperty('currentRacer');
  });

  // Test 2: POST /api/v1/referees/match/select-racer -> 200
  it('POST /api/v1/referees/match/select-racer selects a racer', async () => {
    const res = await request(app)
      .post('/api/v1/referees/match/select-racer')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ racerId: 1 })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.currentRacer).toBeDefined();
    expect(res.body.data.currentRacer.id).toBe(1);
  });

  // Test 3: POST /api/v1/referees/match/start -> 200
  it('POST /api/v1/referees/match/start starts race', async () => {
    const res = await request(app)
      .post('/api/v1/referees/match/start')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.currentRacer.status).toBe('racing');
  });

  // Test 4: POST /api/v1/referees/match/pause and resume -> 200
  it('POST /api/v1/referees/match/pause then resume works', async () => {
    const pauseRes = await request(app)
      .post('/api/v1/referees/match/pause')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(pauseRes.body.code).toBe(0);
    expect(pauseRes.body.data.currentRacer.status).toBe('paused');

    const resumeRes = await request(app)
      .post('/api/v1/referees/match/resume')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(resumeRes.body.code).toBe(0);
    expect(resumeRes.body.data.currentRacer.status).toBe('racing');
  });

  // Test 5: Finish a race (end test)
  it('POST /api/v1/referees/match/end finishes race', async () => {
    // Select and start racer 2 (racer 1 was already consumed by earlier tests)
    const selRes = await request(app)
      .post('/api/v1/referees/match/select-racer')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ racerId: 2 })
      .expect(200);
    expect(selRes.body.data.currentRacer.id).toBe(2);

    await request(app)
      .post('/api/v1/referees/match/start')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);

    const res = await request(app)
      .post('/api/v1/referees/match/end')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ elapsed: 45000 })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.result).toBeDefined();
    expect(res.body.data.result.elapsed).toBe(45000);
  });

  // Test 6: POST /api/v1/referees/match/malfunction -> 200
  it('POST /api/v1/referees/match/malfunction handles malfunction', async () => {
    await request(app)
      .post('/api/v1/referees/match/select-racer')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ racerId: 3 })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/referees/match/malfunction')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('malfunction');
  });

  // Test 7: POST /api/v1/referees/match/forfeit -> 200
  it('POST /api/v1/referees/match/forfeit handles forfeit', async () => {
    await request(app)
      .post('/api/v1/referees/match/select-racer')
      .set('Authorization', `Bearer ${refToken}`)
      .send({ racerId: 4 })
      .expect(200);

    const res = await request(app)
      .post('/api/v1/referees/match/forfeit')
      .set('Authorization', `Bearer ${refToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.currentRacer).toBeNull();
  });
});
