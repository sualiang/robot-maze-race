/**
 * bcrypt helper — normalizes $2b$→$2a$ for bcryptjs compatibility
 * bcryptjs 3.x UMD has compareSync unreliability after mysql2 pool usage
 */
import * as _bcrypt from 'bcryptjs';

export function compareSync(password: string, hash: string): boolean {
  // Normalize $2b$→$2a$ (bcryptjs only supports $2a$)
  const hash2a = hash.startsWith('$2b$') ? '$2a$' + hash.substring(4) : hash;
  
  // Force-fresh bcryptjs: clear require cache so we get a clean module instance
  // This works around state pollution between mysql2 pool and bcryptjs UMD
  const bcPath = require.resolve('bcryptjs');
  delete require.cache[bcPath];
  const fresh: typeof _bcrypt = require('bcryptjs');
  
  console.log('[BCRYPT] password:', password, 'len:', password.length);
  console.log('[BCRYPT] hash:', hash.substring(0, 15), 'len:', hash.length);
  
  try {
    const result = fresh.compareSync(password, hash2a);
    console.log('[BCRYPT] result:', result);
    return result;
  } catch {
    return false;
  }
}

export { hashSync, genSaltSync } from 'bcryptjs';
