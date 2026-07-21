import { Router, Request, Response } from 'express';
import { query, queryOne, queryOp, queryOpOne, executeOp } from '../config/database';
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
 * Helper: 从 common 库批量查 users 名称
 */
async function getUserNames(userIds: string[]): Promise<Map<string, { nickname: string; phone: string }>> {
  const map = new Map<string, { nickname: string; phone: string }>();
  if (userIds.length === 0) return map;
  const ph = userIds.map((_, i) => '$' + (i + 1)).join(',');
  const users = await query<any>(
    `SELECT id, nickname, phone FROM users WHERE id IN (${ph})`,
    userIds
  );
  for (const u of users) {
    map.set(u.id, { nickname: u.nickname || '', phone: u.phone || '' });
  }
  return map;
}

/**
 * Helper: 从 common 库批量查 referees 名称
 */
async function getRefereeNames(refIds: string[]): Promise<Map<string, { name: string; user_id: string }>> {
  const map = new Map<string, { name: string; user_id: string }>();
  if (refIds.length === 0) return map;
  const ph = refIds.map((_, i) => '$' + (i + 1)).join(',');
  const refs = await query<any>(
    `SELECT id, user_id, name FROM referees WHERE id IN (${ph})`,
    refIds
  );
  for (const r of refs) {
    map.set(r.id, { name: r.name || '', user_id: r.user_id || '' });
  }
  return map;
}

/**
 * Helper: 从 common 库查 venues 所属 operator
 */
async function getVenueOperators(venueIds: string[]): Promise<Map<string, { id: string; nickname: string }>> {
  const map = new Map<string, { id: string; nickname: string }>();
  if (venueIds.length === 0) return map;
  const ph = venueIds.map((_, i) => '$' + (i + 1)).join(',');
  const venues = await query<any>(
    `SELECT id, operator_id FROM venues WHERE id IN (${ph})`,
    venueIds
  );
  if (venues.length === 0) return map;
  const opIds = [...new Set(venues.map((v: any) => v.operator_id).filter(Boolean))];
  if (opIds.length > 0) {
    const oph = opIds.map((_, i) => '$' + (i + 1)).join(',');
    const ops = await query<any>(
      `SELECT id, nickname FROM users WHERE id IN (${oph})`,
      opIds
    );
    const opMap = new Map(ops.map((o: any) => [o.id, o.nickname]));
    for (const v of venues) {
      map.set(v.id, { id: v.operator_id, nickname: opMap.get(v.operator_id) || '' });
    }
  }
  return map;
}

/**
 * GET /api/v1/admin/attendance/
 * 考勤列表 — attendance:list
 * 修复: users 在 common 库，attendance + venues 在 operator 库
 */
router.get('/', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const {
      start_date,
      end_date,
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

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // operator 库查 attendance + venues
    const countResult = await queryOpOne<{ count: number }>(req, 
      `SELECT COUNT(*) as count
       FROM attendance a
       LEFT JOIN venues v ON v.id = a.venue_id
       ${whereClause}`,
      params.length > 0 ? params : undefined
    );
    const total = countResult?.count || 0;

    const records = await queryOp<any>(req, 
      `SELECT
         a.id,
         a.user_id,
         a.referee_id,
         a.venue_id,
         COALESCE(v.name, '未知赛场') as venue_name,
         v.operator_id as venue_operator_id,
         a.checkin_at,
         a.checkout_at,
         CASE
           WHEN a.checkout_at IS NOT NULL
             THEN TIMESTAMPDIFF(MINUTE, a.checkin_at, a.checkout_at)
           ELSE 0
         END as duration_minutes,
         a.gps_lat as gps_latitude,
         a.gps_lng as gps_longitude,
         CASE WHEN a.checkout_at IS NULL THEN 'active' ELSE 'finished' END as status
       FROM attendance a
       LEFT JOIN venues v ON v.id = a.venue_id
       ${whereClause}
       ORDER BY a.checkin_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    // common 库补查 users (by user_id)、referees (by referee_id)、venues operator
    const userIds = [...new Set(records.map((r: any) => r.user_id).filter(Boolean))];
    const refIds = [...new Set(records.map((r: any) => r.referee_id).filter(Boolean))];
    const userMap = await getUserNames(userIds);
    const refMap = await getRefereeNames(refIds);
    // venues operator: already have venue_operator_id from queryOp
    const venueOpIds = [...new Set(records.map((r: any) => r.venue_operator_id).filter(Boolean))];
    const opMap = new Map<string, string>();
    if (venueOpIds.length > 0) {
      const ops = await query<any>(
        `SELECT id, nickname FROM users WHERE id IN (${venueOpIds.map((_, i) => '$' + (i + 1)).join(',')})`,
        venueOpIds
      );
      for (const o of ops) {
        opMap.set(o.id, o.nickname || '');
      }
    }

    const list = records.map((r: any) => {
      const user = userMap.get(r.user_id);
      const ref = refMap.get(r.referee_id);
      const refUserId = ref?.user_id || '';
      const refUser = userMap.get(refUserId);
      return {
        ...r,
        name: ref?.name || user?.nickname || '未知',
        phone: user?.phone || refUser?.phone || '',
        operator_name: opMap.get(r.venue_operator_id) || '',
        venue_operator_id: undefined,
      };
    });

    return res.json({
      code: 0,
      message: 'ok',
      data: { list, total, page, pageSize },
    });
  } catch (error: any) {
    console.error('[AdminAttendance] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取考勤记录失败', data: null });
  }
});

/**
 * GET /api/v1/admin/attendance/export
 * 导出考勤记录为 CSV
 * 修复: 无 users JOIN
 */
router.get('/export', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, venue_id } = req.query;

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

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const records = await queryOp<any>(req, 
      `SELECT
         a.id, a.user_id, a.referee_id, a.venue_id,
         v.name as venue_name, v.operator_id as venue_operator_id,
         a.checkin_at, a.checkout_at,
         CASE
           WHEN a.checkout_at IS NOT NULL
             THEN TIMESTAMPDIFF(MINUTE, a.checkin_at, a.checkout_at)
           ELSE 0
         END as duration_minutes,
         a.gps_lat, a.gps_lng
       FROM attendance a
       LEFT JOIN venues v ON v.id = a.venue_id
       ${whereClause}
       ORDER BY a.checkin_at DESC`,
      params.length > 0 ? params : undefined
    );

    // common 库补查
    const userIds = [...new Set(records.map((r: any) => r.user_id).filter(Boolean))];
    const refIds = [...new Set(records.map((r: any) => r.referee_id).filter(Boolean))];
    const userMap = await getUserNames(userIds);
    const refMap = await getRefereeNames(refIds);
    const venueOpIds = [...new Set(records.map((r: any) => r.venue_operator_id).filter(Boolean))];
    const opMap = new Map<string, string>();
    if (venueOpIds.length > 0) {
      const ops = await query<any>(
        `SELECT id, nickname FROM users WHERE id IN (${venueOpIds.map((_, i) => '$' + (i + 1)).join(',')})`,
        venueOpIds
      );
      for (const o of ops) opMap.set(o.id, o.nickname || '');
    }

    const header = 'ID,裁判姓名,手机号,所属运营商,赛场,签到时间,签退时间,工作时长(分钟),GPS纬度,GPS经度\n';
    const rows = records.map((r: any) => {
      const user = userMap.get(r.user_id);
      const ref = refMap.get(r.referee_id);
      const refUserId = ref?.user_id || '';
      const refUser = userMap.get(refUserId);
      return `"${r.id}","${ref?.name || user?.nickname || '未知'}","${user?.phone || refUser?.phone || ''}","${opMap.get(r.venue_operator_id) || ''}","${r.venue_name || ''}","${r.checkin_at || ''}","${r.checkout_at || ''}",${r.duration_minutes},${r.gps_lat || ''},${r.gps_lng || ''}`;
    }).join('\n');

    const csv = '\uFEFF' + header + rows;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    console.error('[AdminAttendance] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

export default router;
