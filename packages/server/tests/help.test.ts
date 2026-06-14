import request from 'supertest';
import app from '../src/index';
import { resetDatabase, createPlayerToken, createAdminToken, setupTestDatabase } from './helpers';

/**
 * 好友助力功能 — 完整 E2E 测试
 *
 * 覆盖规则：
 *   R1 — 须已购买参赛包
 *   R2 — 须剩余参赛次数为 0
 *   R3/R7 — 不能给自己助力
 *   R4 — 须登录
 *   R5 — 同设备最多助力 3 次
 *   R6 — 同用户最多为 1 人助力
 *   R8 — 助力人数从配置读取
 *   R10 — 完成后发膨胀券
 */

describe('👥 好友助力功能 E2E 测试', () => {
  let db: any;

  beforeAll(() => {
    db = require('../src/config/database').default;
    resetDatabase(db);

    // 插入测试数据
    // 先插入 venues（checkins 有外键依赖）
    db.prepare(
      `INSERT OR IGNORE INTO venues (id, name, status) VALUES (?, ?, ?)`
    ).run('venue_test', '测试赛场', 'open');

    // 插入 race_packages（orders 有外键依赖）
    db.prepare(
      `INSERT OR IGNORE INTO race_packages (id, name, price_cents, race_count, status) VALUES (?, ?, ?, ?, ?)`
    ).run('test_pkg_01', '测试包', 2900, 1, 'active');
    db.prepare(
      `INSERT OR IGNORE INTO race_packages (id, name, price_cents, race_count, status) VALUES (?, ?, ?, ?, ?)`
    ).run('test_pkg_02', '2次测试包', 5000, 2, 'active');

    // 玩家1：有订单，剩余 0 次（买了1次，用了1次）
    db.prepare(
      `INSERT OR IGNORE INTO users (id, openid, nickname, role, race_count) VALUES (?, ?, ?, ?, ?)`
    ).run('test-p1', 'openid_p1', '玩家1', 'player', 0);
    db.prepare(
      `INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents, status, paid_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', datetime('now'), datetime('now'))`
    ).run('order_p1_001', 'ORD_P1_001', 'test-p1', 'test_pkg_01', 2900);
    db.prepare(
      `INSERT OR IGNORE INTO checkins (id, user_id, venue_id, package_id, queue_number, status, created_at) VALUES (?, ?, ?, ?, ?, 'completed', datetime('now'))`
    ).run('checkin_p1_001', 'test-p1', 'venue_test', 'test_pkg_01', 1);

    // 玩家2：有订单，剩余 0 次（买了1次，用了1次）
    db.prepare(
      `INSERT OR IGNORE INTO users (id, openid, nickname, role, race_count) VALUES (?, ?, ?, ?, ?)`
    ).run('test-p2', 'openid_p2', '玩家2', 'player', 0);
    db.prepare(
      `INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents, status, paid_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', datetime('now'), datetime('now'))`
    ).run('order_p2_001', 'ORD_P2_001', 'test-p2', 'test_pkg_01', 2900);
    db.prepare(
      `INSERT OR IGNORE INTO checkins (id, user_id, venue_id, package_id, queue_number, status, created_at) VALUES (?, ?, ?, ?, ?, 'completed', datetime('now'))`
    ).run('checkin_p2_001', 'test-p2', 'venue_test', 'test_pkg_01', 1);

    // 未购买用户
    db.prepare(
      `INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`
    ).run('test-no-order', 'openid_no_order', '没买过', 'player');
  });

  const tk1 = createPlayerToken('test-p1');
  const tk2 = createPlayerToken('test-p2');

  // ================================================================
  // R1/R2/R4 — 发起资格校验
  // ================================================================
  describe('R1/R2/R4 — 发起资格校验', () => {
    it('R4: 未登录创建助力应返回 401', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/create')
        .send({})
        .expect(401);
      expect(res.body.code).toBe(401);
    });

    it('R1: 未购买参赛包的用户不能发起助力', async () => {
      const tk = createPlayerToken('test-no-order');
      const res = await request(app)
        .post('/api/v1/player/help/create')
        .set('Authorization', `Bearer ${tk}`)
        .send({})
        .expect(200);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toContain('购买参赛包');
    });

    it('R2: 还有参赛次数的用户不能发起助力', async () => {
      // 给玩家2再买一个2次包，这样剩余次数 > 0
      db.prepare(
        `INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents, status, paid_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', datetime('now'), datetime('now'))`
      ).run('order_p2_extra', 'ORD_P2_EXTRA', 'test-p2', 'test_pkg_02', 5000);

      const res = await request(app)
        .post('/api/v1/player/help/create')
        .set('Authorization', `Bearer ${tk2}`)
        .send({})
        .expect(200);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toMatch(/剩余|还有.*参赛次数/);
    });
  });

  // ================================================================
  // 正常创建 + 查询
  // ================================================================
  describe('创建助力活动并查询', () => {
    let helpId: string;

    beforeAll(async () => {
      // 玩家1剩余0次，可以创建
      const res = await request(app)
        .post('/api/v1/player/help/create')
        .set('Authorization', `Bearer ${tk1}`)
        .send({})
        .expect(200);
      expect(res.body.code).toBe(0);
      helpId = res.body.data.id;
    });

    it('创建成功应返回活动ID和完整字段', async () => {
      expect(helpId).toBeDefined();
      expect(typeof helpId).toBe('string');
    });

    it('查询助力详情应返回完整数据', async () => {
      const res = await request(app)
        .get('/api/v1/player/help/detail')
        .query({ helpId })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.activity.id).toBe(helpId);
      expect(res.body.data.activity.status).toBe('active');
      expect(res.body.data.activity.requiredHelpCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.activity.currentHelpCount).toBe(0);
      expect(res.body.data.canHelp).toBe(true);
    });

    it('不存在的活动返回 404', async () => {
      const res = await request(app)
        .get('/api/v1/player/help/detail')
        .query({ helpId: 'help-nonexistent' })
        .expect(200);
      expect(res.body.code).toBe(404);
    });
  });

  // ================================================================
  // R3/R7 — 不能给自己助力
  // ================================================================
  describe('R3/R7 — 不能给自己助力', () => {
    // 先完成第一个帮助活动，让玩家1可以创建一个新的
    beforeAll(async () => {
      const origHelpers = db.prepare('SELECT id FROM helps WHERE status = \'active\' AND initiator_id = ?').all('test-p1');
      for (const h of origHelpers) {
        db.prepare('UPDATE helps SET status = \'expired\' WHERE id = ?').run(h.id);
      }
    });

    let myHelpId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/player/help/create')
        .set('Authorization', `Bearer ${tk1}`)
        .send({})
        .expect(200);
      expect(res.body.code).toBe(0);
      myHelpId = res.body.data.id;
    });

    it('给自己助力应被拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${tk1}`)
        .send({ helpId: myHelpId })
        .expect(200);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toContain('不能为自己');
    });
  });

  // ================================================================
  // R6 — 同一用户最多为 1 人助力
  // ================================================================
  describe('R6 — 同一用户最多为 1 人助力', () => {
    // 玩家3：有订单，0剩余
    beforeAll(() => {
      db.prepare(
        `INSERT OR IGNORE INTO users (id, openid, nickname, role, race_count) VALUES (?, ?, ?, ?, ?)`
      ).run('test-p3', 'openid_p3', '玩家3', 'player', 0);
      db.prepare(
        `INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents, status, paid_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', datetime('now'), datetime('now'))`
      ).run('order_p3_001', 'ORD_P3_001', 'test-p3', 'test_pkg_01', 2900);
      db.prepare(
        `INSERT OR IGNORE INTO checkins (id, user_id, venue_id, package_id, queue_number, status, created_at) VALUES (?, ?, ?, ?, ?, 'completed', datetime('now'))`
      ).run('checkin_p3_001', 'test-p3', 'venue_test', 'test_pkg_01', 1);
    });

    const tk3 = createPlayerToken('test-p3');
    let firstHelpId: string;
    let secondHelpId: string;

    beforeAll(async () => {
      // 清空玩家1之前创建的活动（R3/R7 创建的）
      db.prepare('UPDATE helps SET status = \'expired\' WHERE initiator_id = ? AND status = \'active\'').run('test-p1');

      // 玩家1创建一个活动
      const r1 = await request(app)
        .post('/api/v1/player/help/create')
        .set('Authorization', `Bearer ${tk1}`)
        .send({})
        .expect(200);
      expect(r1.body.code).toBe(0);
      firstHelpId = r1.body.data.id;

      // 玩家3创建一个活动
      const r2 = await request(app)
        .post('/api/v1/player/help/create')
        .set('Authorization', `Bearer ${tk3}`)
        .send({})
        .expect(200);
      expect(r2.body.code).toBe(0);
      secondHelpId = r2.body.data.id;
    });

    it('第一次助力（不同发起者）应该成功', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${tk2}`)
        .send({ helpId: firstHelpId })
        .expect(200);
      expect(res.body.code).toBe(0);
    });

    it('第二次助力（另一个发起者）应被拒绝', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${tk2}`)
        .send({ helpId: secondHelpId })
        .expect(200);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toContain('已经为其他好友');
    });
  });

  // ================================================================
  // R5 — 同设备最多助力 3 次
  // ================================================================
  describe('R5 — 同设备最多助力 3 次（通过 deviceId）', () => {
    const deviceId = 'test_device_r5';
    const helpIds: string[] = [];

    // 创建4个发起者（每个0剩余）
    beforeAll(async () => {
      const initiatorIds = ['init-r5-1', 'init-r5-2', 'init-r5-3', 'init-r5-4'];
      for (const uid of initiatorIds) {
        db.prepare(
          `INSERT OR IGNORE INTO users (id, openid, nickname, role, race_count) VALUES (?, ?, ?, ?, ?)`
        ).run(uid, `openid_${uid}`, `发起者${uid}`, 'player', 0);
        db.prepare(
          `INSERT OR IGNORE INTO orders (id, order_no, user_id, package_id, amount_cents, status, paid_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', datetime('now'), datetime('now'))`
        ).run(`order_${uid}_001`, `ORD_${uid}_001`, uid, 'test_pkg_01', 2900);
        db.prepare(
          `INSERT OR IGNORE INTO checkins (id, user_id, venue_id, package_id, queue_number, status, created_at) VALUES (?, ?, ?, ?, ?, 'completed', datetime('now'))`
        ).run(`checkin_${uid}_001`, uid, 'venue_test', 'test_pkg_01', 1);

        const tk = createPlayerToken(uid);
        const r = await request(app)
          .post('/api/v1/player/help/create')
          .set('Authorization', `Bearer ${tk}`)
          .send({})
          .expect(200);
        expect(r.body.code).toBe(0);
        helpIds.push(r.body.data.id);
      }
    });

    // 4个不同的助力用户
    const helperIds = ['help-r5-1', 'help-r5-2', 'help-r5-3', 'help-r5-4'];
    const helperTokens: string[] = [];

    beforeAll(async () => {
      for (const uid of helperIds) {
        db.prepare(
          `INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`
        ).run(uid, `openid_${uid}`, `设备测试${uid}`, 'player');
        helperTokens.push(createPlayerToken(uid));
      }
    });

    it('设备第1次助力应成功', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${helperTokens[0]}`)
        .send({ helpId: helpIds[0], deviceId })
        .expect(200);
      expect(res.body.code).toBe(0);
    });

    it('设备第2次助力应成功', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${helperTokens[1]}`)
        .send({ helpId: helpIds[1], deviceId })
        .expect(200);
      expect(res.body.code).toBe(0);
    });

    it('设备第3次助力应成功', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${helperTokens[2]}`)
        .send({ helpId: helpIds[2], deviceId })
        .expect(200);
      expect(res.body.code).toBe(0);
    });

    it('设备第4次助力应被拒绝（已达3次上限）', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${helperTokens[3]}`)
        .send({ helpId: helpIds[3], deviceId })
        .expect(200);
      expect(res.body.code).toBe(400);
      expect(res.body.message).toContain('上限');
    });
  });

  // ================================================================
  // 全流程：凑满 + 完成 + 超额 + 膨胀券
  // ================================================================
  describe('助力全流程 — 凑满 + 完成 + 超额 + 膨胀券', () => {
    let helpId: string;

    beforeAll(async () => {
      // 先过期玩家1之前的活动的（R6 创建的）
      db.prepare('UPDATE helps SET status = \'expired\' WHERE initiator_id = ? AND status = \'active\'').run('test-p1');

      // 玩家1再创建一个新活动
      const res = await request(app)
        .post('/api/v1/player/help/create')
        .set('Authorization', `Bearer ${tk1}`)
        .send({})
        .expect(200);
      expect(res.body.code).toBe(0);
      helpId = res.body.data.id;

      // 把 required_help_count 改成3（方便测试，默认是5）
      db.prepare(`UPDATE helps SET required_help_count = 3 WHERE id = ?`).run(helpId);
    });

    // 动态创建4个助力者
    const helperCount = 4;
    for (let i = 1; i <= helperCount; i++) {
      const uid = `help-fullflow-${i}`;
      const tk = createPlayerToken(uid);

      // 单独 beforeAll 插入用户
      beforeAll(async () => {
        db.prepare(
          `INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`
        ).run(uid, `openid_${uid}`, `全流程助力${i}`, 'player');
      });

      if (i <= 3) {
        it(`第${i}次助力应成功${i === 3 ? '（助力完成）' : ''}`, async () => {
          const res = await request(app)
            .post('/api/v1/player/help/assist')
            .set('Authorization', `Bearer ${tk}`)
            .send({ helpId })
            .expect(200);

          expect(res.body.code).toBe(0);
          if (i === 3) {
            expect(res.body.data.isComplete).toBe(true);
          } else {
            expect(res.body.data.isComplete).toBe(false);
          }
        });
      } else {
        it(`第${i}次助力（超额）应被拒绝`, async () => {
          const res = await request(app)
            .post('/api/v1/player/help/assist')
            .set('Authorization', `Bearer ${tk}`)
            .send({ helpId })
            .expect(200);

          expect(res.body.code).toBe(400);
          expect(res.body.message).toContain('已满额');
        });
      }
    }

    it('详情接口应反映 completed 状态', async () => {
      const res = await request(app)
        .get('/api/v1/player/help/detail')
        .query({ helpId })
        .expect(200);

      expect(res.body.data.activity.status).toBe('completed');
      expect(res.body.data.canHelp).toBe(false);
    });

    it('R10: 膨胀券应已发放给发起者', async () => {
      const row = db.prepare(
        `SELECT COUNT(*) as cnt FROM expand_coupons WHERE user_id = ? AND help_id = ?`
      ).get('test-p1', helpId);
      expect((row as any).cnt).toBeGreaterThanOrEqual(1);
    });

    it('R10: 膨胀券应已发放给最后一位助力者', async () => {
      const row = db.prepare(
        `SELECT COUNT(*) as cnt FROM expand_coupons WHERE user_id = ? AND help_id = ?`
      ).get('help-fullflow-3', helpId);
      // 最后一位助力者（第3次助力）trigger了完成，应该也获得膨胀券
      expect((row as any).cnt).toBeGreaterThanOrEqual(1);
    });
  });

  // ================================================================
  // 额外：重复助力 / 不存在的活动
  // ================================================================
  describe('异常输入处理', () => {
    it('助力不存在的活动应返回 404', async () => {
      const res = await request(app)
        .post('/api/v1/player/help/assist')
        .set('Authorization', `Bearer ${tk1}`)
        .send({ helpId: 'help_does_not_exist' })
        .expect(200);
      expect(res.body.code).toBe(404);
    });
  });
});
