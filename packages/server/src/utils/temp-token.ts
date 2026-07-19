import { getRedis } from '../config/redis';

const KEY_PREFIX = 'temp_token';

/** 生成 Redis key: temp_token:{namespace}:{token} */
function makeKey(namespace: string, token: string): string {
  return `${KEY_PREFIX}:${namespace}:${token}`;
}

/** 生成 namespace 模式 key: temp_token:{namespace}:* */
function makePattern(namespace: string): string {
  return `${KEY_PREFIX}:${namespace}:*`;
}

/**
 * 设置临时 Token（Redis SETEX）
 * @param namespace 命名空间（如 'activation_code'）
 * @param token Token 值
 * @param data 关联的数据（可 JSON 序列化）
 * @param ttlSeconds 过期时间（秒），默认 60
 */
export async function setTempToken(
  namespace: string,
  token: string,
  data: Record<string, any>,
  ttlSeconds: number = 60,
): Promise<void> {
  const redis = await getRedis();
  const key = makeKey(namespace, token);
  await redis.setEx(key, ttLSeconds, JSON.stringify(data));
}

/**
 * 获取临时 Token 数据（Redis GET + JSON.parse）
 * @returns data 或 null（token 不存在/已过期）
 */
export async function getTempToken<T = Record<string, any>>(
  namespace: string,
  token: string,
): Promise<T | null> {
  const redis = await getRedis();
  const key = makeKey(namespace, token);
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 删除临时 Token（Redis DEL）
 */
export async function deleteTempToken(
  namespace: string,
  token: string,
): Promise<void> {
  const redis = await getRedis();
  const key = makeKey(namespace, token);
  await redis.del(key);
}

/**
 * 获取指定命名空间下所有 token 列表
 * 注意：KEYS 在生产环境若 key 数量巨大可能有性能影响，
 *       当前场景下每个 namespace 的 token 数量极少（激活码一般 < 10 个），可安全使用
 * @returns token 标识数组
 */
export async function listTempTokens(namespace: string): Promise<string[]> {
  const redis = await getRedis();
  const pattern = makePattern(namespace);
  const keys = await redis.keys(pattern);
  // 从 key 中提取 token 部分: temp_token:{namespace}:{token} → token
  const prefix = `${KEY_PREFIX}:${namespace}:`;
  return keys.map((k: string) => k.slice(prefix.length));
}

/**
 * 获取指定命名空间下所有 token 及其数据
 * @returns Map<token, data>
 */
export async function listTempTokensWithData(
  namespace: string,
): Promise<Map<string, Record<string, any>>> {
  const redis = await getRedis();
  const pattern = makePattern(namespace);
  const keys = await redis.keys(pattern);
  const result = new Map<string, Record<string, any>>();
  if (keys.length === 0) return result;

  const rawAll = await redis.mGet(keys);
  const prefix = `${KEY_PREFIX}:${namespace}:`;
  keys.forEach((key: string, i: number) => {
    const token = key.slice(prefix.length);
    const raw = rawAll[i];
    if (raw) {
      try {
        result.set(token, JSON.parse(raw));
      } catch {
        // 忽略解析失败的
      }
    }
  });
  return result;
}
