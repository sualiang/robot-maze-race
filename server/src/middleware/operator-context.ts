import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis';

// Redis key prefix: operator_context:{userId}
const CTX_PREFIX = 'operator_context:';

interface OperatorContext {
  operator_id: string;
  venue_id?: string;
}

/**
 * 从 Redis 获取当前用户的运营商上下文
 */
export async function getOperatorContext(userId: string): Promise<OperatorContext | null> {
  try {
    const redis = await getRedis();
    const raw = await redis.get(`${CTX_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as OperatorContext;
  } catch {
    return null;
  }
}

/**
 * 将用户-运营商上下文写入 Redis
 * @param ttlSeconds 过期时间，默认 7 天（小程序登录态有效期）
 */
export async function setOperatorContext(
  userId: string,
  operatorId: string,
  venueId?: string,
  ttlSeconds = 7 * 24 * 60 * 60,
): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(
      `${CTX_PREFIX}${userId}`,
      JSON.stringify({ operator_id: operatorId, venue_id: venueId }),
      { EX: ttlSeconds },
    );
  } catch (err) {
    console.error('[OperatorContext] Failed to store context:', err);
  }
}

// 扩展 Express Request，共享 operatorId（与 auth 中间件不冲突）
declare global {
  namespace Express {
    interface Request {
      /** 当前请求的运营商 ID，由 operator-context 中间件注入 */
      operatorId?: string;
    }
  }
}

/**
 * 运营商上下文中间件
 *
 * 优先级：
 *   1. JWT 中有 operatorId → 运营商/admin 用户 → 直接使用
 *   2. Redis Session 中有 operator_context:{userId} → 玩家带参扫码 → 使用
 *   3. 都没有 → 返回 400（operator 必须模式）
 *
 * 用法：router.get('/xxx', authMiddleware, operatorContextRequired, handler)
 */
export function operatorContextRequired(req: Request, res: Response, next: NextFunction): void {
  // 优先级 1: JWT 中已有 operatorId（运营商/admin 用户）
  const jwtOperatorId = (req.user as any)?.operatorId;
  if (jwtOperatorId) {
    req.operatorId = jwtOperatorId;
    next();
    return;
  }

  // 优先级 2: 从 Redis Session 获取
  const userId = req.user?.userId || (req.user as any)?.userId;
  if (!userId) {
    // 没有用户上下文 → 拒绝
    res.status(401).json({ code: 401, message: '请先登录', data: null });
    return;
  }

  getOperatorContext(userId)
    .then((ctx) => {
      if (!ctx?.operator_id) {
        res.status(400).json({
          code: 400,
          message: '请先通过赛场小程序码进入，获取运营商上下文',
          data: null,
        });
        return;
      }
      req.operatorId = ctx.operator_id;
      next();
    })
    .catch(() => {
      res.status(500).json({ code: 500, message: '获取运营商上下文失败', data: null });
    });
}
