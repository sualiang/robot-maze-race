import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthPayload {
  userId: string;
  openid: string;
  role: string;
  admin_role_id?: string;
  admin_role_name?: string;
  permissions?: string[];
  operatorId?: string;
  operator_name?: string;
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * JWT 认证中间件
 * 从 Authorization header 中提取 Bearer token
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      code: 401,
      message: '未登录，请先授权',
      data: null,
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.user = payload;
    next();
  } catch (error: any) {
    const message =
      error.name === 'TokenExpiredError'
        ? '登录已过期，请重新登录'
        : '无效的登录凭证';
    res.status(401).json({
      code: 401,
      message,
      data: null,
    });
  }
}

/**
 * 可选认证中间件
 * 有 token 就解析，没有也放行
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
      req.user = payload;
    } catch {
      // 忽略无效 token
    }
  }
  next();
}
