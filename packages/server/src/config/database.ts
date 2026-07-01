import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// MySQL 数据库连接 URL（格式：mysql://user:pass@host:port/db）
const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:root@localhost:3306/robot_maze_race';

// 从 DATABASE_URL 解析连接信息
function parseDatabaseUrl(url: string): mysql.PoolOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '3306', 10),
    user: parsed.username || 'root',
    password: parsed.password || '',
    database: parsed.pathname.replace(/^\//, '') || 'robot_maze_race',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_MAX || '20', 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    timezone: '+08:00',
  };
}

/** MySQL 连接池单例 */
let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    const options = parseDatabaseUrl(DATABASE_URL);
    pool = mysql.createPool(options);
    console.log('[MySQL] Connection pool created:', options.host + ':' + options.port + '/' + options.database);
  }
  return pool;
}

/**
 * 将 pg 风格的 $1, $2, ... 占位符转换为 ? 占位符。
 * MySQL 原生支持 ? 占位符，因此仅需替换占位符序号。
 *
 * 同时返回按顺序排列的参数数组。
 */
/**
 * 将 pg 风格的 $1, $2, ... 占位符转换为 ? 占位符。
 * 使用字符串构造 RegExp 避免正则字面量中 \=\$ 被 JS 引擎解释为行尾锚点。
 */
function convertSql(text: string): string {
  return text.replace(new RegExp('\\$\\d+', 'g'), '?');
}

/**
 * 展开参数列表以匹配 convertSql 转换后的 ? 数量。
 * 原理：计算 SQL 中 $1, $2 ... 的出现次数，然后按最大引用编号展开参数。
 * 保留此逻辑，因为有些 route 中 $N 不是严格的连续递增。
 */
function expandParams(text: string, params: any[]): any[] {
  if (!params || params.length === 0) return [];
  // 如果 SQL 中有 $N 占位符，按 $N 出现次数展开
  // 注意：\$ 在正则字面量中要写成 \$（避开行尾锚点）
  // 用 [$] 字符类匹配美元符，避免正则字面量中 \=\$ 被解析为行尾锚点
  const dollarRegex = /[$](\d+)/g;
  let hasDollar = false;
  const counts: number[] = [];
  let match;
  while ((match = dollarRegex.exec(text)) !== null) {
    hasDollar = true;
    const idx = parseInt(match[1], 10) - 1;
    counts[idx] = (counts[idx] || 0) + 1;
  }
  if (hasDollar) {
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
  // 没有 $N 占位符（只有 ?），原样返回 params
  return params;
}

/**
 * 执行查询，返回多行结果。
 *
 * 兼容原 pg query() 接口：
 * - 接受 pg 风格的 $1, $2 ... 占位符（自动转为 MySQL ?）
 * - 返回 T[]（而非 pg 的 Result.rows）
 * - INSERT/UPDATE/DELETE（非SELECT开头）使用 execute() 并返回空数组
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  try {
    const sql = convertSql(text);
    const expandedParams = params ? expandParams(text, params) : undefined;
    const conn = getPool();
    const trimmed = sql.trimStart();
    // 非 SELECT 开头的语句使用 conn.query() 返回空数组
    // 注意：mysql2 的 execute() 对 LIMIT ? OFFSET ? 等语法存在限制，统一使用 query()
    if (!/^SELECT\b/i.test(trimmed)) {
      await conn.query(sql, expandedParams || []);
      return [] as T[];
    }
    const [rows] = await conn.query<any[]>(sql, expandedParams || []);
    return (rows || []) as T[];
  } catch (error: any) {
    console.error('[MySQL] query error:', error.message, '\n  SQL:', text.substring(0, 200));
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
    const conn = getPool();
    // 使用 query() 避免 execute() 在 LIMIT 参数化时的限制
    const [rows] = await conn.query<any[]>(sql, expandedParams || []);
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return (row as T | null) ?? null;
  } catch (error: any) {
    console.error('[MySQL] queryOne error:', error.message, '\n  SQL:', text.substring(0, 200));
    throw error;
  }
}

/**
 * 执行写操作（INSERT / UPDATE / DELETE），不返回数据行。
 */
export async function execute(text: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  try {
    const sql = convertSql(text);
    const expandedParams = params ? expandParams(text, params) : undefined;
    const conn = getPool();
    // 使用 query() 避免 execute() 在 LIMIT 参数化时的限制
    const [result] = await conn.query<any>(sql, expandedParams || []);
    return {
      changes: result.affectedRows || 0,
      lastInsertRowid: result.insertId || 0,
    };
  } catch (error: any) {
    console.error('[MySQL] execute error:', error.message, '\n  SQL:', text.substring(0, 200));
    throw error;
  }
}

/**
 * 执行事务。
 *
 * 兼容原 transaction() 接口。
 * 从连接池获取一个连接，在此连接上执行事务。
 */
export async function transaction<T>(
  fn: (executor: any) => T
): Promise<T> {
  const conn = getPool();
  const connInstance = await conn.getConnection();
  try {
    await connInstance.beginTransaction();
    // 构造一个辅助对象，提供执行事务内查询的能力
    // 事务内统一使用 query() 避免 execute() 在 LIMIT 参数化时的限制
    const executor = {
      query: async (text: string, params?: any[]) => {
        const sql = convertSql(text);
        const expandedParams = params ? expandParams(text, params) : undefined;
        const [rows] = await connInstance.query<any[]>(sql, expandedParams || []);
        return rows as any[];
      },
      queryOne: async (text: string, params?: any[]) => {
        const sql = convertSql(text);
        const expandedParams = params ? expandParams(text, params) : undefined;
        const [rows] = await connInstance.query<any[]>(sql, expandedParams || []);
        return (Array.isArray(rows) && rows.length > 0 ? rows[0] : null) as any;
      },
      execute: async (text: string, params?: any[]) => {
        const sql = convertSql(text);
        const expandedParams = params ? expandParams(text, params) : undefined;
        const [result] = await connInstance.query<any>(sql, expandedParams || []);
        return { changes: result.affectedRows || 0, lastInsertRowid: result.insertId || 0 };
      },
    };
    const result = await fn(executor);
    await connInstance.commit();
    return result;
  } catch (error) {
    await connInstance.rollback();
    throw error;
  } finally {
    connInstance.release();
  }
}

/**
 * 从 SQL 文件读取并执行建表语句。
 */
export async function initSchema(): Promise<void> {
  const schemaPath = path.join(__dirname, '../db/schema.mysql.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('[MySQL] schema.mysql.sql not found at', schemaPath);
    return;
  }

  const raw = fs.readFileSync(schemaPath, 'utf-8');

  // 去掉注释行
  const lines = raw.split('\n').filter(l => !l.trim().startsWith('--'));
  const sql = lines.join('\n');

  // 分割并逐个执行 SQL 语句
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const conn = getPool();
  for (const stmt of statements) {
    if (stmt.startsWith('/*') || stmt === '') continue;
    try {
      await conn.execute(stmt);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        // ignore
      } else {
        console.warn('[MySQL] schema warning:', error.message);
        console.warn('  statement:', stmt.substring(0, 120));
      }
    }
  }

  console.log('[MySQL] Schema initialized from', schemaPath);

  // 插入默认系统配置（仅在首次运行时生效）
  const defaults: [string, string, string][] = [
    ['help_required_count', '5', '助力所需人数'],
    ['help_valid_days', '7', '助力活动有效期(天)'],
    ['help_initiator_reward_count', '1', '发起者助力完成奖励次数'],
  ];
  for (const [key, value, desc] of defaults) {
    try {
      await conn.execute(
        `INSERT IGNORE INTO system_config (id, \`key\`, value, description) VALUES (?, ?, ?, ?)`,
        [uuidv4(), key, value, desc]
      );
    } catch {
      // ignore — 表不存在或已存在
    }
  }

  // Database migrations: Add columns via ALTER TABLE IF NOT EXISTS pattern
  // MySQL doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS natively,
  // so we use try/catch and check for "Duplicate column" errors.

  // operators 表新增字段
  const opColumns = ['operator_username', 'operator_password_hash', 'password_change_required'];
  for (const col of opColumns) {
    try {
      // First check if column exists
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'operators' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, col]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE operators ADD COLUMN \`${col}\` VARCHAR(256)`);
      }
    } catch {
      // ignore
    }
  }

  // admin_users 表新增 operator_id 字段
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'operator_id'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE admin_users ADD COLUMN operator_id VARCHAR(36)');
    }
  } catch { /* ignore */ }

  // referees 表新增 name 字段
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'referees' AND COLUMN_NAME = 'name'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE referees ADD COLUMN name VARCHAR(100)');
    }
  } catch { /* ignore */ }

  // admin_users 表新增 first_login 字段
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'first_login'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE admin_users ADD COLUMN first_login INT DEFAULT 0');
    }
  } catch { /* ignore */ }

  // users 表新增字段
  const userNewCols = [
    ['gender', "VARCHAR(10) DEFAULT ''"],
    ['age', 'INT DEFAULT 0'],
    ['subscribe_venue_id', 'VARCHAR(128)'],
    ['password', "VARCHAR(128) DEFAULT ''"],
    ['first_login', 'INT DEFAULT 0'],
  ];
  for (const [colName, colDef] of userNewCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, colName]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE users ADD COLUMN \`${colName}\` ${colDef}`);
      }
    } catch { /* ignore */ }
  }

  // 禁止旧 admin 账号跳出首次登录设置
  try {
    await conn.execute("UPDATE admin_users SET first_login = 0 WHERE first_login IS NULL");
  } catch { /* ignore */ }

  // help_helpers 表
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS help_helpers (
      id VARCHAR(36) PRIMARY KEY,
      help_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      device_id VARCHAR(128),
      helped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (help_id) REFERENCES helps(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_help_helpers_help ON help_helpers(help_id)');
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_help_helpers_user ON help_helpers(user_id)');
  } catch { /* ignore */ }

  // ============================================
  // V2.0 迁移：加载 schema_v2.sql 内容（已合并到 schema.mysql.sql）
  // MySQL 版 schema_v2 内容已合并到 schema.mysql.sql 中
  // ============================================

  // V2.0 列迁移
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'level'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE users ADD COLUMN level INT NOT NULL DEFAULT 1');
      await conn.execute('ALTER TABLE users ADD COLUMN exp INT NOT NULL DEFAULT 0');
      await conn.execute('ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0');
    }
  } catch { /* ignore */ }

  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'race_results' AND COLUMN_NAME = 'race_type'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE race_results ADD COLUMN race_type INT NOT NULL DEFAULT 1');
    }
  } catch { /* ignore */ }

  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'race_packages' AND COLUMN_NAME = 'season_id'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE race_packages ADD COLUMN season_id INT');
    }
  } catch { /* ignore */ }

  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'register_coupon_granted'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE users ADD COLUMN register_coupon_granted INT NOT NULL DEFAULT 0');
    }
  } catch { /* ignore */ }

  // V2.0 默认赛季配置项 + 段位/奖励配置
  const defaultSeasonConfigs: [string, string, string][] = [
    ['season_level_exp_1', '0', '青铜选手（Lv1）所需经验'],
    ['season_level_exp_2', '100', '白银选手（Lv2）所需经验'],
    ['season_level_exp_3', '300', '黄金选手（Lv3）所需经验'],
    ['season_level_exp_4', '700', '铂金选手（Lv4）所需经验'],
    ['season_level_exp_5', '1500', '钻石选手（Lv5）所需经验'],
    ['season_level_exp_6', '3000', '最强王者（Lv6）所需经验'],
    ['season_reward_level_2_coupon_cents', '800', '白银段位升级奖励 - 参赛抵扣卡金额（分）'],
    ['season_reward_level_2_points', '80', '白银段位升级奖励 - 积分'],
    ['season_reward_level_3_coupon_cents', '1500', '黄金段位升级奖励 - 参赛抵扣卡金额（分）'],
    ['season_reward_level_3_points', '150', '黄金段位升级奖励 - 积分'],
    ['season_reward_level_4_coupon_cents', '2500', '铂金段位升级奖励 - 参赛抵扣卡金额（分）'],
    ['season_reward_level_4_points', '300', '铂金段位升级奖励 - 积分'],
    ['season_reward_level_5_coupon_cents', '4000', '钻石段位升级奖励 - 参赛抵扣卡金额（分）'],
    ['season_reward_level_5_points', '500', '钻石段位升级奖励 - 积分'],
    ['season_reward_level_6_coupon_cents', '6000', '大师段位升级奖励 - 参赛抵扣卡金额（分）'],
    ['season_reward_level_6_points', '800', '大师段位升级奖励 - 积分'],
    ['season_reward_level_2_grant_once', 'true', '白银奖励终身一次'],
    ['season_reward_level_3_grant_once', 'true', '黄金奖励终身一次'],
    ['season_reward_level_4_grant_once', 'true', '铂金奖励终身一次'],
    ['season_reward_level_5_grant_once', 'true', '钻石奖励终身一次'],
    ['season_reward_level_6_grant_once', 'true', '大师奖励终身一次'],
    ['season_default_days', '30', '赛季默认天数'],
    ['season_lottery_cost', '100', '单次抽奖所需积分'],
  ];
  for (const [key, value, desc] of defaultSeasonConfigs) {
    try {
      await conn.execute(
        `INSERT IGNORE INTO system_config (id, \`key\`, value, description) VALUES (?, ?, ?, ?)`,
        [uuidv4(), key, value, desc]
      );
    } catch {
      // ignore
    }
  }

  // 更新已存在的段位奖励积分值
  const levelRewardUpdates: [string, string][] = [
    ['season_reward_level_2_points', '80'],
    ['season_reward_level_3_points', '150'],
    ['season_reward_level_4_points', '300'],
    ['season_reward_level_5_points', '500'],
  ];
  for (const [key, value] of levelRewardUpdates) {
    try {
      await conn.execute('UPDATE system_config SET value = ? WHERE `key` = ? AND value != ?', [value, key, value]);
    } catch {
      // ignore
    }
  }

  // V2.0 商家端迁移：merchants 表新增字段
  const merchantNewCols: [string, string][] = [
    ['operator_id', 'VARCHAR(36)'],
    ['region', "VARCHAR(64) DEFAULT ''"],
    ['business_hours', "VARCHAR(128) DEFAULT ''"],
    ['description', 'TEXT'],
    ['qrcode_url', "VARCHAR(512) DEFAULT ''"],
    ['audit_status', 'INT NOT NULL DEFAULT 0'],
    ['audit_remark', 'TEXT'],
    ['audit_time', 'DATETIME'],
    ['auditor_id', 'VARCHAR(36)'],
    ['contact_name', "VARCHAR(64) DEFAULT ''"],
  ];
  for (const [colName, colDef] of merchantNewCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'merchants' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, colName]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE merchants ADD COLUMN \`${colName}\` ${colDef}`);
      }
    } catch { /* ignore */ }
  }

  // V2.0 商家端迁移：merchant_coupons 表新增字段
  const merchantCouponNewCols: [string, string][] = [
    ['audit_status', 'INT NOT NULL DEFAULT 0'],
    ['audit_remark', 'TEXT'],
    ['audit_time', 'DATETIME'],
    ['auditor_id', 'VARCHAR(36)'],
    ['version', 'INT DEFAULT 1'],
    ['put_channels', "TEXT DEFAULT '{}'"],
    ['coupon_type', 'INT NOT NULL DEFAULT 1'],
    ['discount_percent', 'INT DEFAULT 0'],
    ['max_per_user', 'INT NOT NULL DEFAULT 1'],
    ['available_start', 'DATETIME'],
    ['available_end', 'DATETIME'],
  ];
  for (const [colName, colDef] of merchantCouponNewCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'merchant_coupons' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, colName]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE merchant_coupons ADD COLUMN \`${colName}\` ${colDef}`);
      }
    } catch { /* ignore */ }
  }

  // V2.0 商家端迁移：user_coupons 表新增字段
  const userCouponNewCols: [string, string][] = [
    ['coupon_type', 'INT DEFAULT 1'],
    ['discount_percent', 'INT DEFAULT 0'],
    ['extra_data', "TEXT DEFAULT '{}'"],
    ['verify_code', 'VARCHAR(64)'],
  ];
  for (const [colName, colDef] of userCouponNewCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_coupons' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, colName]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE user_coupons ADD COLUMN \`${colName}\` ${colDef}`);
      }
    } catch { /* ignore */ }
  }

  // V2.0 商家端迁移：race_packages 表新增字段
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'race_packages' AND COLUMN_NAME = 'free_deduction_cents'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE race_packages ADD COLUMN free_deduction_cents INT NOT NULL DEFAULT 0');
    }
  } catch { /* ignore */ }

  // 微信服务号登录迁移：users 表新增 mp_openid 字段
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'mp_openid'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute("ALTER TABLE users ADD COLUMN mp_openid VARCHAR(128) DEFAULT ''");
    }
  } catch { /* ignore */ }

  // orders 表新增支付相关字段
  const orderPayCols: [string, string][] = [
    ['prepay_id', 'VARCHAR(64)'],
    ['transaction_id', 'VARCHAR(64)'],
    ['refund_id', 'VARCHAR(64)'],
    ['refund_amount', 'INT DEFAULT 0'],
    ['payment_remark', 'VARCHAR(512)'],
  ];
  for (const [colName, colDef] of orderPayCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, colName]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE orders ADD COLUMN \`${colName}\` ${colDef}`);
      }
    } catch { /* ignore */ }
  }

  // 支付流水表
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS payment_transactions (
      id VARCHAR(36) PRIMARY KEY,
      order_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      amount INT NOT NULL,
      transaction_id VARCHAR(64),
      payment_method VARCHAR(32) DEFAULT 'wechat_pay',
      status VARCHAR(16) DEFAULT 'pending',
      refund_id VARCHAR(64),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
  } catch { /* ignore */ }

  // 通知发送日志表
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS notification_logs (
      id VARCHAR(36) PRIMARY KEY,
      scene VARCHAR(64) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      openid VARCHAR(128) NOT NULL,
      template_id VARCHAR(64),
      content TEXT,
      status VARCHAR(16) DEFAULT 'success',
      error_msg TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_notification_logs_scene ON notification_logs(scene)');
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id)');
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at)');
  } catch { /* ignore */ }

  // V2.3 迁移：orders 表新增字段
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'remaining_times'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute('ALTER TABLE orders ADD COLUMN remaining_times INT DEFAULT 0');
      await conn.execute('ALTER TABLE orders ADD COLUMN remaining_growth INT DEFAULT 0');
    }
  } catch { /* ignore */ }

  // 插入运营商预制模板默认配置项
  const operatorDefaultConfigs: [string, string, string][] = [
    ['season_default_days', '30', '赛季默认天数'],
    ['coupon_base_price_type', 'discount_price', '优惠券基价类型(standard_price/discount_price)'],
    ['growth_base_rule', 'discount_price', '成长值计算基准(standard_price/discount_price)'],
    ['point_base_rule', 'discount_price', '积分计算基准(standard_price/discount_price)'],
    ['point_rate', '2.0', '积分倍率(元:分)'],
    ['refund_coupon_return', 'false', '退款是否回收优惠券'],
    ['coupon_overdue_remind', '3', '优惠券过期前提醒天数'],
    ['register_deduction_cents', '1000', '新用户注册赠送参赛抵扣金金额（分，0=关闭）'],
  ];
  for (const [key, value, desc] of operatorDefaultConfigs) {
    try {
      const existing = await conn.execute<any>(
        'SELECT id FROM system_config WHERE `key` = ?',
        [key]
      );
      if (existing[0].length === 0) {
        await conn.execute(
          'INSERT INTO system_config (id, `key`, value, description) VALUES (?, ?, ?, ?)',
          [uuidv4(), key, value, desc]
        );
      }
    } catch {
      // ignore
    }
  }

  // 插入默认积分商城商品
  const defaultPointItems: [string, string, number, string, string, number, number][] = [
    ['point_entry_5', 'entry_deduction', 500, '5元参赛抵扣金', '兑换后获得5元参赛抵扣金', 1000, 0],
    ['point_entry_10', 'entry_deduction', 1000, '10元参赛抵扣金', '兑换后获得10元参赛抵扣金', 2000, 1],
    ['point_entry_25', 'entry_deduction', 2500, '25元参赛抵扣金', '兑换后获得25元参赛抵扣金', 5000, 2],
    ['point_coupon_5', 'merchant_coupon', 500, '5元商家消费券', '兑换后获得5元商家消费券', 500, 3],
    ['point_coupon_10', 'merchant_coupon', 1000, '10元商家消费券', '兑换后获得10元商家消费券', 1000, 4],
    ['point_coupon_20', 'merchant_coupon', 2000, '20元商家消费券', '兑换后获得20元商家消费券', 2000, 5],
  ];
  for (const [id, itemType, itemId, name, desc, needPoints, sortWeight] of defaultPointItems) {
    try {
      await conn.execute(
        `INSERT IGNORE INTO point_shop (id, item_type, item_id, name, description, need_points, sort_weight, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, itemType, itemId, name, desc, needPoints, sortWeight]
      );
    } catch {
      // ignore
    }
  }

  // 插入默认超级管理员
  try {
    const existingAdmin = await conn.execute<any>(
      "SELECT id FROM admin_users WHERE username = ?",
      ['admin']
    );
    if (existingAdmin[0].length === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await conn.execute(
        `INSERT INTO admin_users (id, username, password, nickname, role_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin-id-001', 'admin', hashedPassword, '超级管理员', 'role-super-admin', 'active']
      );
      console.log('[MySQL] Default admin user created (admin/admin123)');
    }
  } catch {
    // ignore
  }
}

/** 获取连接池配置（供内部使用） */
function getPoolOptions(): mysql.PoolOptions {
  return parseDatabaseUrl(DATABASE_URL);
}

// 生成符合密码规则的随机密码：至少8位，含大写、小写字母和数字
function generateSecurePassword(length: number = 8): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;

  // 确保每种字符至少出现一次
  let pw = upper[Math.floor(Math.random() * upper.length)] +
           lower[Math.floor(Math.random() * lower.length)] +
           digits[Math.floor(Math.random() * digits.length)] +
           symbols[Math.floor(Math.random() * symbols.length)];

  // 补足剩余长度
  for (let i = pw.length; i < length; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }

  // 打乱顺序
  pw = pw.split('').sort(() => Math.random() - 0.5).join('');
  return pw;
}

export { generateSecurePassword };

export default getPool;
