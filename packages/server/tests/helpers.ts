import jwt from 'jsonwebtoken';
import { config } from '../src/config';

const JWT_SECRET = config.jwt.secret;

/**
 * Seed essential users into the database needed by tests
 */
export function seedUsers(db: any): void {
  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, openid, nickname, role) VALUES (?, ?, ?, ?)`
  );
  insertUser.run('test-admin-id', 'test_openid_admin', '管理员', 'admin');
  insertUser.run('test-player-id', 'test_openid_player', '玩家张三', 'player');
  insertUser.run('test-operator-id', 'test_openid_operator', '运营商', 'operator');
  insertUser.run('test-referee-id', 'test_openid_referee', '裁判李四', 'referee');
}

/**
 * Create a JWT token for a player user
 */
export function createPlayerToken(userId = 'test-player-id'): string {
  return jwt.sign(
    { userId, openid: 'test_openid_player', role: 'player' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Create a JWT token for an admin user
 */
export function createAdminToken(userId = 'test-admin-id'): string {
  return jwt.sign(
    { userId, openid: 'test_openid_admin', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Create a JWT token for an operator user
 */
export function createOperatorToken(userId = 'test-operator-id'): string {
  return jwt.sign(
    { userId, openid: 'test_openid_operator', role: 'operator' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Create a JWT token for a referee user
 */
export function createRefereeToken(userId = 'test-referee-id'): string {
  return jwt.sign(
    { userId, openid: 'test_openid_referee', role: 'referee' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Re-initialize the database schema (clean slate)
 */
export function resetDatabase(db?: any): void {
  const d = db || require('../src/config/database').default;
  const tables = [
    'marketing_config',
    'expand_coupons',
    'attendance',
    'helps',
    'race_results',
    'checkins',
    'payments',
    'settlements',
    'orders',
    'race_packages',
    'referees',
    'venues',
    'operators',
    'system_config',
    'users',
  ];
  for (const table of tables) {
    try {
      d.exec(`DELETE FROM "${table}"`);
    } catch {
      // ignore
    }
  }

  // 重建 helps 表（使 schema.sql 中的新字段生效）
  // 因为 CREATE TABLE IF NOT EXISTS 不会更新已有表的列
  try { d.exec(`DROP TABLE IF EXISTS helps`); } catch {}
  d.exec(`CREATE TABLE IF NOT EXISTS helps (
    id TEXT PRIMARY KEY,
    initiator_id TEXT NOT NULL REFERENCES users(id),
    helper_id TEXT REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'initiated',
    target_package_id TEXT,
    required_help_count INTEGER NOT NULL DEFAULT 5,
    current_help_count INTEGER NOT NULL DEFAULT 0,
    helper_device_id VARCHAR(128),
    coupon_amount_cents INTEGER DEFAULT 0,
    initiated_at TEXT DEFAULT (datetime('now')),
    helped_at TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // 重建 expand_coupons 表
  try { d.exec(`DROP TABLE IF EXISTS expand_coupons`); } catch {}
  d.exec(`CREATE TABLE IF NOT EXISTS expand_coupons (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    help_id TEXT REFERENCES helps(id),
    amount_cents INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    used_order_id TEXT REFERENCES orders(id),
    valid_from TEXT DEFAULT (datetime('now')),
    valid_until TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // 重建 idempotency_keys 表
  try { d.exec(`DROP TABLE IF EXISTS idempotency_keys`); } catch {}
  d.exec(`CREATE TABLE IF NOT EXISTS idempotency_keys (
    id TEXT PRIMARY KEY,
    key VARCHAR(128) UNIQUE NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // 重建 orders 表（discount_cents 列）
  try { d.exec(`DROP TABLE IF EXISTS orders`); } catch {}
  d.exec(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_no VARCHAR(64) UNIQUE NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    package_id TEXT NOT NULL REFERENCES race_packages(id),
    amount_cents INTEGER NOT NULL,
    discount_cents INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(20),
    paid_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // 重建 settlements 表
  try { d.exec(`DROP TABLE IF EXISTS settlements`); } catch {}
  d.exec(`CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES orders(id),
    operator_id TEXT NOT NULL REFERENCES users(id),
    amount_cents INTEGER NOT NULL,
    commission_cents INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    settled_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // 重建 race_packages 表
  try { d.exec(`DROP TABLE IF EXISTS race_packages`); } catch {}
  d.exec(`CREATE TABLE IF NOT EXISTS race_packages (
    id TEXT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    race_count INTEGER NOT NULL DEFAULT 1,
    valid_days INTEGER DEFAULT 365,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

/**
 * Seed the database with users and return db instance
 */
export function setupTestDatabase(db?: any): any {
  const d = db || require('../src/config/database').default;
  resetDatabase(d);
  seedUsers(d);
  return d;
}
