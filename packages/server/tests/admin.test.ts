import request from 'supertest';
import app from '../src/index';
import { createAdminToken, createRefereeToken, setupTestDatabase } from './helpers';
import db from '../src/config/database';

describe('Admin Routes — Comprehensive API Tests', () => {
  let adminToken: string;
  let operatorId: string;
  let createdOperatorId: string;
  const testDb = db;

  beforeAll(() => {
    setupTestDatabase(testDb);
    adminToken = createAdminToken();
  });

  // ============================================================
  // 1. Admin Login (via auth route)
  // ============================================================
  describe('Auth — Admin Login', () => {
    it('POST /api/v1/auth/admin-login succeeds with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin-login')
        .send({ username: 'admin', password: 'admin123' })
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('user');
    });

    it('POST /api/v1/auth/admin-login fails with wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin-login')
        .send({ username: 'admin', password: 'wrong' })
        .expect(401);
      expect(res.body.code).toBe(401);
    });

    it('POST /api/v1/auth/admin-login fails without credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin-login')
        .send({})
        .expect(400);
      expect(res.body.code).toBe(400);
    });
  });

  // ============================================================
  // 2. Admin Operators CRUD
  // ============================================================
  describe('Admin Operators CRUD', () => {
    // Create
    it('POST /api/v1/admin/operators creates an operator', async () => {
      const res = await request(app)
        .post('/api/v1/admin/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '极限运动运营商',
          phone: '13900139000',
          email: 'contact@extreme.com',
          company_name: '极限运动有限公司',
          profit_share_rate: 80,
          contact_person: '张三',
        })
        .expect(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('极限运动运营商');
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.profit_share_rate).toBe(80);
      createdOperatorId = res.body.data.id;
    });

    // Create fails without name
    it('POST /api/v1/admin/operators fails without name', async () => {
      const res = await request(app)
        .post('/api/v1/admin/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '13900139000' })
        .expect(400);
      expect(res.body.code).toBe(400);
    });

    // Read list
    it('GET /api/v1/admin/operators returns list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    // Read detail
    it('GET /api/v1/admin/operators/:id returns operator detail', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/operators/${createdOperatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(createdOperatorId);
      expect(res.body.data.name).toBe('极限运动运营商');
    });

    // Read detail — not found
    it('GET /api/v1/admin/operators/:id returns 404 for unknown id', async () => {
      const res = await request(app)
        .get('/api/v1/admin/operators/nonexistent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(res.body.code).toBe(404);
    });

    // Update
    it('PUT /api/v1/admin/operators/:id updates an operator', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/operators/${createdOperatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '极限运动运营商(已更新)',
          phone: '13900139001',
          company_name: '极限运动股份公司',
          profit_share_rate: 85,
          contact_person: '李四',
        })
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('极限运动运营商(已更新)');
      expect(res.body.data.profit_share_rate).toBe(85);
    });

    // Patch status — disable
    it('PATCH /api/v1/admin/operators/:id disables operator', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/operators/${createdOperatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'disabled' })
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('disabled');
    });

    // Patch status — re-enable
    it('PATCH /api/v1/admin/operators/:id enables operator', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/operators/${createdOperatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' })
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.status).toBe('active');
    });

    // Patch status — invalid value
    it('PATCH /api/v1/admin/operators/:id rejects invalid status', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/operators/${createdOperatorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'bogus' })
        .expect(400);
      expect(res.body.code).toBe(400);
    });

    // 403 for non-admin
    it('returns 403 for non-admin user', async () => {
      const refereeToken = createRefereeToken();
      const res = await request(app)
        .get('/api/v1/admin/operators')
        .set('Authorization', `Bearer ${refereeToken}`)
        .expect(403);
      expect(res.body.code).toBe(403);
    });
  });

  // ============================================================
  // 3. Admin Attendance
  // ============================================================
  describe('Admin Attendance', () => {
    // Seed some attendance data
    beforeAll(() => {
      // Ensure a venue exists
      const existing = testDb.prepare('SELECT id FROM venues LIMIT 1').get() as any;
      let venueId: string;
      if (!existing) {
        const vId = 'test-venue-attendance-001';
        testDb.prepare(
          `INSERT INTO venues (id, name, status) VALUES (?, ?, 'open')`
        ).run(vId, '测试赛场A');
        venueId = vId;
      } else {
        venueId = existing.id;
      }

      // Ensure a referee exists
      const refResult = testDb.prepare("SELECT id FROM referees WHERE user_id = 'test-referee-id' LIMIT 1").get() as any;
      if (!refResult) {
        const refId = 'test-ref-attendance-001';
        testDb.prepare(
          `INSERT INTO referees (id, user_id, venue_id) VALUES (?, ?, ?)`
        ).run(refId, 'test-referee-id', venueId);
      }

      // Insert attendance records
      const now = new Date().toISOString();
      const hourly = new Date(Date.now() - 3600000).toISOString();
      testDb.prepare(
        `INSERT OR IGNORE INTO attendance (id, referee_id, user_id, venue_id, checkin_at, checkout_at, gps_lat, gps_lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('test-att-1', 'test-ref-attendance-001', 'test-referee-id', venueId, hourly, now, 39.9042, 116.4074);
      testDb.prepare(
        `INSERT OR IGNORE INTO attendance (id, referee_id, user_id, venue_id, checkin_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run('test-att-2', 'test-ref-attendance-001', 'test-referee-id', venueId, now);
    });

    it('GET /api/v1/admin/attendance returns attendance records', async () => {
      const res = await request(app)
        .get('/api/v1/admin/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('list');
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });

    it('GET /api/v1/admin/attendance supports date filtering', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get(`/api/v1/admin/attendance?start_date=${today}&end_date=${today}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
    });

    it('GET /api/v1/admin/attendance/export returns CSV', async () => {
      const res = await request(app)
        .get('/api/v1/admin/attendance/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('裁判姓名');
    });
  });

  // ============================================================
  // 4. Admin Marketing
  // ============================================================
  describe('Admin Marketing', () => {
    it('GET /api/v1/admin/marketing/config returns config object', async () => {
      const res = await request(app)
        .get('/api/v1/admin/marketing/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      // Should be a flat object, not an array
      expect(typeof res.body.data).toBe('object');
      expect(!Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveProperty('help_default_enabled');
    });

    it('PUT /api/v1/admin/marketing/config saves config', async () => {
      const res = await request(app)
        .put('/api/v1/admin/marketing/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          help_default_enabled: true,
          help_required_count: 5,
          help_reward_amount: 1000,
          coupon_default_enabled: true,
          coupon_valid_days: 30,
          coupon_default_amount: 2000,
          coupon_max_multiplier: 3,
          coupon_trigger_races: 5,
        })
        .expect(200);
      expect(res.body.code).toBe(0);

      // Verify saved
      const getRes = await request(app)
        .get('/api/v1/admin/marketing/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(getRes.body.data.help_required_count).toBe(5);
      expect(getRes.body.data.help_reward_amount).toBe(1000);
    });

    it('GET /api/v1/admin/marketing/operators returns operator list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/marketing/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('list');
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });
  });

  // ============================================================
  // 5. Admin Finance
  // ============================================================
  describe('Admin Finance', () => {
    beforeAll(() => {
      // Seed order and settlement data for finance tests
      const existingUser = testDb.prepare("SELECT id FROM users WHERE role = 'operator' LIMIT 1").get() as any;
      const operatorUserId = existingUser ? existingUser.id : 'test-operator-id';

      // Need an order first (FK constraint)
      const existingPkg = testDb.prepare("SELECT id FROM race_packages LIMIT 1").get() as any;
      if (!existingPkg) {
        testDb.prepare("INSERT INTO race_packages (id, name, amount_cents, duration_days) VALUES (?, ?, ?, ?)").run('test-pkg-1', 'Test Package', 10000, 30);
      }
      const pkgId = 'test-pkg-1';
      testDb.prepare(
        "INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents) VALUES (?, ?, ?, ?, ?)"
      ).run('test-order-1', 'TEST-ORDER-001', 'test-player-id', pkgId, 100000);
      testDb.prepare(
        "INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents) VALUES (?, ?, ?, ?, ?)"
      ).run('test-order-2', 'TEST-ORDER-002', 'test-player-id', pkgId, 50000);

      testDb.prepare(
        `INSERT OR IGNORE INTO settlements (id, order_id, operator_id, amount_cents, commission_cents, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('test-settle-1', 'test-order-1', operatorUserId, 100000, 20000, 'pending');
      testDb.prepare(
        `INSERT OR IGNORE INTO settlements (id, order_id, operator_id, amount_cents, commission_cents, status, settled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('test-settle-2', 'test-order-2', operatorUserId, 50000, 10000, 'settled', new Date().toISOString());

      // Seed operator row too
      const existingOp = testDb.prepare("SELECT id FROM operators WHERE name = 'Test Operator' LIMIT 1").get() as any;
      if (!existingOp) {
        testDb.prepare(
          `INSERT INTO operators (id, name, phone, company_name, profit_share_rate, contact_person)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('test-fin-operator-1', 'Test Operator', '13800000000', 'Test Co', 80, 'Tom');
      }
    });

    it('GET /api/v1/admin/finance/stats returns stats', async () => {
      const res = await request(app)
        .get('/api/v1/admin/finance/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('total_revenue');
      expect(res.body.data).toHaveProperty('total_orders');
      expect(res.body.data).toHaveProperty('platform_profit');
      expect(res.body.data).toHaveProperty('pending_withdraw');
      expect(res.body.data).toHaveProperty('total_withdrawn');
    });

    it('GET /api/v1/admin/finance/withdraws returns withdraw list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/finance/withdraws')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('list');
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });

    it('POST /api/v1/admin/finance/withdraws/:id/approve approves withdraw', async () => {
      const res = await request(app)
        .post('/api/v1/admin/finance/withdraws/test-settle-1/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);

      // Verify status changed
      const updated = testDb.prepare('SELECT status FROM settlements WHERE id = ?').get('test-settle-1') as any;
      expect(updated.status).toBe('approved');
    });

    it('POST /api/v1/admin/finance/withdraws/:id/reject rejects withdraw', async () => {
      // Create a new pending settlement for reject test
      testDb.prepare(
        "INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents) VALUES (?, ?, ?, ?, ?)"
      ).run('test-order-3', 'TEST-ORDER-003', 'test-player-id', 'test-pkg-1', 10000);
      testDb.prepare(
        `INSERT OR REPLACE INTO settlements (id, order_id, operator_id, amount_cents, commission_cents, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('test-settle-3', 'test-order-3', 'test-operator-id', 10000, 2000, 'pending');

      const res = await request(app)
        .post('/api/v1/admin/finance/withdraws/test-settle-3/reject')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);

      const updated = testDb.prepare('SELECT status FROM settlements WHERE id = ?').get('test-settle-3') as any;
      expect(updated.status).toBe('rejected');
    });

    it('GET /api/v1/admin/finance/revenue-breakdown returns breakdown', async () => {
      const res = await request(app)
        .get('/api/v1/admin/finance/revenue-breakdown')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('list');
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });

    it('GET /api/v1/admin/finance/profit-config returns config', async () => {
      const res = await request(app)
        .get('/api/v1/admin/finance/profit-config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('operator_share_rate');
      expect(res.body.data).toHaveProperty('platform_share_rate');
      expect(res.body.data).toHaveProperty('payment_fee_rate');
    });

    it('PUT /api/v1/admin/finance/profit-config saves config', async () => {
      const res = await request(app)
        .put('/api/v1/admin/finance/profit-config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          operator_share_rate: 75,
          platform_share_rate: 25,
          payment_fee_rate: 0.5,
        })
        .expect(200);
      expect(res.body.code).toBe(0);

      // Verify
      const getRes = await request(app)
        .get('/api/v1/admin/finance/profit-config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(getRes.body.data.operator_share_rate).toBe(75);
    });

    it('GET /api/v1/admin/finance/export returns CSV', async () => {
      const res = await request(app)
        .get('/api/v1/admin/finance/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('ID');
    });
  });

  // ============================================================
  // 6. Admin Settings
  // ============================================================
  describe('Admin Settings', () => {
    it('GET /api/v1/admin/settings returns settings object', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.code).toBe(0);
      // Should be a flat object
      expect(typeof res.body.data).toBe('object');
      expect(!Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveProperty('default_search_radius');
      expect(res.body.data).toHaveProperty('checkin_enabled');
      expect(res.body.data).toHaveProperty('maintenance_mode');
    });

    it('PUT /api/v1/admin/settings saves settings bulk', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          default_search_radius: 200,
          max_queue_size: 30,
          default_timeout_seconds: 600,
          checkin_enabled: true,
          help_enabled: false,
          coupon_enabled: true,
          gps_check_enabled: true,
          gps_check_radius: 300,
          auto_assign_venue: true,
          maintenance_mode: false,
          api_rate_limit: 200,
          max_race_per_day: 100,
        })
        .expect(200);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toContain('已保存');

      // Verify
      const getRes = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(getRes.body.data.default_search_radius).toBe(200);
      expect(getRes.body.data.help_enabled).toBe(false);
      expect(getRes.body.data.api_rate_limit).toBe(200);
    });
  });

  // ============================================================
  // 7. Admin Settings — Legacy single-key API
  // ============================================================
  describe('Admin Settings — Legacy single-key', () => {
    it('PUT /api/v1/admin/settings/:key updates single key', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings/cfg_default_search_radius')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: '300' })
        .expect(200);
      expect(res.body.code).toBe(0);
    });

    it('PUT /api/v1/admin/settings/:key returns 404 for unknown key', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings/nonexistent_key_xyz')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: '100' })
        .expect(404);
      expect(res.body.code).toBe(404);
    });
  });

  // ============================================================
  // 8. Auth — 401 without token
  // ============================================================
  describe('Auth — 401 without token', () => {
    it.each([
      '/api/v1/admin/operators',
      '/api/v1/admin/finance',
      '/api/v1/admin/finance/stats',
      '/api/v1/admin/marketing/config',
      '/api/v1/admin/settings',
      '/api/v1/admin/attendance',
    ])('%s returns 401 without token', async (path: string) => {
      const res = await request(app)
        .get(path)
        .expect(401);
      expect(res.body.code).toBe(401);
    });

    it.each([
      '/api/v1/admin/operators',
    ])('%s returns 401 without token on POST', async (path: string) => {
      const res = await request(app)
        .post(path)
        .send({})
        .expect(401);
      expect(res.body.code).toBe(401);
    });

    it('PUT /api/v1/admin/marketing/config returns 401 without token', async () => {
      const res = await request(app)
        .put('/api/v1/admin/marketing/config')
        .send({})
        .expect(401);
      expect(res.body.code).toBe(401);
    });

    it('PUT /api/v1/admin/settings returns 401 without token', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .send({})
        .expect(401);
      expect(res.body.code).toBe(401);
    });
  });
});
