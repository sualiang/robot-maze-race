import dotenv from 'dotenv';

// 加载环境变量，优先级：.env.local > .env
dotenv.config({ path: '.env.local' });
dotenv.config();

export const config = {
  // 服务端口
  port: parseInt(process.env.PORT || '3000', 10),

  // 运行环境
  nodeEnv: process.env.NODE_ENV || 'development',

  // 数据库
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'robot_maze_race',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'robot-maze-race-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // 微信小程序
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
  },

  // 是否开发模式
  get isDev(): boolean {
    return this.nodeEnv === 'development';
  },

  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
};
