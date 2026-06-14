import app from './index';
import http from 'http';
import { config } from './config';
import { setupWebSocket } from './ws/handler';

const PORT = config.port || 3000;
const server = http.createServer(app);

// WebSocket 服务
setupWebSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🐕 机器狗竞速赛事服务已启动 http://localhost:${PORT}`);
  console.log(`   环境: ${config.nodeEnv}`);
  console.log(`   API: http://localhost:${PORT}/api/v1/health`);
  console.log(`   WS: ws://localhost:${PORT}/ws/screen`);
});

export default server;
