import { Router, Request, Response } from 'express';
import { query, queryOne, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/rbac';

const router = Router();

// ============================================================
// Operator Players 路由 — 运营商旗下玩家管理
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
  race_count: number;
  best_score_ms: number | null;
  created_at: string;
}

/**
 * GET /api/v1/operator/players
 * 分页获取本运营商旗下玩家列表
 *
 * 查询参数：
 *   page     — 页码（默认1）
 *   pageSize — 每页数量（默认20）
 *   keyword  — 搜索昵称/手机号
 *   export   — "csv" 时返回 CSV 文件
 *
 * 数据隔离：从 auth 中间件的 userId 获取运营商ID（operator 登录时
 * userId 即为 operators.id），只查询 subscribe_venue_id 对应的
 * venue.operator_id = 该运营商 的玩家
 */
router.get('/', authMiddleware, checkPermission('players:list'), async (req: Request, res: Response) => {
  try {
    // 从 auth 中间件获取运营商 ID（operator 登录时使用）
    const operatorId = req.user?.userId;
    if (!operatorId) {
      return res.status(403).json({ code: 403, message: '非运营商账号，无权限', data: null });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
    const offset = (page - 1) * pageSize;
    const keyword = req.query.keyword as string | undefined;
    const exportCsv = req.query.export === 'csv';

    // 基础条件：只查属于本运算符旗下场馆的玩家
    const conditions: string[] = ['v.operator_id = $1'];
    const params: any[] = [operatorId];

    // 关键字搜索
    if (keyword && keyword.trim()) {
      conditions.push('(u.nickname LIKE $' + (params.length + 1) + ' OR u.phone LIKE $' + (params.length + 2) + ')');
      const kw = '%' + keyword.trim() + '%';
      params.push(kw, kw);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // 基础 FROM 子句
    const fromClause = `FROM users u
      INNER JOIN venues v ON u.subscribe_venue_id = v.id
      LEFT JOIN operators o ON v.operator_id = o.id`;

    // 计数
    const countResult = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total ${fromClause} ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // 查询字段
    const selectFields = `u.id, u.nickname, u.phone, u.gender, u.age, u.avatar_url,
      u.subscribe_venue_id,
      v.name AS subscribe_venue_name,
      u.race_count, u.best_score_ms, u.created_at`;

    // CSV 导出
    if (exportCsv) {
      const rows = await query<PlayerRow>(
        `SELECT ${selectFields} ${fromClause} ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT 10000`,
        params
      );

      const BOM = '\uFEFF';
      const header = '玩家ID,昵称,手机号,性别,年龄,归属赛场,参赛次数,最佳成绩(秒),注册时间';
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
          r.race_count,
          bestScoreSec,
          r.created_at ? r.created_at.substring(0, 10) : '',
        ].join(',');
      });

      const csvContent = BOM + header + '\n' + lines.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="operator-players.csv"');
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
    console.error('[OperatorPlayers] list error:', error.message);
    return res.status(500).json({ code: 500, message: '获取玩家列表失败', data: null });
  }
});

/**
 * 转义 CSV 字段
 */
function escapeCsvField(value: any): string {
  const str = String(value == null ? '' : value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export default router;
