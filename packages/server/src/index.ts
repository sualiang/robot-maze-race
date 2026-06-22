import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import http from 'http';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger, responseTime } from './middleware/logger';
import { config } from './config';
import { initSchema } from './config/database';
import { setupWebSocket } from './ws/handler';

// 路由
import authRoutes from './routes/auth';
import operatorRoutes from './routes/operator';
import userRoutes from './routes/users';
import venueRoutes from './routes/venues';
import refereeRoutes from './routes/referees';
import racePackageRoutes from './routes/race-packages';
import playerRoutes from './routes/player';
import adminOperatorRoutes from './routes/admin-operators';
import adminFinanceRoutes from './routes/admin-finance';
import adminMarketingRoutes from './routes/admin-marketing';
import adminSettingsRoutes from './routes/admin-settings';
import operatorFinanceRoutes from './routes/operator-finance';
import operatorMarketingRoutes from './routes/operator-marketing';
import attendanceRoutes from './routes/attendance';
import adminAttendanceRoutes from './routes/admin-attendance';
import adminDashboardRoutes from './routes/admin-dashboard';
import adminRbacRoutes from './routes/admin-rbac';
import adminBanksRoutes from './routes/admin-banks';
import adminMapsRoutes from './routes/admin-maps';
import raceRoutes from './routes/race';
import clientLogRoutes from './routes/client-log';
import adminPlayersRouter from './routes/admin-players';
import operatorPlayersRouter from './routes/operator-players';
import seasonRoutes from './routes/season';
import pointsRoutes from './routes/points';
import merchantRoutes from './routes/merchant';
import merchantAuthRoutes from './routes/merchant-auth';
import merchantCouponRoutes from './routes/merchant-coupon';
import merchantVerifyRoutes from './routes/merchant-verify';
import operatorMerchantRoutes from './routes/operator-merchant';
import rankRoutes from './routes/rank';
import prizeRoutes from './routes/prize';
import taskRoutes from './routes/task';
import adminSeasonRoutes from './routes/admin-season';
import adminMerchantRoutes from './routes/admin-merchant';
import adminPrizeRoutes from './routes/admin-prize';
import adminTaskRoutes from './routes/admin-task';
import uploadRoutes from './routes/upload';

const app = express();
const PORT = config.port || 3000;

// ============================================================
// 初始化数据库（启动时自动建表）
// ============================================================
initSchema();

// ============================================================
// 基础中间件
// ============================================================
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(logger);
app.use(responseTime);

// ============================================================
// 健康检查
// ============================================================
app.get('/api/v1/health', (_req, res) => {
  res.json({
    code: 0,
    message: 'ok',
    data: {
      status: 'running',
      version: '1.0.0',
      env: config.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================
// API 路由挂载
// ============================================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/venues', venueRoutes);
app.use('/api/v1/referees', refereeRoutes);
app.use('/api/v1/race-packages', racePackageRoutes);
app.use('/api/v1/packages', racePackageRoutes); // alias for frontend compatibility
app.use('/api/v1/player', playerRoutes);
app.use('/api/v1/admin/operators', adminOperatorRoutes);
app.use('/api/v1/admin/finance', adminFinanceRoutes);
app.use('/api/v1/admin/marketing', adminMarketingRoutes);
app.use('/api/v1/admin/settings', adminSettingsRoutes);
app.use('/api/v1/operator/finance', operatorFinanceRoutes);
app.use('/api/v1/operator/marketing', operatorMarketingRoutes);
app.use('/api/v1/operator', operatorRoutes);
app.use('/api/v1/operator', raceRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/admin/attendance', adminAttendanceRoutes);
app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
app.use('/api/v1/admin/rbac', adminRbacRoutes);
app.use('/api/v1/admin/banks', adminBanksRoutes);
app.use('/api/v1/admin/maps', adminMapsRoutes);

app.use('/api/v1/admin/players', adminPlayersRouter);
app.use('/api/v1/operator/players', operatorPlayersRouter);

// V2.0 路由
app.use('/api/v1/rank', rankRoutes);
app.use('/api/v1/season', seasonRoutes);
app.use('/api/v1/points', pointsRoutes);
app.use('/api/v1/prize', prizeRoutes);
// 注意：merchant-coupon 和 merchant-verify 必须先注册（有更具体的路径）
// merchantRoutes（玩家端卡包）在最后注册，避免被 `/coupon` 前缀抢占
app.use('/api/v1/merchant/auth', merchantAuthRoutes);
app.use('/api/v1/merchant/coupon', merchantCouponRoutes);
app.use('/api/v1/merchant/verify', merchantVerifyRoutes);
app.use('/api/v1/player', merchantRoutes);
app.use('/api/v1/merchant/verify', merchantVerifyRoutes);
app.use('/api/v1/operator', operatorMerchantRoutes);
app.use('/api/v1/task', taskRoutes);
app.use('/api/v1/admin/season', adminSeasonRoutes);
app.use('/api/v1/admin/merchant', adminMerchantRoutes);
app.use('/api/v1/admin/prize', adminPrizeRoutes);
app.use('/api/v1/admin/task', adminTaskRoutes);

// 参赛抵扣金
import entryDeductionsRoutes from './routes/entry-deductions';
app.use('/api/v1/entry-deductions', entryDeductionsRoutes);

// 积分商城
import pointsShopRoutes from './routes/points-shop';
app.use('/api/v1', pointsShopRoutes);

// 上传（商家 Logo 等）
app.use('/api/v1/upload', uploadRoutes);

// 静态文件（上传目录）
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 客户端错误日志（无需鉴权）
app.use('/api/v1', clientLogRoutes);

// 首页公告栏
import announcementRoutes from './routes/announcement';
app.use('/api/v1/announcement', announcementRoutes);

// ============================================================
// 404 和全局错误处理
// ============================================================
app.use('/api/*', notFoundHandler);
app.use(errorHandler);

// ============================================================
// 导出 app（由 server.ts 启动）
// ============================================================

export default app;
