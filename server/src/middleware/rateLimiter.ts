import { Request, Response, NextFunction } from 'express';

/**
 * 简单的内存限流中间件
 *
 * #19 规则：同一 IP 每分钟最多 N 次请求
 *
 * 生产环境应替换为 Redis 实现。
 * 但内存方案适合单进程开发和测试。
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, RateLimitEntry>();

// 每分钟清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipMap.entries()) {
    if (entry.resetAt <= now) {
      ipMap.delete(ip);
    }
  }
}, 60_000);

/**
 * 创建基于 IP 的速率限制中间件
 *
 * @param maxRequests 窗口内最大请求数（默认 10）
 * @param windowMs 时间窗口长度（毫秒，默认 60_000 = 1 分钟）
 */
export function rateLimiter(maxRequests = 10, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 测试环境下跳过限流
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = ipMap.get(ip);

    if (!entry || entry.resetAt <= now) {
      // 新窗口
      entry = { count: 1, resetAt: now + windowMs };
      ipMap.set(ip, entry);
      next();
      return;
    }

    entry.count++;

    if (entry.count > maxRequests) {
      res.status(429).json({
        code: 429,
        message: '操作太频繁，请稍后再试',
        data: null,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}
