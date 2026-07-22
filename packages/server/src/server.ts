import app from './index';
import http from 'http';
import { config } from './config';
import { setupWebSocket } from './ws/handler';
import { initVenueCache, startRaceTimeoutChecker } from './routes/referees';

const PORT = config.port || 3000;
const server = http.createServer(app);

// WebSocket 服务
setupWebSocket(server);

// 初始化赛场缓存（从 MySQL 加载）
initVenueCache().then(() => {
  console.log('📍 赛场缓存已初始化');
});

// 启动服务端超时兜底检查（自动结束超时比赛）
startRaceTimeoutChecker();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🐕 机器狗竞速赛事服务已启动 http://localhost:${PORT}`);
  console.log(`   环境: ${config.nodeEnv}`);
  console.log(`   API: http://localhost:${PORT}/api/v1/health`);
  console.log(`   WS: ws://localhost:${PORT}/ws/screen`);
});

export default server;
