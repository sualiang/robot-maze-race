/**
 * 共享工具函数
 */
import { queryOne } from './database';

/**
 * 从 system_config 表读取配置值
 * @param key 配置键名
 * @param defaultVal 默认值（不存在时返回）
 */
export async function getConfig(key: string, defaultVal: string = ''): Promise<string> {
  try {
    const row = await queryOne<{ value: string }>(
      `SELECT value FROM system_config WHERE key = $1`,
      [key]
    );
    return row?.value ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

/**
 * 从 system_config 表读取配置并转为整数
 */
export async function getConfigInt(key: string, defaultVal: number = 0): Promise<number> {
  const val = await getConfig(key, String(defaultVal));
  return parseInt(val, 10) || defaultVal;
}
