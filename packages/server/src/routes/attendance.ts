import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// Attendance 路由 — 考勤记录（需要认证）
// ============================================================

/**
 * GET /api/v1/attendance
 * 考勤记录列表（支持分页、赛场筛选、用户筛选）
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      venue_id,
      user_id,
      date_from,
      date_to,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;
    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    // Operator isolation: non-admin sees only own data
    if (req.user?.role !== 'admin') {
      const opId = (req.user as any)?.operatorId || '';
      if (opId) {
        conditions.push('a.operator_id = $' + (params.length + 1));
        params.push(opId);
      }
    }

    if (venue_id) {
      conditions.push('a.venue_id = $' + (params.length + 1));
      params.push(venue_id);
    }
    if (user_id) {
      conditions.push('a.user_id = $' + (params.length + 1));
      params.push(user_id);
    }
    if (date_from) {
      conditions.push('a.checkin_at >= $' + (params.length + 1));
      params.push(date_from);
    }
    if (date_to) {
      conditions.push('a.checkin_at <= $' + (params.length + 1));
      params.push(date_to);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM attendance a ${whereClause}`,
      params.length > 0 ? params : undefined
    );
    const total = parseInt(countResult?.count || '0', 10);

    const records = await query<any>(
      `SELECT a.id, a.referee_id, a.user_id, a.venue_id,
              a.checkin_at, a.checkout_at,
              a.created_at,
              u.nickname as user_nickname,
              v.name as venue_name
       FROM attendance a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN venues v ON v.id = a.venue_id
       ${whereClause}
       ORDER BY a.checkin_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        list: records,
        total,
        page,
        pageSize,
      },
    });
  } catch (error: any) {
    console.error('[Attendance] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取考勤记录失败', data: null });
  }
});

/**
 * GET /api/v1/attendance/stats
 * 考勤聚合统计
 */
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Operator filter
    let opFilter = '';
    let opParams: any[] = [];
    if (req.user?.role !== 'admin') {
      const opId = (req.user as any)?.operatorId || '';
      if (opId) {
        opFilter = ' WHERE a.operator_id = $1';
        opParams = [opId];
      }
    }

    // 总人次
    const totalRecords = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM attendance a${opFilter}`,
      opParams.length > 0 ? opParams : undefined
    );

    // 今日签到人次
    const todayRecords = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM attendance a WHERE date(a.checkin_at) = CURDATE()${opFilter ? ' AND a.operator_id = $1' : ''}`,
      opParams.length > 0 ? opParams : undefined
    );

    // 各赛场分布
    const venueDistribution = await query<{
      venue_id: string;
      venue_name: string;
      count: number;
    }>(
      `SELECT a.venue_id, COALESCE(v.name, '未知赛场') as venue_name, COUNT(*) as count
       FROM attendance a
       LEFT JOIN venues v ON v.id = a.venue_id
       ${opFilter ? 'WHERE a.operator_id = $1' : ''}
       GROUP BY a.venue_id
       ORDER BY count DESC`,
      opParams.length > 0 ? opParams : undefined
    );

    return res.json({
      code: 0,
      message: 'ok',
      data: {
        total: parseInt(totalRecords?.count || '0', 10),
        today: parseInt(todayRecords?.count || '0', 10),
        venue_distribution: venueDistribution,
      },
    });
  } catch (error: any) {
    console.error('[Attendance] stats error:', error.message);
    return res.status(500).json({ code: 500, message: '获取考勤统计失败', data: null });
  }
});

export default router;
