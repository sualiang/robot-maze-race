// PM2 ecosystem config — 固定端口，防止重启后端口漂移
module.exports = {
  apps: [
    {
      name: 'robot-maze-server',
      script: './dist/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};
