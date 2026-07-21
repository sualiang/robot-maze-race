/**
 * Merchant Routes — 商家端 API 测试
 *
 * 运行在测试环境 MySQL (robot_race_test) 上：
 *    DATABASE_URL=mysql://robot_race_test:robot_race_test@172.19.0.2:3306/robot_race_test
 *
 * 运行方式（在服务器上）：
 *    sudo docker exec robot-maze-race-backend-1 bash -c "\
 *      DATABASE_URL=mysql://robot_race_test:robot_race_test@172.19.0.2:3306/robot_race_test \
 *      NODE_ENV=development \
 *      npx jest tests/merchant.test.ts --no-coverage"
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// 需要使用 import app，但 import app 会触发模块加载
// 需要先设环境变量才能连接测试数据库
let app: any;

// 在 describe 之前先创建测试商家数据的辅助函数
const TEST_PREFIX = 'UT_M_' + Date.now().toString(36).toUpperCase();
const TEST_USERNAME = `${TEST_PREFIX}_ADMIN`;
const TEST_PASSWORD = 'TestPass_123456';
const TEST_MERCHANT_NAME = `${TEST_PREFIX}_测试商家`;
const TEST_MERCHANT_PHONE = `138${String(Date.now()).slice(-8)}`;

let testMerchantAdminId: string;
let testMerchantId: string;
let merchantToken: string;
let testCouponId: string;
let testVerifyCode: string;

/**
 * 创建商家管理员 JWT
 */
function createMerchantToken(overrides?: Partial<{
  merchantAdminId: string;
  merchantId: string;
  merchantName: string;
}>): string {
  return jwt.sign(
    {
      merchantAdminId: overrides?.merchantAdminId || testMerchantAdminId || 'test-id',
      merchantId: overrides?.merchantId || testMerchantId || 'test-mid',
      merchantName: overrides?.merchantName || TEST_MERCHANT_NAME,
      role: 'merchant_admin',
    },
    process.env.JWT_SECRET || 'robot-maze-race-jwt-secret-2024',
    { expiresIn: '7d' }
  );
}

// 插入种子数据的辅助函数
async function seedTestData(): Promise<void> {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: '172.19.0.2',
    port: 3306,
    user: 'robot_race_test',
    password: 'robot_race_test',
    database: 'robot_race_test',
  });

  try {
    // 清理之前的UT数据
    await conn.execute(`DELETE FROM merchant_invite_codes WHERE code LIKE '${TEST_PREFIX}%'`);
    await conn.execute(`DELETE FROM merchant_admin WHERE username LIKE '${TEST_PREFIX}%'`);
    await conn.execute(`DELETE FROM merchants WHERE id LIKE '${TEST_PREFIX}%'`);

    // 创建测试商家
    testMerchantId = `${TEST_PREFIX}_MERCHANT`;
    await conn.execute(
      `INSERT INTO merchants (id, name, address, phone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
      [testMerchantId, TEST_MERCHANT_NAME, '测试地址', TEST_MERCHANT_PHONE]
    );

    // 创建测试商家管理员
    testMerchantAdminId = `${TEST_PREFIX}_ADMIN`;
    const passwordHash = createHash('sha256').update(TEST_PASSWORD).digest('hex');
    await conn.execute(
      `INSERT INTO merchant_admin (id, username, password_hash, merchant_id, real_name, phone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [testMerchantAdminId, TEST_USERNAME, passwordHash, testMerchantId, '测试店长', TEST_MERCHANT_PHONE]
    );

    // 创建测试邀请码
    const inviteCode = `${TEST_PREFIX}_INVITE`;
    await conn.execute(
      `INSERT INTO merchant_invite_codes (code, merchant_id, used, created_by, created_at)
       VALUES (?, ?, 0, 'seed', NOW())`,
      [inviteCode, testMerchantId]
    );

    // 生成 token
    merchantToken = createMerchantToken({
      merchantAdminId: testMerchantAdminId,
      merchantId: testMerchantId,
      merchantName: TEST_MERCHANT_NAME,
    });

    console.log(`[Seed] Created merchant: ${testMerchantId}`);
    console.log(`[Seed] Created admin: ${testMerchantAdminId} (${TEST_USERNAME})`);
    console.log(`[Seed] Invite code: ${inviteCode}`);
    console.log(`[Seed] Token: ${merchantToken.substring(0, 20)}...`);
  } finally {
    await conn.end();
  }
}

import crypto from 'crypto';
const { createHash } = crypto;

// ============================================================
// Merchant Auth — 商家认证 API
// ============================================================
describe('Merchant Auth', () => {
  const mysqlUrl = process.env.DATABASE_URL || '';
  const isTestEnv = mysqlUrl.includes('robot_race_test');

  beforeAll(async () => {
    if (!isTestEnv) {
      console.warn('[WARN] DATABASE_URL does not point to robot_race_test — tests may affect production data!');
    }
    // 先加载 app（需要 app 已 import）
    app = require('../src/index').default;
    await seedTestData();
  });

  afterAll(async () => {
    // 可选：清理种子数据
  });

  describe('POST /api/v1/merchant/auth/login', () => {
    it('logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/login')
        .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('admin');
    });

    it('fails with wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/login')
        .send({ username: TEST_USERNAME, password: 'wrongpass' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(401);
      expect(res.body.message).toMatch(/用户名或密码错误|不正确/);
    });

    it('fails without credentials', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/login')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(400);
    });

    it('fails for non-existent username', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/login')
        .send({ username: 'nonexistent_user_12345', password: 'test123' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(401);
    });
  });

  describe('POST /api/v1/merchant/auth/register', () => {
    it('registers a merchant admin with valid invite code', async () => {
      const username = `${TEST_PREFIX}_REG1`;
      const res = await request(app)
        .post('/api/v1/merchant/auth/register')
        .send({
          username,
          password: TEST_PASSWORD,
          inviteCode: `${TEST_PREFIX}_INVITE`,
          phone: `139${String(Date.now()).slice(-8)}`,
          realName: '新店长',
        });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
    });

    it('fails with short password', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/register')
        .send({
          username: `${TEST_PREFIX}_BADS`,
          password: '12345',
          inviteCode: `${TEST_PREFIX}_INVITE`,
        });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toMatch(/密码/);
    });

    it('fails with invalid invite code', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/register')
        .send({
          username: `${TEST_PREFIX}_BADI`,
          password: TEST_PASSWORD,
          inviteCode: 'INV_CODE_NONEXISTENT_0000',
        });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toMatch(/邀请码无效|不存在/);
    });
  });

  describe('POST /api/v1/merchant/auth/change-password', () => {
    it('changes password with correct old password', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/change-password')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ oldPassword: TEST_PASSWORD, newPassword: 'NewPass_654321' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      // 改回原密码，后续测试可用
      await request(app)
        .post('/api/v1/merchant/auth/change-password')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ oldPassword: 'NewPass_654321', newPassword: TEST_PASSWORD });
    });

    it('fails with wrong old password', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/auth/change-password')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ oldPassword: 'wrongold123', newPassword: 'NewPass_654321' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(401);
    });
  });

  describe('GET /api/v1/merchant/auth/profile', () => {
    it('returns merchant admin profile', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/auth/profile')
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('username');
      expect(res.body.data).toHaveProperty('merchant');
      expect(res.body.data.merchant).toHaveProperty('name');
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/merchant/auth/profile');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(401);
    });

    it('returns 403 with non-merchant role', async () => {
      const playerToken = jwt.sign(
        { userId: 'test-player', openid: 'test', role: 'player' },
        process.env.JWT_SECRET || 'robot-maze-race-jwt-secret-2024',
        { expiresIn: '7d' }
      );
      const res = await request(app)
        .get('/api/v1/merchant/auth/profile')
        .set('Authorization', `Bearer ${playerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(403);
    });
  });

  describe('PUT /api/v1/merchant/auth/profile', () => {
    it('updates admin personal info', async () => {
      const res = await request(app)
        .put('/api/v1/merchant/auth/profile')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ phone: `137${String(Date.now()).slice(-8)}`, realName: '更新店长' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('returns 400 with no fields', async () => {
      const res = await request(app)
        .put('/api/v1/merchant/auth/profile')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(400);
    });

    it('fails without token', async () => {
      const res = await request(app)
        .put('/api/v1/merchant/auth/profile')
        .send({ phone: '13900001111' });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================
// Merchant Coupon — 商家优惠券 API
// ============================================================
describe('Merchant Coupon', () => {
  beforeAll(async () => {
    app = require('../src/index').default;
    if (!testMerchantId) await seedTestData();
  });

  describe('POST /api/v1/merchant/coupon/create', () => {
    it('creates a coupon as draft', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/coupon/create')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          name: `${TEST_PREFIX}_新人优惠券`,
          description: '新人专享立减',
          denominationCents: 500,
          minConsumeCents: 0,
          totalCount: 100,
          validStart: '2026-06-01T00:00:00Z',
          validEnd: '2026-12-31T23:59:59Z',
          couponType: 1,
          maxPerUser: 1,
        });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('id');
      testCouponId = res.body.data.id;
    });

    it('fails without name', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/coupon/create')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ totalCount: 10 });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(400);
    });

    it('fails without token', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/coupon/create')
        .send({ name: 'noauth', totalCount: 10 });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/merchant/coupon/:id/submit-audit', () => {
    it('submits draft coupon for audit', async () => {
      const res = await request(app)
        .post(`/api/v1/merchant/coupon/${testCouponId}/submit-audit`)
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
    });

    it('fails for non-existent coupon', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/coupon/nonexistent_id_0000/submit-audit')
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(404);
    });
  });

  describe('GET /api/v1/merchant/coupon/list', () => {
    it('returns paginated coupon list', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/coupon/list?page=1&pageSize=10')
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.list)).toBe(true);
    });

    it('returns empty list for merchant with no coupons', async () => {
      const otherToken = createMerchantToken({
        merchantAdminId: 'other-mid',
        merchantId: 'other-merchant',
        merchantName: '其他商家',
      });
      const res = await request(app)
        .get('/api/v1/merchant/coupon/list')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.list).toHaveLength(0);
    });
  });

  describe('GET /api/v1/merchant/coupon/detail/:id', () => {
    it('returns coupon detail', async () => {
      const res = await request(app)
        .get(`/api/v1/merchant/coupon/detail/${testCouponId}`)
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toContain(TEST_PREFIX);
    });

    it('returns 404 for unknown coupon', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/coupon/detail/nonexistent_id_0000')
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(404);
    });
  });

  describe('GET /api/v1/merchant/coupon/stats', () => {
    it('returns coupon stats', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/coupon/stats')
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('totalCreated');
      expect(typeof res.body.data.totalCreated).toBe('number');
    });
  });
});

// ============================================================
// Merchant Verify — 商家核销 API
// ============================================================
describe('Merchant Verify', () => {
  beforeAll(async () => {
    app = require('../src/index').default;
    if (!testMerchantId) await seedTestData();

    // 创建一个可用于核销的优惠券（创建→提交审核→审核通过→上架）
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: '172.19.0.2',
      port: 3306,
      user: 'robot_race_test',
      password: 'robot_race_test',
      database: 'robot_race_test',
    });

    try {
      // 直接插入一个已上架的测试优惠券
      testCouponId = `${TEST_PREFIX}_COUPON_VER`;
      testVerifyCode = `${TEST_PREFIX}_CODE_001`;
      await conn.execute(
        `INSERT INTO merchant_coupons (id, merchant_id, name, denomination_cents, total_count, remain_count, 
          coupon_type, max_per_user, audit_status, coupon_status, valid_start, valid_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, 2, 1, '2026-06-01 00:00:00', '2026-12-31 23:59:59', NOW(), NOW())`,
        [testCouponId, testMerchantId, `${TEST_PREFIX}_核销券`, 500, 100, 100]
      );

      // 插入一个已领取的用户优惠券（带核销码）
      const userCouponId = `${TEST_PREFIX}_UC_001`;
      await conn.execute(
        `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, coupon_name, denomination_cents,
          min_consume_cents, coupon_type, verify_code, used, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 0, NOW(), NOW())`,
        [userCouponId, 'test-user', testCouponId, testMerchantId, `${TEST_PREFIX}_核销券`, 500, testVerifyCode]
      );

      console.log(`[Seed] Created verifiable coupon: ${testCouponId}, code: ${testVerifyCode}`);
    } finally {
      await conn.end();
    }
  });

  describe('POST /api/v1/merchant/verify/scan', () => {
    it('verifies a valid coupon code via scan', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/verify/scan')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ verifyCode: testVerifyCode });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toContain('核销成功');
    });

    it('fails without verifyCode', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/verify/scan')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(400);
    });

    it('fails without token', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/verify/scan')
        .send({ verifyCode: testVerifyCode });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/merchant/verify/manual', () => {
    let manualVerifyCode: string;

    beforeAll(async () => {
      // 再建一个可手动核销的
      manualVerifyCode = `${TEST_PREFIX}_CODE_MAN`;
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({
        host: '172.19.0.2',
        port: 3306,
        user: 'robot_race_test',
        password: 'robot_race_test',
        database: 'robot_race_test',
      });
      try {
        await conn.execute(
          `INSERT INTO user_coupons (id, user_id, coupon_id, merchant_id, coupon_name, denomination_cents,
            min_consume_cents, coupon_type, verify_code, used, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, 0, NOW(), NOW())`,
          [`${TEST_PREFIX}_UC_MAN`, 'test-user2', testCouponId, testMerchantId, `${TEST_PREFIX}_核销券M`, 500, manualVerifyCode]
        );
      } finally {
        await conn.end();
      }
    });

    it('verifies a valid coupon code via manual input', async () => {
      const res = await request(app)
        .post('/api/v1/merchant/verify/manual')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ verifyCode: manualVerifyCode });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toContain('核销成功');
    });
  });

  describe('GET /api/v1/merchant/verify/log', () => {
    it('returns paginated verify log', async () => {
      const res = await request(app)
        .get('/api/v1/merchant/verify/log')
        .set('Authorization', `Bearer ${merchantToken}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveProperty('list');
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.list)).toBe(true);
      expect(res.body.data.list.length).toBeGreaterThanOrEqual(1);
    });
  });
});
