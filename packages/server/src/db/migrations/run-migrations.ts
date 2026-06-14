/**
 * 数据库 Migration Runner
 *
 * 使用方式：
 *   npx ts-node src/db/migrations/run-migrations.ts
 *
 * 或编译后：
 *   npx tsc && node dist/db/migrations/run-migrations.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../../../data/robot-maze-race.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('Database file not found:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const migrationsDir = __dirname;

// 读取并执行所有 .sql migration 文件（按文件名排序）
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`Found ${files.length} migration files.`);

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');

  try {
    console.log(`Running migration: ${file} ...`);
    db.exec(content);
    console.log(`  ✓ ${file}`);
  } catch (error: any) {
    if (error.message?.includes('duplicate column name')) {
      console.log(`  - ${file}: column already exists, skipping.`);
    } else {
      console.error(`  ✗ ${file}:`, error.message);
    }
  }
}

console.log('Migrations complete.');
db.close();
