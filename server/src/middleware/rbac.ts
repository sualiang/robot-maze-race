import { Request, Response, NextFunction } from 'express';

/**
 * RBAC 权限校验中间件
 *
 * 用法: router.get('/operators', authMiddleware, checkPermission('operators:list'), handler)
 *
 * 超级管理员（permissions 包含 "*"）直接放行
 * required 为 null/undefined 时放行（允许未配置权限的路由）
 */
export function checkPermission(required: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 未配置权限要求 => 放行
    if (!required) {
      next();
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({ code: 401, message: '未登录，请先授权', data: null });
      return;
    }

    const permissions = user.permissions;

    // 超级管理员 — 拥有所有权限
    if (permissions && permissions.includes('*')) {
      next();
      return;
    }

    // 检查 specific permission
    if (permissions && permissions.includes(required)) {
      next();
      return;
    }

    res.status(403).json({ code: 403, message: `权限不足：需要 ${required} 权限`, data: null });
  };
}
