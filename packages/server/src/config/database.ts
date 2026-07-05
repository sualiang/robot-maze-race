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
  const port = parseInt(process.env.DB_PORT || parsed.port || '3306', 10);
  return {
    host: parsed.hostname || 'localhost',
    port,
    user: parsed.username || 'root',
    password: parsed.password || '',
    database: parsed.pathname.replace(/^\//, '') || 'robot_maze_race',
    charset: 'utf8mb4',
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

function getPoolOptions(): { database: string } {
  const options = parseDatabaseUrl(DATABASE_URL);
  return { database: options.database || 'robot_maze_race' };
}

/**
 * 将 pg 风格的 $1, $2, ... 占位符转换为 ? 占位符。
 */
function convertSql(text: string): string {
  return text.replace(new RegExp('\\$\\d+', 'g'), '?');
}

/**
 * 展开参数列表以匹配 convertSql 转换后的 ? 数量。
 */
function expandParams(text: string, params: any[]): any[] {
  if (!params || params.length === 0) return [];
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
  return params;
}

/**
 * 解析 RETURNING 子句。
 * MySQL 不支持 RETURNING，需要拆分为两个查询：
 * 1. 执行 INSERT/UPDATE/DELETE
 * 2. 执行 SELECT 获取返回列
 *
 * 返回 { mainSql, returningColumns } 或 null（无 RETURNING 子句）
 */
function parseReturning(text: string): { mainSql: string; returningColumns: string } | null {
  // 匹配 RETURNING 子句（不区分大小写，支持跨行）
  const returningRegex = /\bRETURNING\s+([\s\S]+)$/i;
  const match = text.match(returningRegex);
  if (!match) return null;

  // 提取 RETURNING 之前的 SQL
  const mainSql = text.substring(0, match.index!).trim();
  // 确保以 ; 结尾（如果还没有）
  const cleanSql = mainSql.endsWith(';') ? mainSql : mainSql + ';';

  const returningPart = match[1].trim();
  return { mainSql: cleanSql, returningColumns: returningPart };
}

/**
 * 从 INSERT 语句中提取主键值。
 * 对于 INSERT ... VALUES ($1, $2, ...) 格式，尝试提取第一个参数（通常是 id）
 */
function extractReturnedValues(
  mainSql: string,
  returningColumns: string,
  params: any[]
): { selectSql: string; selectParams: any[] } {
  // 尝试从 INSERT 的 VALUES 中提取第一个参数作为 id
  const insertMatch = mainSql.match(/INSERT\s+INTO\s+`?(\w+)`?/i);
  if (!insertMatch) {
    // 无法解析，返回空结果
    return { selectSql: '', selectParams: [] };
  }

  const tableName = insertMatch[1];

  // 尝试从 VALUES 中提取第一个 $N 参数
  const firstParamMatch = mainSql.match(/VALUES\s*\(\s*[$](\d+)/i);
  if (firstParamMatch) {
    const idx = parseInt(firstParamMatch[1], 10) - 1;
    const idVal = idx < params.length ? params[idx] : null;
    if (idVal) {
      // 查找是哪个列（通常是 id），然后 SELECT by id
      const colsInInsert = mainSql.match(/INSERT\s+INTO\s+`?\w+`?\s*\(([^)]+)\)/i);
      if (colsInInsert) {
        const cols = colsInInsert[1].split(',').map(c => c.trim().replace(/`/g, ''));
        const idCol = cols[0] || 'id';

        // 简单策略：用 idCol = idVal 查询
        // 注意 RETURNING 可能要求更多列，这里只查 id 匹配的
        return {
          selectSql: `SELECT ${returningColumns} FROM \`${tableName}\` WHERE \`${idCol}\` = ?`,
          selectParams: [idVal],
        };
      }
    }
  }

  // 对于 UPDATE/DELETE，使用 WHERE 条件
  const updateMatch = mainSql.match(/UPDATE\s+`?(\w+)`?\s+SET/i);
  const deleteMatch = mainSql.match(/DELETE\s+FROM\s+`?(\w+)`?/i);

  if (updateMatch) {
    const table = updateMatch[1];
    // 提取 WHERE 条件
    const whereMatch = mainSql.match(/WHERE\s+(.+)$/i);
    if (whereMatch) {
      return {
        selectSql: `SELECT ${returningColumns} FROM \`${table}\` WHERE ${whereMatch[1]}`,
        selectParams: [], // WHERE 参数已经在主 SQL 中用掉了
      };
    }
  }

  if (deleteMatch) {
    const table = deleteMatch[1];
    const whereMatch = mainSql.match(/WHERE\s+(.+)$/i);
    if (whereMatch) {
      return {
        selectSql: `SELECT ${returningColumns} FROM \`${table}\` WHERE ${whereMatch[1]}`,
        selectParams: [],
      };
    }
  }

  return { selectSql: '', selectParams: [] };
}

/**
 * 执行查询，返回多行结果。
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  try {
    const sql = convertSql(text);
    const expandedParams = params ? expandParams(text, params) : undefined;
    const conn = getPool();
    const trimmed = sql.trimStart();
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
 * 特别处理 RETURNING 子句（MySQL 不支持）：
 * 1. 先执行主 INSERT/UPDATE/DELETE
 * 2. 再 SELECT 获取返回结果
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  try {
    const sql = convertSql(text);
    const expandedParams = params ? expandParams(text, params) : undefined;
    const conn = getPool();
    const trimmed = sql.trimStart();

    // 处理 RETURNING 子句（MySQL 兼容）
    const returningInfo = parseReturning(sql);
    if (returningInfo && !/^SELECT\b/i.test(trimmed)) {
      // 执行主 SQL（不带 RETURNING）
      const [result] = await conn.query<any>(returningInfo.mainSql, expandedParams || []);

      // 尝试通过 LAST_INSERT_ID 获取新插入的行
      const isInsert = /^INSERT\b/i.test(trimmed);
      let selectParams: any[] = [];
      let selectSql = '';

      if (isInsert && result.insertId) {
        // INSERT: 用 insertId 查询
        const insertMatch = returningInfo.mainSql.match(/INSERT\s+INTO\s+`?(\w+)`?/i);
        const tableName = insertMatch ? insertMatch[1] : 'unknown';
        // 查找第一个列名作为主键
        const colsMatch = returningInfo.mainSql.match(/INSERT\s+INTO\s+`?\w+`?\s*\(([^)]+)\)/i);
        if (colsMatch) {
          const cols = colsMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
          const idCol = cols[0] || 'id';
          selectSql = `SELECT ${returningInfo.returningColumns} FROM \`${tableName}\` WHERE \`${idCol}\` = ?`;
          selectParams = [String(result.insertId)];
        }
      } else {
        // UPDATE/DELETE: 用 WHERE 条件查询，但参数已经是 ? 格式了
        // 提取 WHERE 子句重新构建
        const extracted = extractReturnedValues(sql, returningInfo.returningColumns, expandedParams || []);
        if (extracted.selectSql) {
          selectSql = extracted.selectSql;
          selectParams = extracted.selectParams;
        }
      }

      if (selectSql) {
        const [rows] = await conn.query<any[]>(selectSql, selectParams);
        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        return (row as T | null) ?? null;
      }
      return null;
    }

    // 普通 SELECT 查询
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

    // 处理 RETURNING 子句（MySQL 兼容）
    const returningInfo = parseReturning(sql);
    const execSql = returningInfo ? returningInfo.mainSql : sql;

    const [result] = await conn.query<any>(execSql, expandedParams || []);
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
 */
export async function transaction<T>(
  fn: (executor: any) => T
): Promise<T> {
  const conn = getPool();
  const connInstance = await conn.getConnection();
  try {
    await connInstance.beginTransaction();
    const executor = {
      query: async (text: string, params?: any[]) => {
        const sql = convertSql(text);
        const expandedParams = params ? expandParams(text, params) : undefined;
        // 处理 RETURNING
        const returningInfo = parseReturning(sql);
        const execSql = returningInfo ? returningInfo.mainSql : sql;
        const [rows] = await connInstance.query<any[]>(execSql, expandedParams || []);
        // 对于 INSERT + RETURNING，用 insertId 查询
        if (returningInfo && /^INSERT\b/i.test(sql)) {
          const info: any = rows;
          if (info && info.insertId) {
            const insertMatch = execSql.match(/INSERT\s+INTO\s+`?(\w+)`?/i);
            const tableName = insertMatch ? insertMatch[1] : 'unknown';
            const colsMatch = execSql.match(/INSERT\s+INTO\s+`?\w+`?\s*\(([^)]+)\)/i);
            if (colsMatch) {
              const cols = colsMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
              const idCol = cols[0] || 'id';
              const [selRows] = await connInstance.query<any[]>(
                `SELECT ${returningInfo.returningColumns} FROM \`${tableName}\` WHERE \`${idCol}\` = ?`,
                [String(info.insertId)]
              );
              return selRows as any[];
            }
          }
        }
        return rows as any[];
      },
      queryOne: async (text: string, params?: any[]) => {
        const rows = await executor.query(text, params);
        return (Array.isArray(rows) && rows.length > 0 ? rows[0] : null) as any;
      },
      execute: async (text: string, params?: any[]) => {
        const sql = convertSql(text);
        const expandedParams = params ? expandParams(text, params) : undefined;
        const returningInfo = parseReturning(sql);
        const execSql = returningInfo ? returningInfo.mainSql : sql;
        const [result] = await connInstance.query<any>(execSql, expandedParams || []);
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
  const conn = getPool();

  if (!fs.existsSync(schemaPath)) {
    console.warn('[MySQL] schema.mysql.sql not found at', schemaPath);
  } else {
    const raw = fs.readFileSync(schemaPath, 'utf-8');
    const lines = raw.split('\n').filter(l => !l.trim().startsWith('--'));
    const sql = lines.join('\n');
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

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
  }

  // 插入默认系统配置
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
      // ignore
    }
  }

  // Database migrations
  const opColumns = ['operator_username', 'operator_password_hash', 'password_change_required'];
  for (const col of opColumns) {
    try {
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

  // referees 表新增 status / apply_remark / review_remark / reviewed_at / reviewed_by 字段
  const refereeReviewCols: [string, string][] = [
    ['status', "VARCHAR(16) DEFAULT 'approved'"],
    ['apply_remark', "VARCHAR(255) DEFAULT ''"],
    ['review_remark', "VARCHAR(255) DEFAULT ''"],
    ['reviewed_at', 'DATETIME DEFAULT NULL'],
    ['reviewed_by', 'VARCHAR(36) DEFAULT NULL'],
  ];
  for (const [col, type] of refereeReviewCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'referees' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, col]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE referees ADD COLUMN \`${col}\` ${type}`);
      }
    } catch { /* ignore */ }
  }

  // venues 表新增 city / district / description / profit_share_rate 字段
  const venueCols: [string, string][] = [
    ['city', "VARCHAR(50) DEFAULT ''"],
    ['district', "VARCHAR(50) DEFAULT ''"],
    ['description', 'TEXT DEFAULT NULL'],
    ['profit_share_rate', "INTEGER DEFAULT 80"],
  ];
  for (const [col, type] of venueCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'venues' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, col]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE venues ADD COLUMN \`${col}\` ${type}`);
      }
    } catch { /* ignore */ }
  }

  // users 表新增 phone / gender / wechat_nickname / avatar_url / points / rank_title 字段
  const userCols: [string, string][] = [
    ['phone', "VARCHAR(20) DEFAULT ''"],
    ['gender', "TINYINT DEFAULT 0"],
    ['wechat_nickname', "VARCHAR(100) DEFAULT ''"],
    ['avatar_url', "VARCHAR(500) DEFAULT ''"],
    ['points', "INTEGER DEFAULT 0"],
    ['rank_title', "VARCHAR(50) DEFAULT ''"],
  ];
  for (const [col, type] of userCols) {
    try {
      const [cols] = await conn.execute<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
        [getPoolOptions().database, col]
      );
      if ((cols as any[]).length === 0) {
        await conn.execute(`ALTER TABLE users ADD COLUMN \`${col}\` ${type}`);
      }
    } catch { /* ignore */ }
  }

  // operator_members 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS operator_members (
        id VARCHAR(36) PRIMARY KEY,
        operator_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36),
        name VARCHAR(100) DEFAULT '',
        phone VARCHAR(20) DEFAULT '',
        role VARCHAR(50) DEFAULT 'op_admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_operator_members_operator_id (operator_id),
        INDEX idx_operator_members_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // admin_roles 表新增 role_name 字段
  try {
    const [cols] = await conn.execute<any>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_roles' AND COLUMN_NAME = 'role_name'`,
      [getPoolOptions().database]
    );
    if ((cols as any[]).length === 0) {
      await conn.execute("ALTER TABLE admin_roles ADD COLUMN role_name VARCHAR(50) DEFAULT ''");
    }
  } catch { /* ignore */ }

  // system_config 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS system_config (
        id VARCHAR(36) PRIMARY KEY,
        \`key\` VARCHAR(100) NOT NULL UNIQUE,
        value TEXT,
        description VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // settings 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(36) PRIMARY KEY,
        \`key\` VARCHAR(100) NOT NULL UNIQUE,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // marketing_config 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS marketing_config (
        id VARCHAR(36) PRIMARY KEY,
        venue_id VARCHAR(100) NOT NULL,
        \`key\` VARCHAR(100) NOT NULL,
        value TEXT,
        description VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_marketing_config_venue_key (venue_id, \`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // point_shop 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS point_shop (
        id VARCHAR(36) PRIMARY KEY,
        item_type VARCHAR(30) NOT NULL,
        item_id VARCHAR(100) DEFAULT '',
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255) DEFAULT '',
        need_points INTEGER NOT NULL DEFAULT 0,
        exchange_limit INTEGER DEFAULT 0,
        sort_weight INTEGER DEFAULT 0,
        status TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // points_exchange_log 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS points_exchange_log (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        item_id VARCHAR(36) NOT NULL,
        item_type VARCHAR(30) NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        spent_points INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_points_exchange_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // points_transactions 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS points_transactions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        points INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        remark VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_points_txns_user (user_id),
        INDEX idx_points_txns_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // entry_deductions 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS entry_deductions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        source VARCHAR(50) DEFAULT '',
        status VARCHAR(20) DEFAULT 'available',
        expires_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_entry_deductions_user (user_id),
        INDEX idx_entry_deductions_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // user_coupons 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_coupons (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        coupon_id VARCHAR(36) NOT NULL,
        merchant_id VARCHAR(100) DEFAULT '',
        name VARCHAR(100) DEFAULT '',
        description VARCHAR(255) DEFAULT '',
        denomination_cents INTEGER DEFAULT 0,
        min_consume_cents INTEGER DEFAULT 0,
        status TINYINT DEFAULT 1,
        valid_start DATETIME DEFAULT NULL,
        valid_end DATETIME DEFAULT NULL,
        coupon_type INT DEFAULT 0,
        extra_data JSON DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_coupons_user (user_id),
        INDEX idx_user_coupons_coupon (coupon_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // auth_sessions 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        token VARCHAR(500),
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_auth_sessions_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // client_logs 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS client_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        level VARCHAR(20) DEFAULT 'error',
        message TEXT,
        stack TEXT,
        url VARCHAR(500),
        user_agent VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // race_records 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS race_records (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        venue_id VARCHAR(36),
        package_id VARCHAR(36),
        status VARCHAR(20) DEFAULT 'pending',
        start_time DATETIME DEFAULT NULL,
        end_time DATETIME DEFAULT NULL,
        score INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_race_records_user (user_id),
        INDEX idx_race_records_venue (venue_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // race_results 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS race_results (
        id VARCHAR(36) PRIMARY KEY,
        race_record_id VARCHAR(36),
        user_id VARCHAR(36) NOT NULL,
        venue_name VARCHAR(100) DEFAULT '',
        finish_time_seconds INT DEFAULT 0,
        rank_score INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_race_results_user (user_id),
        INDEX idx_race_results_record (race_record_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // seasons 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS seasons (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        start_date DATETIME DEFAULT NULL,
        end_date DATETIME DEFAULT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  // merchant_coupons 表
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS merchant_coupons (
        id VARCHAR(36) PRIMARY KEY,
        merchant_id VARCHAR(36) NOT NULL,
        name VARCHAR(100) DEFAULT '',
        description VARCHAR(255) DEFAULT '',
        denomination_cents INTEGER DEFAULT 0,
        min_consume_cents INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        status TINYINT DEFAULT 1,
        valid_start DATETIME DEFAULT NULL,
        valid_end DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_merchant_coupons_merchant (merchant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch { /* ignore */ }

  console.log('[MySQL] All migrations checked');
}

/**
 * 生成安全随机密码
 */
export function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%^&*';
  const all = upper + lower + digits + specials;

  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += specials[Math.floor(Math.random() * specials.length)];

  for (let i = 4; i < length; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }

  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export default { getPool, query, queryOne, execute, transaction, initSchema, generateSecurePassword };
