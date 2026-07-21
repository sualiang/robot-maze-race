import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@robot-race/shared';

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void {
  console.error('[Error]', err.message, err.stack);

  // 已知的业务错误（有 status 属性）
  if ('status' in err && typeof (err as any).status === 'number') {
    const status = (err as any).status;
    res.status(status).json({
      code: status,
      message: err.message,
      data: null,
    });
    return;
  }

  // 未知错误
  res.status(500).json({
    code: 500,
    message: process.env.NODE_ENV === 'production'
      ? '服务器内部错误'
      : err.message,
    data: null,
  });
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(_req: Request, res: Response<ApiResponse>): void {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    data: null,
  });
}
