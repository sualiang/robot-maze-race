/**
 * bcrypt helper — normalizes $2b$→$2a$ for bcryptjs compatibility
 * bcryptjs only supports the $2a$ prefix; $2b$ is a newer variant that is
 * fully compatible on the wire, but bcryptjs rejects it at parsing time.
 */
import { compareSync as _compareSync, hashSync, genSaltSync } from 'bcryptjs';

export function compareSync(password: string, hash: string): boolean {
  const hash2a = hash.startsWith('$2b$') ? '$2a$' + hash.substring(4) : hash;
  try {
    return _compareSync(password, hash2a);
  } catch {
    return false;
  }
}

export { hashSync, genSaltSync };
