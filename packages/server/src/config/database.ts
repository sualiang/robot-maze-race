/**
 * config/database.ts — 多租户数据库访问层
 *
 * 公共库 (robot_maze_race_common):
 *   query / queryOne / execute / transaction
 *   表: users, operators, operators_registry, admin_roles, admin_users,
 *       system_config, settings, idempotency_keys, client_logs,
 *       seasons, season_user_info, combat_power, points_transactions,
 *       helps, help_helpers, tasks, user_tasks, notification_logs, referee_invites
 *
 * 运营商独立库 (robot_maze_race_{db_name}):
 *   queryOp / queryOpOne / executeOp
 *   通过 req 中的 operator context 解析 db_name
 *   表: venues, referees, race_packages, race_package_coupons, orders,
 *       payments, checkins, race_results, attendance,
 *       settlements, marketing_config, operator_members, operator_sessions,
 *       races, race_records, race_attendance, ticket_redemptions,
 *       merchant_coupons, user_coupons, merchants, entry_deductions,
 *       point_shop, points_exchange_log
 */

import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { getOperatorContext } from '../middleware/operator-context';

// ==================== 连接配置 ====================

// Load .env for CLI/debug; in production PM2 provides DATABASE_URL via env
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:IronDog2026!Root@127.0.0.1:3308/robot_maze_race';
const COMMON_DB_NAME = process.env.COMMON_DB_NAME || 'robot_maze_race_common';

let commonPool: mysql.Pool | null = null;
const operatorPools: Map<string, mysql.Pool> = new Map();

export function getBaseOptions(): mysql.PoolOptions {
  const parsed = new URL(DATABASE_URL);
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

function getCommonPool(): mysql.Pool {
  if (!commonPool) {
    commonPool = mysql.createPool({ ...getBaseOptions(), database: COMMON_DB_NAME });
    console.log('[DB] Common pool created:', COMMON_DB_NAME);
  }
  return commonPool;
}

export function getOperatorPool(dbName: string): mysql.Pool {
  let pool = operatorPools.get(dbName);
  if (!pool) {
    pool = mysql.createPool({ ...getBaseOptions(), database: dbName });
    operatorPools.set(dbName, pool);
    console.log('[DB] Operator pool created:', dbName);
  }
  return pool;
}

// 缓存：userId → db_name，避免每次请求都遍历所有运营商库
const userIdDbCache = new Map<string, { dbName: string; ts: number }>();
const USERID_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 通过 userId 遍历所有运营商库查找用户所在的数据库
 * 用于 player 端无 Redis operator context 时的 fallback
 */
export async function resolveOperatorDbForUserId(userId: string): Promise<string | null> {
  if (!userId) return null;

  // 先查缓存
  const cached = userIdDbCache.get(userId);
  if (cached && Date.now() - cached.ts < USERID_CACHE_TTL_MS) {
    return cached.dbName;
  }

  const common = getCommonPool();
  let allOps: any[];
  try {
    const [rows] = await common.query<any[]>(
      `SELECT db_name FROM operators_registry WHERE db_name IS NOT NULL`
    );
    allOps = rows || [];
  } catch {
    return null;
  }

  for (const opReg of allOps) {
    if (!opReg.db_name) continue;
    try {
      const pool = getOperatorPool(opReg.db_name);
      const [rows] = await pool.execute(
        `SELECT id FROM users WHERE id = ? LIMIT 1`,
        [userId]
      );
      if (rows && (Array.isArray(rows) ? rows.length > 0 : true)) {
        userIdDbCache.set(userId, { dbName: opReg.db_name, ts: Date.now() });
        return opReg.db_name;
      }
    } catch {
      // 跳过连接失败的库
    }
  }
  return null;
}

export async function resolveOperatorDb(req: Request): Promise<string | null> {
  // 优先从 JWT 获取 operatorId
  const jwtOperatorId = (req.user as any)?.operatorId
    || (req.merchantAdmin as any)?.operatorId;
  if (jwtOperatorId) {
    const pool = getCommonPool();
    const [rows] = await pool.query<any[]>(
      `SELECT db_name FROM operators_registry WHERE operator_id = ?`, [jwtOperatorId]
    );
    return (rows && rows.length > 0 && rows[0].db_name) ? rows[0].db_name : null;
  }
  // 回退：从 Redis 获取
  const userId = req.user?.userId;
  if (!userId) return null;
  try {
    const ctx = await getOperatorContext(userId);
    const operatorId = ctx?.operator_id;
    if (operatorId) {
      const pool = getCommonPool();
      const [rows] = await pool.query<any[]>(
        `SELECT db_name FROM operators_registry WHERE operator_id = ?`, [operatorId]
      );
      if (rows && rows.length > 0 && rows[0].db_name) {
        return rows[0].db_name;
      }
    }
  } catch { /* ignore Redis failure */ }

  // 最终 fallback：遍历所有运营商库查找该用户所在的库
  return resolveOperatorDbForUserId(userId);
}

// ==================== SQL 工具 ====================

function convertSql(text: string): string {
  return text.replace(/\$\d+/g, '?');
}
function normalizeValue(v: any): any {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v))
    return v.replace('T', ' ').replace(/\.\d{1,3}Z?$/, '').substring(0, 19);
  return v;
}
function expandParams(text: string, params: any[]): any[] {
  if (!params || params.length === 0) return [];
  // 按 SQL 中 $digit 的出现顺序重排参数，每个 $digit 对应 params[digit-1]
  const r: any[] = [];
  const re = /\$(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const idx = parseInt(m[1], 10) - 1;
    r.push(idx < params.length ? normalizeValue(params[idx]) : undefined);
  }
  return r;
}

async function doQuery(pool: mysql.Pool, text: string, params?: any[]): Promise<any[]> {
  const sql = convertSql(text);
  const ep = params ? expandParams(text, params) : undefined;
  const trimmed = sql.trimStart();
  if (!/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(trimmed)) {
    await pool.query(sql, ep || []);
    return [];
  }
  const [rows] = await pool.query<any[]>(sql, ep || []);
  return (rows || []);
}

async function doQueryOne(pool: mysql.Pool, text: string, params?: any[]): Promise<any | null> {
  const rows = await doQuery(pool, text, params);
  return rows.length > 0 ? rows[0] : null;
}

async function doExecute(pool: mysql.Pool, text: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  const sql = convertSql(text);
  const ep = params ? expandParams(text, params) : undefined;
  const [result] = await pool.query<any>(sql, ep || []);
  return { changes: result.affectedRows || 0, lastInsertRowid: result.insertId || 0 };
}

// ==================== 公共库 API ====================

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  return doQuery(getCommonPool(), text, params) as Promise<T[]>;
}
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  return doQueryOne(getCommonPool(), text, params) as Promise<T | null>;
}
export async function execute(text: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  return doExecute(getCommonPool(), text, params);
}

// ==================== 运营商库 API ====================

export async function queryOp<T = any>(req: Request, text: string, params?: any[]): Promise<T[]> {
  const dbName = await resolveOperatorDb(req);
  if (!dbName) return [] as T[];
  return doQuery(getOperatorPool(dbName), text, params) as Promise<T[]>;
}
export async function queryOpOne<T = any>(req: Request, text: string, params?: any[]): Promise<T | null> {
  const dbName = await resolveOperatorDb(req);
  if (!dbName) return null;
  return doQueryOne(getOperatorPool(dbName), text, params) as Promise<T | null>;
}
export async function executeOp(req: Request, text: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  const dbName = await resolveOperatorDb(req);
  if (!dbName) return { changes: 0, lastInsertRowid: 0 };
  return doExecute(getOperatorPool(dbName), text, params);
}

/**
 * 通过订单 ID 直接查找对应的运营商数据库
 * 用于 player 端无 operator context 的场景（如 confirm-payment）
 * 遍历所有运营商库查找订单，找到后返回对应 pool
 */
export async function resolveOperatorDbForOrder(orderId: string): Promise<mysql.Pool | null> {
  const common = getCommonPool();
  const [allOps] = await common.query<any[]>(
    `SELECT db_name FROM operators_registry WHERE db_name IS NOT NULL`
  );
  if (!allOps || allOps.length === 0) return null;

  for (const opReg of allOps) {
    if (!opReg.db_name) continue;
    try {
      const pool = getOperatorPool(opReg.db_name);
      const [rows] = await pool.execute(
        `SELECT id FROM orders WHERE id = ? LIMIT 1`,
        [orderId]
      );
      if (rows && (Array.isArray(rows) ? rows.length > 0 : true)) {
        return pool;
      }
    } catch {
      // 跳过连接失败的库
    }
  }
  return null;
}

/**
 * 通过订单 ID 直接对运营商库执行写操作
 * 用于 player 端无 operator context 的确认支付场景
 */
export async function executeOpByOrder(orderId: string, text: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  const pool = await resolveOperatorDbForOrder(orderId);
  if (!pool) return { changes: 0, lastInsertRowid: 0 };
  return doExecute(pool, text, params);
}

// ==================== 事务（仅公共库） ====================

export async function transaction<T>(fn: (executor: any) => T): Promise<T> {
  const conn = getCommonPool();
  const c = await conn.getConnection();
  try {
    await c.beginTransaction();
    const exec = {
      query: async (t: string, p?: any[]) => (await doQuery(c as any, t, p)),
      queryOne: async (t: string, p?: any[]) => (await doQueryOne(c as any, t, p)),
      execute: async (t: string, p?: any[]) => (await doExecute(c as any, t, p)),
    };
    const r = await fn(exec);
    await c.commit();
    return r;
  } catch (e) { await c.rollback(); throw e; }
  finally { c.release(); }
}

// ==================== Schema 初始化 ====================

export async function initSchema(): Promise<void> {
  // 公共库 schema
  const commonPath = path.join(__dirname, '../db/common.sql');
  const conn = getCommonPool();
  await runSqlFile(conn, commonPath);

  // 默认系统配置
  const defaults: [string, string, string][] = [
    ['help_required_count', '5', '助力所需人数'],
    ['help_valid_days', '7', '助力活动有效期(天)'],
    ['help_initiator_reward_count', '1', '发起者助力完成奖励次数'],
  ];
  for (const [key, value, desc] of defaults) {
    try { await conn.execute(`INSERT IGNORE INTO system_config (id, \`key\`, value, description) VALUES (?, ?, ?, ?)`, [uuidv4(), key, value, desc]); } catch {}
  }

  // migrations
  const dbName = COMMON_DB_NAME;
  const migs: [string, string, string][] = [
    ['admin_users', 'operator_id', 'VARCHAR(36)'],
    ['referee_invites', 'name', 'VARCHAR(100)'], // note: referees is operator table; skip here
  ];
  for (const [table, col, type] of migs) {
    try {
      const [cols] = await conn.execute<any>(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [dbName, table, col]);
      if ((cols as any[]).length === 0) await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${type}`);
    } catch {}
  }

  // ===== 种子数据: 默认角色和超管账号 =====
  try {
    // 添加默认管理员角色
    const adminRoles = [
      ['role-super-admin', '超级管理员', '["*"]', 'admin'],
      ['role-admin', '总管理员', '["operators:read","operators:list","operators:create","operators:edit","operators:delete","players:list","dashboard:read","dashboard:list","marketing:read","finance:read","finance:withdraw","finance:history"]', 'admin'],
      ['role-ops-admin', '运营管理', '["operators:read","operators:create","operators:edit","players:list","dashboard:read","dashboard:list"]', 'admin'],
      ['role-finance-admin', '财务管理', '["finance:read","finance:withdraw","finance:history"]', 'admin'],
      ['op_super_admin', '运营商超管', '["*"]', 'operator'],
      ['op_admin', '运营', '["venues:read","venues:create","venues:edit","referees:read","referees:create","referees:edit","packages:read","packages:create","packages:edit","marketing:read","marketing:create","marketing:edit","players:read","dashboard:read"]', 'operator'],
      ['op_finance', '财务', '["finance:read","finance:withdraw","finance:history","dashboard:read"]', 'operator'],
    ];
    for (const [name, label, permissions, scope] of adminRoles) {
      await conn.execute(
        'INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), name, label, permissions, scope]
      );
    }
    console.log('[DB] Seed admin_roles inserted');

    // 添加默认超管账号 (admin / admin123)
    const adminPassword = bcrypt.hashSync('admin123', 10);
    await conn.execute(
      'INSERT IGNORE INTO admin_users (id, username, password, nickname, role_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), 'admin', adminPassword, 'Admin', 'role-super-admin', 'active']
    );
    console.log('[DB] Seed admin user inserted');
  } catch (e: any) {
    console.warn('[DB] Seed warning (may already exist):', e.message?.substring(0, 100));
  }

  // ===== 自动补全历史运营商独立库 =====
  try {
    // 找出 operators 表中有但 operators_registry 中没有的
    const [missingRows] = await conn.execute<any[]>(
      `SELECT o.id, o.name FROM operators o
       LEFT JOIN operators_registry r ON r.operator_id = o.id
       WHERE r.operator_id IS NULL`
    );
    if (missingRows && missingRows.length > 0) {
      console.log(`[DB] Found ${missingRows.length} operator(s) without registry, auto-creating databases...`);
      for (const op of missingRows) {
        try {
          const dbName = `op_${op.id}`;
          await createOperatorDatabase(dbName);
          await conn.execute(
            `INSERT IGNORE INTO operators_registry (id, operator_id, db_name, operator_name) VALUES (?, ?, ?, ?)`,
            [uuidv4(), op.id, dbName, op.name || '']
          );
          console.log(`[DB]  ✓ Auto-created DB: ${dbName} for operator ${op.name || op.id}`);
        } catch (e: any) {
          console.error(`[DB]  ✗ Failed to auto-create DB for operator ${op.id}:`, e.message);
        }
      }
    }
  } catch (e: any) {
    console.warn('[DB] Auto-heal warning:', e.message?.substring(0, 100));
  }

  // ===== 补全现有运营商库中缺失的表（re-run operator.sql） =====
  try {
    const schemaPath = path.join(__dirname, '../db/operator.sql');
    if (!fs.existsSync(schemaPath)) {
      console.warn('[DB] operator.sql not found, skipping table completeness check');
    } else {
      const [allRegistry] = await conn.execute<any[]>(
        `SELECT db_name, operator_id FROM operators_registry WHERE db_name IS NOT NULL`
      );
      if (allRegistry && allRegistry.length > 0) {
        // 1. ALTER TABLE 补缺列
        const alterCols: [string, string, string][] = [
          ['orders', 'operator_id', "VARCHAR(36) NOT NULL DEFAULT ''"],
          ['settlements', 'operator_id', "VARCHAR(36) NOT NULL DEFAULT ''"],
          ['race_results', 'operator_id', "VARCHAR(36) NOT NULL DEFAULT ''"],
          ['points_transactions', 'operator_id', "VARCHAR(36) NOT NULL DEFAULT ''"],
          ['point_shop', 'image', 'VARCHAR(512) DEFAULT NULL'],
          ['point_shop', 'stock', 'INT NOT NULL DEFAULT 0'],
        ];
        for (const reg of allRegistry) {
          try {
            const pool = getOperatorPool(reg.db_name);
            for (const [tbl, col, typ] of alterCols) {
              try {
                const [cols] = await pool.execute<any>(
                  `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                  [reg.db_name, tbl, col]
                );
                if ((cols as any[]).length === 0) {
                  await pool.execute(`ALTER TABLE \`${tbl}\` ADD COLUMN \`${col}\` ${typ}`);
                  console.log(`[DB]  Added ${tbl}.${col} for ${reg.db_name}`);
                }
              } catch {}
            }
          } catch {}
        }

        // 2. Re-run operator.sql for missing tables
        console.log(`[DB] Checking ${allRegistry.length} operator DB(s) for missing tables...`);
        let fixedCount = 0;
        for (const reg of allRegistry) {
          try {
            const pool = getOperatorPool(reg.db_name);
            await runSqlFile(pool, schemaPath);
          } catch (e: any) {
            console.warn(`[DB]  Table completeness check failed for ${reg.db_name}:`, e.message?.substring(0, 100));
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[DB] Table completeness check warning:', e.message?.substring(0, 100));
  }
}

async function runSqlFile(pool: mysql.Pool, filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) { console.warn('[DB] Schema file not found:', filePath); return; }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => !l.trim().startsWith('--'));
  const sql = lines.join('\n');
  const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('/*'));
  for (const stmt of stmts) {
    try { await pool.execute(stmt); }
    catch (e: any) {
      const short = stmt.substring(0, 80).replace(/\s+/g, ' ');
      console.error(`[DB] SQL error in ${path.basename(filePath)} at "${short}...":`, e.message?.substring(0, 150));
    }
  }
}

// ==================== 运营商库创建 ====================

export async function createOperatorDatabase(dbName: string): Promise<void> {
  const baseOpts = getBaseOptions();
  const adminConn = await mysql.createConnection({ host: baseOpts.host, port: baseOpts.port, user: baseOpts.user, password: baseOpts.password, charset: baseOpts.charset });
  try {
    await adminConn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally { await adminConn.end(); }

  const pool = getOperatorPool(dbName);
  const schemaPath = path.join(__dirname, '../db/operator.sql');
  await runSqlFile(pool, schemaPath);
  console.log('[DB] Operator database created:', dbName);
}

export async function closeAllPools(): Promise<void> {
  if (commonPool) { await commonPool.end(); commonPool = null; }
  for (const [n, p] of operatorPools) { await p.end(); }
  operatorPools.clear();
}

/** 关闭并移除单个运营商的连接池 */
export async function closeOperatorPool(dbName: string): Promise<void> {
  const pool = operatorPools.get(dbName);
  if (pool) {
    try { await pool.end(); } catch { /* ignore */ }
    operatorPools.delete(dbName);
    console.log('[DB] Operator pool closed:', dbName);
  }
}

export function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghjkmnpqrstuvwxyz', digits = '23456789', specials = '!@#$%^&*', all = upper + lower + digits + specials;
  let pw = upper[Math.floor(Math.random()*upper.length)] + lower[Math.floor(Math.random()*lower.length)] + digits[Math.floor(Math.random()*digits.length)] + specials[Math.floor(Math.random()*specials.length)];
  for (let i = 4; i < length; i++) pw += all[Math.floor(Math.random()*all.length)];
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export default { query, queryOne, execute, transaction, queryOp, queryOpOne, executeOp, executeOpByOrder, initSchema, createOperatorDatabase, generateSecurePassword, resolveOperatorDb, resolveOperatorDbForOrder, resolveOperatorDbForUserId };
