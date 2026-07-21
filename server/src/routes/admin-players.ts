import { Router, Request, Response } from 'express';
import { query, queryOne, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();

// ============================================================
// Admin Players 路由 — 玩家管理（RBAC 权限控制）
// ============================================================

interface PlayerRow {
  id: string;
  nickname: string | null;
  phone: string | null;
  gender: string | null;
  age: number | null;
  avatar_url: string | null;
  subscribe_venue_id: string | null;
  subscribe_venue_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
  race_count: number;
  best_score_ms: number | null;
  created_at: string;
}

/**
 * GET /api/v1/admin/players
 * 分页获取玩家列表，支持搜索/筛选/CSV导出
 *
 * 查询参数：
 *   page       — 页码（默认1）
 *   pageSize   — 每页数量（默认20）
 *   scope      — "direct" 总部直属 / "operator" 运营商玩家
 *   keyword    — 搜索昵称/手机号
 *   operator_id — 按运营商筛选（scope=operator 时可选）
 *   export     — "csv" 时返回 CSV 文件
 */
router.get('/', authMiddleware, checkPermission('players:list'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const offset = (page - 1) * pageSize;
    const scope = req.query.scope as string | undefined;
    const keyword = req.query.keyword as string | undefined;
    const operatorId = req.query.operator_id as string | undefined;
    const exportCsv = req.query.export === 'csv';

    const conditions: string[] = [];
    const params: any[] = [];

    // scope 筛选
    if (scope === 'direct') {
      conditions.push('u.subscribe_venue_id IS NULL');
    } else if (scope === 'operator') {
      conditions.push('u.subscribe_venue_id IS NOT NULL');
    }

    // 关键字搜索（昵称或手机号）
    if (keyword && keyword.trim()) {
      conditions.push('(u.nickname LIKE $' + (params.length + 1) + ' OR u.phone LIKE $' + (params.length + 2) + ')');
      const kw = '%' + keyword.trim() + '%';
      params.push(kw, kw);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 构建基础查询（不 JOIN 跨库表，venue_name/operator_name 返回 NULL）
    const fromClause = `FROM users u`;

    // 计数
    const countResult = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total ${fromClause} ${whereClause}`,
      params.length > 0 ? params : undefined
    );
    const total = countResult?.total || 0;

    // 查询字段（不 JOIN 跨库表，venue_name/operator_name 置 NULL）
    const selectFields = `u.id, u.nickname, u.phone, u.gender, u.age, u.avatar_url,
      u.subscribe_venue_id,
      NULL AS subscribe_venue_name,
      NULL AS operator_id,
      NULL AS operator_name,
      u.race_count, u.best_score_ms, u.created_at`;

    // CSV 导出
    if (exportCsv) {
      const rows = await query<PlayerRow>(
        `SELECT ${selectFields} ${fromClause} ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT 10000`,
        params.length > 0 ? params : undefined
      );

      // UTF-8 BOM + CSV 内容
      const BOM = '\uFEFF';
      const header = '玩家ID,昵称,手机号,性别,年龄,归属赛场,归属运营商,参赛次数,最佳成绩(秒),注册时间';
      const lines = rows.map(r => {
        const bestScoreSec = r.best_score_ms != null ? (r.best_score_ms / 1000).toFixed(2) : '';
        const age = r.age != null ? String(r.age) : '';
        return [
          escapeCsvField(r.id),
          escapeCsvField(r.nickname || ''),
          escapeCsvField(r.phone || ''),
          escapeCsvField(r.gender || ''),
          age,
          escapeCsvField(r.subscribe_venue_name || ''),
          escapeCsvField(r.operator_name || ''),
          r.race_count,
          bestScoreSec,
          r.created_at ? r.created_at.substring(0, 10) : '',
        ].join(',');
      });

      const csvContent = BOM + header + '\n' + lines.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="players.csv"');
      return res.send(csvContent);
    }

    // 分页查询
    const list = await query<PlayerRow>(
      `SELECT ${selectFields} ${fromClause} ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return res.json({
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
      },
    });
  } catch (error: any) {
    console.error('[AdminPlayers] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取玩家列表失败', data: null });
  }
});

/**
 * 转义 CSV 字段（包裹含逗号/引号/换行符的字段）
 */
function escapeCsvField(value: any): string {
  const str = String(value == null ? '' : value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * GET /api/v1/admin/players/export
 * 导出玩家列表为 CSV — players:list
 */
router.get('/export', authMiddleware, checkPermission('players:list'), async (req: Request, res: Response) => {
  try {
    const players = await query<any>(
      `SELECT p.* FROM player_profiles p ORDER BY p.created_at DESC LIMIT 5000`
    );
    // Render simple CSV and return
    let csv = 'id,user_id,nickname,level,points,balance,status,created_at\n';
    for (const p of players) {
      csv += `${p.id},${p.user_id},${p.nickname || ''},${p.level},${p.points},${p.balance},${p.status},${p.created_at}\n`;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="players-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    console.error('[AdminPlayers] export error:', error.message);
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

export default router;
