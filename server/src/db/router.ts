/**
 * db/router.ts — 多租户数据库路由
 *
 * 架构:
 * - 公共库 robot_maze_race_common: users, operators, seasons, helps, points_transactions, etc.
 * - 运营商独立库 robot_maze_race_{db_name}: venues, packages, orders, coupons, checkins, etc.
 *
 * queryCommon() → 查询公共库
 * queryOperator()/queryOperatorOne()/executeOperator() → 查询运营商独立库
 *   - 需要 req 参数来获取 operator context
 *   - 无 context 时返回空（不回退到公共库）
 *
 * 连接池管理: 每个运营商数据库一个连接池，懒加载
 */

import mysql from 'mysql2/promise';
import { Request } from 'express';
import { getOperatorContext } from '../middleware/operator-context';

// 公共库连接池
let commonPool: mysql.Pool | null = null;

// 运营商独立库连接池缓存: { db_name -> Pool }
const operatorPools: Map<string, mysql.Pool> = new Map();

const COMMON_DB = process.env.COMMON_DB_URL
  ? new URL(process.env.COMMON_DB_URL).pathname.replace(/^\//, '')
  : (process.env.COMMON_DB_NAME || 'robot_maze_race_common');

/** 从 DATABASE_URL 提取基础连接选项（不含 database） */
function getBaseOptions(): mysql.PoolOptions {
  const dbUrl = process.env.DATABASE_URL || 'mysql://root:AmberBot2026!Root@localhost:3308/robot_maze_race';
  const parsed = new URL(dbUrl);
  const port = parseInt(process.env.DB_PORT || parsed.port || '3308', 10);
  return {
    host: parsed.hostname || 'localhost',
    port,
    user: parsed.username || 'root',
    password: parsed.password || '',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_MAX || '20', 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    timezone: '+08:00',
  };
}

/** 获取公共库连接池 */
export function getCommonPool(): mysql.Pool {
  if (!commonPool) {
    commonPool = mysql.createPool({ ...getBaseOptions(), database: COMMON_DB });
    console.log('[DB-Router] Common pool created:', COMMON_DB);
  }
  return commonPool;
}

/** 获取或创建运营商独立库连接池 */
export function getOperatorPool(dbName: string): mysql.Pool {
  let pool = operatorPools.get(dbName);
  if (!pool) {
    pool = mysql.createPool({ ...getBaseOptions(), database: dbName });
    operatorPools.set(dbName, pool);
    console.log('[DB-Router] Operator pool created:', dbName);
  }
  return pool;
}

/**
 * 从请求中解析运营商数据库名。
 * 从 Redis 获取 operator_id → 查 operators_registry → db_name
 * 无 context 时返回 null
 */
export async function resolveOperatorDb(req: Request): Promise<string | null> {
  const userId = req.user?.userId;
  if (!userId) return null;

  try {
    const ctx = await getOperatorContext(userId);
    const operatorId = ctx?.operator_id;
    if (!operatorId) return null;

    // 查 operators_registry 获取 db_name
    const commonPool = getCommonPool();
    const [rows] = await commonPool.query<any[]>(
      `SELECT db_name FROM operators_registry WHERE operator_id = ?`,
      [operatorId]
    );
    if (rows && rows.length > 0 && rows[0].db_name) {
      return rows[0].db_name;
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== 公共库查询 ====================

/** pg 风格 $N → ? 转换 */
function convertSql(text: string): string {
  return text.replace(/\$\d+/g, '?');
}

/** 日期值转换: ISO → MySQL DATETIME */
function normalizeValue(v: any): any {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
    return v.replace('T', ' ').replace(/\.\d{1,3}Z?$/, '').substring(0, 19);
  }
  return v;
}

/** 展开 $N 参数 */
function expandParams(text: string, params: any[]): any[] {
  if (!params || params.length === 0) return [];
  const dollarRegex = /\$(\d+)/g;
  const counts: number[] = [];
  let match;
  while ((match = dollarRegex.exec(text)) !== null) {
    const idx = parseInt(match[1], 10) - 1;
    counts[idx] = (counts[idx] || 0) + 1;
  }
  if (counts.length > 0) {
    const result: any[] = [];
    for (let i = 0; i < counts.length; i++) {
      const count = counts[i] || 0;
      const val = i < params.length ? normalizeValue(params[i]) : undefined;
      for (let j = 0; j < count; j++) result.push(val);
    }
    return result;
  }
  return params.map(normalizeValue);
}

export async function queryCommon<T = any>(text: string, params?: any[]): Promise<T[]> {
  const sql = convertSql(text);
  const expandedParams = params ? expandParams(text, params) : undefined;
  const conn = getCommonPool();
  const trimmed = sql.trimStart();
  if (!/^SELECT\b/i.test(trimmed) && !/^INSERT\b/i.test(trimmed) && !/^UPDATE\b/i.test(trimmed) && !/^DELETE\b/i.test(trimmed) && !/^CREATE\b/i.test(trimmed) && !/^ALTER\b/i.test(trimmed)) {
    await conn.query(sql, expandedParams || []);
    return [] as T[];
  }
  const [rows] = await conn.query<any[]>(sql, expandedParams || []);
  return (rows || []) as T[];
}

export async function queryCommonOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await queryCommon<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function executeCommon(text: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  const sql = convertSql(text);
  const expandedParams = params ? expandParams(text, params) : undefined;
  const conn = getCommonPool();
  const [result] = await conn.query<any>(sql, expandedParams || []);
  return { changes: result.affectedRows || 0, lastInsertRowid: result.insertId || 0 };
}

// ==================== 运营商库查询 ====================

/**
 * 执行运营商库查询。无 context 时返回空数组。
 */
export async function queryOperator<T = any>(req: Request, text: string, params?: any[]): Promise<T[]> {
  const dbName = await resolveOperatorDb(req);
  if (!dbName) return [] as T[];

  const sql = convertSql(text);
  const expandedParams = params ? expandParams(text, params) : undefined;
  const pool = getOperatorPool(dbName);
  const [rows] = await pool.query<any[]>(sql, expandedParams || []);
  return (rows || []) as T[];
}

/**
 * 执行运营商库查询，返回单行。无 context 时返回 null。
 */
export async function queryOperatorOne<T = any>(req: Request, text: string, params?: any[]): Promise<T | null> {
  const rows = await queryOperator<T>(req, text, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 运营商库写操作。无 context 时返回 { changes: 0 }。
 */
export async function executeOperator(
  req: Request,
  text: string,
  params?: any[]
): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  const dbName = await resolveOperatorDb(req);
  if (!dbName) return { changes: 0, lastInsertRowid: 0 };

  const sql = convertSql(text);
  const expandedParams = params ? expandParams(text, params) : undefined;
  const pool = getOperatorPool(dbName);
  const [result] = await pool.query<any>(sql, expandedParams || []);
  return { changes: result.affectedRows || 0, lastInsertRowid: result.insertId || 0 };
}

/**
 * 创建运营商数据库并执行 operator.sql
 */
export async function createOperatorDatabase(dbName: string): Promise<void> {
  const fs = require('fs');
  const path = require('path');

  // 用公共连接池（不带 database）创建新数据库
  const baseOpts = getBaseOptions();
  const adminConn = await mysql.createConnection({
    host: baseOpts.host,
    port: baseOpts.port,
    user: baseOpts.user,
    password: baseOpts.password,
    charset: baseOpts.charset,
  });

  try {
    await adminConn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`[DB-Router] Created database: ${dbName}`);
  } finally {
    await adminConn.end();
  }

  // 获取新库连接池并执行 schema
  const pool = getOperatorPool(dbName);
  const schemaPath = path.join(__dirname, '../db/operator.sql');
  if (fs.existsSync(schemaPath)) {
    const raw = fs.readFileSync(schemaPath, 'utf-8');
    const lines = raw.split('\n').filter((l: string) => !l.trim().startsWith('--'));
    const sql = lines.join('\n');
    const statements = sql
      .split(';')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    for (const stmt of statements) {
      if (stmt.startsWith('/*') || stmt === '') continue;
      try {
        await pool.execute(stmt);
      } catch (error: any) {
        if (!error.message?.includes('already exists')) {
          console.warn('[DB-Router] Schema warning:', error.message?.substring(0, 120));
        }
      }
    }
    console.log(`[DB-Router] Schema applied to ${dbName}`);
  }

  // 注册到 operators_registry
  // Note: operator_id will be set by the caller after creating the operator record
}

/** 关闭所有连接池 */
export async function closeAllPools(): Promise<void> {
  if (commonPool) { await commonPool.end(); commonPool = null; }
  for (const [name, pool] of operatorPools) {
    await pool.end();
    console.log('[DB-Router] Closed pool:', name);
  }
  operatorPools.clear();
}
