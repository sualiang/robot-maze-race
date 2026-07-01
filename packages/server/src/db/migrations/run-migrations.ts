/**
 * 数据库 Migration Runner
 *
 * 使用方式：
 *   npx ts-node src/db/migrations/run-migrations.ts
 *
 * 或编译后：
 *   npx tsc && node dist/db/migrations/run-migrations.js
 */

import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:root@localhost:3306/robot_maze_race';

function parseDatabaseUrl(url: string): mysql.PoolOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '3306', 10),
    user: parsed.username || 'root',
    password: parsed.password || '',
    database: parsed.pathname.replace(/^\//, '') || 'robot_maze_race',
  };
}

async function run() {
  const pool = mysql.createPool(parseDatabaseUrl(DATABASE_URL));
  const conn = await pool.getConnection();

  try {
    const migrationsDir = __dirname;

    // 读取并执行所有 .sql migration 文件（按文件名排序）
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files.`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // 分割并逐个执行 SQL 语句
      const statements = content
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        try {
          console.log(`Running: ${file} -> ${stmt.substring(0, 80)} ...`);
          await conn.query(stmt);
          console.log(`  ✓ ${file}`);
        } catch (error: any) {
          if (
            error.message?.includes('Duplicate column') ||
            error.message?.includes('already exists')
          ) {
            console.log(`  - ${file}: column/table already exists, skipping.`);
          } else {
            console.error(`  ✗ ${file}:`, error.message);
          }
        }
      }
    }

    console.log('Migrations complete.');
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
