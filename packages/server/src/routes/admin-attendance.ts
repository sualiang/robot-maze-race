import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================================
// Admin Attendance 路由 — 全局考勤管理（仅 admin 角色）
// ============================================================

function adminOnly(req: Request, res: Response, next: Function): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ code: 403, message: '仅管理员可操作', data: null });
    return;
  }
  next();
}

/**
 * GET /api/v1/admin/attendance
 * 全局考勤记录查询
 *
 * Query params:
 *   start_date   - YYYY-MM-DD
 *   end_date     - YYYY-MM-DD
 *   operator_id  - 运营商 ID（对应 venues.operator_id 关联 users）
 *   venue_id     - 赛场 ID
 *   page / pageSize
 */
router.get('/', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const {
      start_date,
      end_date,
      operator_id,
      venue_id,
      page: pageStr = '1',
      pageSize: pageSizeStr = '20',
    } = req.query;

    const page = Math.max(1, parseInt(pageStr as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push(`a.checkin_at >= $${params.length + 1}`);
      params.push(`${start_date} 00:00:00`);
    }
    if (end_date) {
      conditions.push(`a.checkin_at <= $${params.length + 1}`);
      params.push(`${end_date} 23:59:59`);
    }
    if (venue_id) {
      conditions.push(`a.venue_id = $${params.length + 1}`);
      params.push(venue_id);
    }
    if (operator_id) {
      conditions.push(`v.operator_id = $${params.length + 1}`);
      params.push(operator_id);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM attendance a
       LEFT JOIN venues v ON v.id = a.venue_id
       ${whereClause}`,
      params.length > 0 ? params : undefined
    );
    const total = countResult?.count || 0;

    const records = await query<any>(
      `SELECT
         a.id,
         COALESCE(u.nickname, rf.id, '未知') as name,
         COALESCE(u.phone, '') as phone,
         COALESCE(v.name, '未知赛场') as venue_name,
         COALESCE(op_user.nickname, '') as operator_name,
         a.checkin_at,
         a.checkout_at,
         CASE
           WHEN a.checkout_at IS NOT NULL
             THEN CAST((julianday(a.checkout_at) - julianday(a.checkin_at)) * 1440 AS INTEGER)
           ELSE 0
         END as duration_minutes,
         a.gps_lat as gps_latitude,
         a.gps_lng as gps_longitude,
         CASE WHEN a.checkout_at IS NULL THEN 'active' ELSE 'finished' END as status
       FROM attendance a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN referees rf ON rf.id = a.referee_id
       LEFT JOIN venues v ON v.id = a.venue_id
       LEFT JOIN users op_user ON op_user.id = v.operator_id
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
    console.error('[AdminAttendance] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取考勤记录失败', data: null });
  }
});

/**
 * GET /api/v1/admin/attendance/export
 * 导出考勤记录为 CSV
 */
router.get('/export', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, operator_id, venue_id } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    if (start_date) {
      conditions.push(`a.checkin_at >= $${params.length + 1}`);
      params.push(`${start_date} 00:00:00`);
    }
    if (end_date) {
      conditions.push(`a.checkin_at <= $${params.length + 1}`);
      params.push(`${end_date} 23:59:59`);
    }
    if (venue_id) {
      conditions.push(`a.venue_id = $${params.length + 1}`);
      params.push(venue_id);
    }
    if (operator_id) {
      conditions.push(`v.operator_id = $${params.length + 1}`);
      params.push(operator_id);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const records = await query<any>(
      `SELECT
         a.id,
         COALESCE(u.nickname, rf.id, '未知') as name,
         COALESCE(u.phone, '') as phone,
         COALESCE(v.name, '未知赛场') as venue_name,
         COALESCE(op_user.nickname, '') as operator_name,
         a.checkin_at,
         a.checkout_at,
         CASE
           WHEN a.checkout_at IS NOT NULL
             THEN CAST((julianday(a.checkout_at) - julianday(a.checkin_at)) * 1440 AS INTEGER)
           ELSE 0
         END as duration_minutes,
         a.gps_lat,
         a.gps_lng
       FROM attendance a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN referees rf ON rf.id = a.referee_id
       LEFT JOIN venues v ON v.id = a.venue_id
       LEFT JOIN users op_user ON op_user.id = v.operator_id
       ${whereClause}
       ORDER BY a.checkin_at DESC`,
      params.length > 0 ? params : undefined
    );

    const header = 'ID,裁判姓名,手机号,所属运营商,赛场,签到时间,签退时间,工作时长(分钟),GPS纬度,GPS经度\n';
    const rows = records.map((r: any) =>
      `"${r.id}","${r.name}","${r.phone}","${r.operator_name}","${r.venue_name}","${r.checkin_at || ''}","${r.checkout_at || ''}",${r.duration_minutes},${r.gps_lat || ''},${r.gps_lng || ''}`
    ).join('\n');

    const csv = '\uFEFF' + header + rows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance-export.csv');
    return res.send(csv);
  } catch (error: any) {
    console.error('[AdminAttendance] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出考勤记录失败', data: null });
  }
});

export default router;
