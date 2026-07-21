import request from 'supertest';
import app from '../src/index';
import { createAdminToken, createOperatorToken, setupTestDatabase } from './helpers';

describe('Operator Routes', () => {
  let adminToken: string;
  let operatorToken: string;
  let venueId: string;
  const db = require('../src/config/database').default;

  beforeAll(() => {
    // setupTestDatabase seeds all test users (admin, player, operator, referee)
    setupTestDatabase(db);

    adminToken = createAdminToken('test-admin-id');
    operatorToken = createOperatorToken('test-operator-id');

    // Seed an operator entry (this is the operators table, not users)
    db.prepare(
      `INSERT OR IGNORE INTO operators (id, name, phone, company_name, profit_share_rate, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('test-operator-id', '测试运营商', '13800139000', '测试公司', 80, 'active');
  });

  beforeEach(() => {
    db.exec('DELETE FROM venues');
  });

  // Test 1: GET /api/v1/operator/finance/summary -> 200
  it('GET /api/v1/operator/finance/summary returns finance summary', async () => {
    const res = await request(app)
      .get('/api/v1/operator/finance/summary')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('operator');
    expect(res.body.data).toHaveProperty('settlements');
  });

  // Test 2: GET /api/v1/operator/marketing -> 200
  it('GET /api/v1/operator/marketing returns marketing config', async () => {
    // Create a venue using the operator token (operator_id = test-operator-id which is in users table)
    const venueRes = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: '运营商赛场' })
      .expect(201);
    venueId = venueRes.body.data.id;

    const res = await request(app)
      .get('/api/v1/operator/marketing')
      .set('Authorization', `Bearer ${operatorToken}`)
      .query({ venue_id: venueId })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
