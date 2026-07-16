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
 *       payments, payment_transactions, checkins, race_results, attendance,
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
import { getOperatorContext } from '../middleware/operator-context';

// ==================== 连接配置 ====================

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:AmberBot2026!Root@localhost:3308/robot_maze_race';
const COMMON_DB_NAME = process.env.COMMON_DB_NAME || 'robot_maze_race_common';

let commonPool: mysql.Pool | null = null;
const operatorPools: Map<string, mysql.Pool> = new Map();

function getBaseOptions(): mysql.PoolOptions {
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

function getOperatorPool(dbName: string): mysql.Pool {
  let pool = operatorPools.get(dbName);
  if (!pool) {
    pool = mysql.createPool({ ...getBaseOptions(), database: dbName });
    operatorPools.set(dbName, pool);
    console.log('[DB] Operator pool created:', dbName);
  }
  return pool;
}

export async function resolveOperatorDb(req: Request): Promise<string | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  try {
    const ctx = await getOperatorContext(userId);
    const operatorId = ctx?.operator_id;
    if (!operatorId) return null;
    const pool = getCommonPool();
    const [rows] = await pool.query<any[]>(
      `SELECT db_name FROM operators_registry WHERE operator_id = ?`, [operatorId]
    );
    return (rows && rows.length > 0 && rows[0].db_name) ? rows[0].db_name : null;
  } catch { return null; }
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
  const counts: number[] = []; let m;
  const re = /\$(\d+)/g;
  while ((m = re.exec(text)) !== null) {
    const idx = parseInt(m[1], 10) - 1;
    counts[idx] = (counts[idx] || 0) + 1;
  }
  if (counts.length > 0) {
    const r: any[] = [];
    for (let i = 0; i < counts.length; i++) {
      const c = counts[i] || 0;
      const v = i < params.length ? normalizeValue(params[i]) : undefined;
      for (let j = 0; j < c; j++) r.push(v);
    }
    return r;
  }
  return params.map(normalizeValue);
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
    ['operators', 'operator_username', 'VARCHAR(256)'],
    ['operators', 'operator_password_hash', 'VARCHAR(256)'],
    ['operators', 'password_change_required', 'INT DEFAULT 1'],
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
      ['ops_admin', '运营', '["venue_manage","race_manage","package_manage","order_manage","coupon_manage","member_manage","referee_manage","marketing_manage","dashboard","checkin","data_export","report"]', 'operator'],
      ['finance_admin', '财务', '["order_manage","settlement","data_export","report","dashboard"]', 'operator'],
      ['op_super_admin', '运营商超管', '["*"]', 'operator'],
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

  console.log('[DB] Common schema initialized');
}

async function runSqlFile(pool: mysql.Pool, filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) { console.warn('[DB] Schema file not found:', filePath); return; }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => !l.trim().startsWith('--'));
  const sql = lines.join('\n');
  const stmts = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('/*'));
  for (const stmt of stmts) {
    try { await pool.execute(stmt); }
    catch (e: any) { if (!e.message?.includes('already exists')) console.warn('[DB] Schema warning:', e.message?.substring(0, 120)); }
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

export function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghjkmnpqrstuvwxyz', digits = '23456789', specials = '!@#$%^&*', all = upper + lower + digits + specials;
  let pw = upper[Math.floor(Math.random()*upper.length)] + lower[Math.floor(Math.random()*lower.length)] + digits[Math.floor(Math.random()*digits.length)] + specials[Math.floor(Math.random()*specials.length)];
  for (let i = 4; i < length; i++) pw += all[Math.floor(Math.random()*all.length)];
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export default { query, queryOne, execute, transaction, queryOp, queryOpOne, executeOp, initSchema, createOperatorDatabase, generateSecurePassword, resolveOperatorDb };
