import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // shared 包作为 ES module 直接引用（避免 CJS require('./types') 解析失败）
      '@robot-race/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
    fs: {
      allow: [
        // 允许访问 monorepo 根目录和 shared 包
        path.resolve(__dirname, '..'),
      ],
    },
  },
  optimizeDeps: {
    include: ['@robot-race/shared'],
  },
})
