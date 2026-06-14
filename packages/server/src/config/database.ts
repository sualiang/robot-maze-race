import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// SQLite 数据库文件的路径
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../../data/robot-maze-race.db');

// 确保 data 目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/** SQLite 数据库单例 */
const db = new Database(DB_PATH);

// 启用 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');
// 开启外键约束
// 关闭外键约束，因为营销配置允许使用 'operator_xxx' 作为全局venue_id（不需要对应 venues 表记录）
db.pragma('foreign_keys = OFF');

/**
 * 将 pg 风格的 $1, $2, ... 占位符转换为 SQLite 风格的 ?
 * 同时返回按顺序排列的参数数组。
 *
 * 所有路由代码使用的 $N 都是严格顺序递增的（1,2,3...），
 * 所以直接替换为 ? 并保持参数顺序即可。
 */
function convertSql(text: string): string {
  return text.replace(/\$\d+/g, '?');
}

/**
 * 展开参数列表以匹配 convertSql 转换后的 ? 数量。
 * SQLite 要求传 ? 数量与参数数组完全一致。
 * 原理：计算 SQL 中 $1, $2 ... 的出现次数，然后按最大引用编号展开参数。
 */
function expandParams(text: string, params: any[]): any[] {
  if (!params || params.length === 0) return [];
  const maxIdx = Math.max(...params.keys()) + 1;
  // 找出传入了有效值的最大索引
  const effectiveMax = params.reduce((max, _, i) => i + 1 > max ? i + 1 : max, 0);
  // 统计每个 $N 在 SQL 中出现的次数
  const counts: number[] = [];
  const regex = /\$(\d+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const idx = parseInt(match[1], 10) - 1;
    counts[idx] = (counts[idx] || 0) + 1;
  }
  // 按 counts 展开参数
  const result: any[] = [];
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i] || 0;
    const val = i < params.length ? params[i] : undefined;
    for (let j = 0; j < count; j++) {
      result.push(val);
    }
  }
  return result;
}

/**
 * 执行查询，返回多行结果。
 *
 * 兼容原 pg query() 接口：
 * - 接受 pg 风格的 $1, $2 ... 占位符（自动转为 SQLite ?）
 * - 返回 T[]（而非 pg 的 Result.rows）
 * - INSERT/UPDATE/DELETE（非SELECT开头）使用 run() 并返回空数组
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  try {
    const sql = convertSql(text);
    const expandedParams = params ? expandParams(text, params) : undefined;
    const stmt = db.prepare(sql);
    const trimmed = sql.trimStart();
    // 非 SELECT 开头的语句使用 run()，SQLite 不允许 all() 用于 INSERT/UPDATE/DELETE
    if (!/^SELECT\b/i.test(trimmed)) {
      const info = expandedParams ? stmt.run(...expandedParams) : stmt.run();
      return [] as T[];
    }
    const rows = expandedParams ? stmt.all(...expandedParams) : stmt.all();
    return (rows || []) as T[];
  } catch (error: any) {
    console.error('[SQLite] query error:', error.message, '\n  SQL:', text.substring(0, 200));
    throw error;
  }
}

/**
 * 执行查询，返回第一行结果或 null。
 *
 * 兼容原 pg queryOne() 接口：
 * - 接受 pg 风格的 $1, $2 ... 占位符
 * - 返回 T | null
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  try {
    const sql = convertSql(text);
    const expandedParams = params ? expandParams(text, params) : undefined;
    const stmt = db.prepare(sql);
    const row = expandedParams ? stmt.get(...expandedParams) : stmt.get();
    return (row as T) ?? null;
  } catch (error: any) {
    console.error('[SQLite] queryOne error:', error.message, '\n  SQL:', text.substring(0, 200));
    throw error;
  }
}

/**
 * 执行写操作（INSERT / UPDATE / DELETE），不返回数据行。
 * 使用 db.run() 替代 stmt.all()，因为 all() 不允许写语句。
 */
export async function execute(text: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  try {
    const sql = convertSql(text);
    const expandedParams = params ? expandParams(text, params) : undefined;
    const stmt = db.prepare(sql);
    const result = expandedParams ? stmt.run(...expandedParams) : stmt.run();
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  } catch (error: any) {
    console.error('[SQLite] execute error:', error.message, '\n  SQL:', text.substring(0, 200));
    throw error;
  }
}

/**
 * 执行事务。
 *
 * 兼容原 pg transaction() 接口。
 * 注意：与原 pg 接口不同，SQLite 版 fn 接收的是一个辅助对象
 * { query, queryOne }（不会阻止路由中使用原 pg Pool API）。
 * 但实际路由文件中并未使用 transaction()，此处保留兼容。
 */
export async function transaction<T>(
  fn: (executor: typeof db) => T
): Promise<T> {
  const txn = db.transaction(fn);
  return txn(db) as T;
}

/**
 * 从 SQL 文件读取并执行建表语句。
 * 自动跳过 SQLite 不支持的语法（COMMENT, CREATE EXTENSION 等）。
 */
export function initSchema(): void {
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('[SQLite] schema.sql not found at', schemaPath);
    return;
  }

  const raw = fs.readFileSync(schemaPath, 'utf-8');

  // 清洗 PostgreSQL 专属语法（注释行中的关键字不影响）
  // 先去掉所有注释行，避免正则匹配到注释中的关键字
  const lines = raw.split('\n').filter(l => !l.trim().startsWith('--'));
  let sql = lines.join('\n');
  sql = sql
    // 去掉 CREATE EXTENSION
    .replace(/CREATE\s+EXTENSION\s+[^;]+;/gi, '')
    // 去掉 COMMENT（行尾的 COMMENT 'xxx' 和单独的 COMMENT ON ...）
    .replace(/\s+COMMENT\s+'[^']*'/gi, '')
    .replace(/COMMENT\s+ON\s+[^;]+;/gi, '')
    // SERIAL → INTEGER
    .replace(/\bSERIAL\b/gi, 'INTEGER');

  // 分割并逐个执行 SQL 语句
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    // 跳过纯注释块
    if (stmt.startsWith('/*') || stmt === '') continue;
    try {
      db.exec(stmt);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        // ignore
      } else {
        console.warn('[SQLite] schema warning:', error.message);
        console.warn('  statement:', stmt.substring(0, 120));
      }
    }
  }

  console.log('[SQLite] Schema initialized from', schemaPath);

  // 插入默认系统配置（仅在首次运行时生效）
  const defaults: [string, string, string][] = [
    ['help_required_count', '5', '助力所需人数'],
    ['expand_coupon_valid_days', '15', '膨胀券有效期(天)'],
    ['help_valid_days', '7', '助力活动有效期(天)'],
    ['help_initiator_reward_count', '1', '发起者助力完成奖励次数'],
    ['expand_coupon_helper_gift_count', '1', '助力者获得膨胀券次数'],
  ];
  for (const [key, value, desc] of defaults) {
    try {
      db.prepare(
        `INSERT OR IGNORE INTO system_config (id, key, value, description) VALUES (?, ?, ?, ?)`
      ).run(uuidv4(), key, value, desc);
    } catch {
      // ignore — 表不存在或已存在
    }
  }

  // 数据库迁移：operators 表新增字段（如列不存在则添加）
  try {
    const opColumns = ['operator_username', 'operator_password_hash', 'password_change_required'];
    for (const col of opColumns) {
      db.exec(`ALTER TABLE operators ADD COLUMN ${col}`);
    }
  } catch {
    // ignore — 列已存在
  }

  // 迁移：admin_users 表新增 operator_id 字段（如列不存在则添加）
  try {
    db.exec('ALTER TABLE admin_users ADD COLUMN operator_id TEXT REFERENCES operators(id)');
  } catch {
    // ignore — 列已存在
  }

  // 迁移：referees 表新增 name 字段（如列不存在则添加）
  try {
    db.exec('ALTER TABLE referees ADD COLUMN name');
  } catch {
    // ignore — 列已存在
  }

  // 迁移：admin_users 表新增 first_login 字段
  try {
    db.exec('ALTER TABLE admin_users ADD COLUMN first_login INTEGER DEFAULT 0');
  } catch {
    // ignore — 列已存在
  }

  // 迁移：users 表新增 gender/age/subscribe_venue_id 字段（如列不存在则添加）
  try {
    db.exec('ALTER TABLE users ADD COLUMN gender VARCHAR(10) DEFAULT \'\'');
  } catch {
    // ignore — 列已存在
  }
  try {
    db.exec('ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 0');
  } catch {
    // ignore — 列已存在
  }
  try {
    db.exec('ALTER TABLE users ADD COLUMN subscribe_venue_id VARCHAR(128) REFERENCES venues(id)');
  } catch {
    // ignore — 列已存在
  }

  // 迁移：users 表新增 password 字段（如列不存在则添加）
  try {
    db.exec('ALTER TABLE users ADD COLUMN password VARCHAR(128) DEFAULT \'\'');
  } catch {
    // ignore — 列已存在
  }

  // 迁移：users 表新增 first_login 字段（如列不存在则添加）
  try {
    db.exec('ALTER TABLE users ADD COLUMN first_login INTEGER DEFAULT 0');
  } catch {
    // ignore — 列已存在
  }

  // 禁止旧 admin 账号跳出首次登录设置（已存在的管理员不触发 first_login）
  try {
    db.exec("UPDATE admin_users SET first_login = 0 WHERE first_login IS NULL");
  } catch {
    // ignore
  }

  // 插入默认超级管理员（仅首次运行时生效）
  try {
    const existingAdmin = db.prepare("SELECT id FROM admin_users WHERE username = ?").get('admin');
    if (!existingAdmin) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.prepare(
        `INSERT INTO admin_users (id, username, password, nickname, role_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('admin-id-001', 'admin', hashedPassword, '超级管理员', 'role-super-admin', 'active');
      console.log('[SQLite] Default admin user created (admin/admin123)');
    }
  } catch {
    // ignore — 表不存在或已存在
  }
}

// 生成符合密码规则的随机密码：至少8位，含大写、小写字母和数字
function generateSecurePassword(length: number = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;

  // 确保每种字符至少出现一次
  let pw = upper[Math.floor(Math.random() * upper.length)] +
           lower[Math.floor(Math.random() * lower.length)] +
           digits[Math.floor(Math.random() * digits.length)];

  // 补足剩余长度
  for (let i = pw.length; i < length; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }

  // 打乱顺序
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export { generateSecurePassword };

export default db;
