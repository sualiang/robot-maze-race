import { Request, Response, NextFunction } from 'express';

/**
 * 请求日志中间件
 */
export function logger(req: Request, _res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  const { method, url } = req;
  console.log(`[${timestamp}] ${method} ${url}`);
  next();
}

/**
 * 计算请求耗时中间件
 */
export function responseTime(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.url} — ${res.statusCode} (${duration}ms)`);
  });

  next();
}
