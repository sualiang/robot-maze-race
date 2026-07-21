import { createClient } from 'redis';
import { config } from '../config';

let redisClient: ReturnType<typeof createClient> | null = null;

/** 获取 Redis 客户端（单例） */
export async function getRedis(): Promise<ReturnType<typeof createClient>> {
  if (!redisClient) {
    redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
    });

    await redisClient.connect();
  }
  return redisClient;
}
