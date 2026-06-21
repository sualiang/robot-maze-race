/**
 * Playwright 测试配置 — 运营商后台/大屏/裁判端/总部
 * 在 hostname: 上跑需要显式禁用代理
 */
const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'operator',    // 运营商后台
      testMatch: '**/operator*.spec.js',
    },
    {
      name: 'referee',     // 裁判端
      testMatch: '**/referee*.spec.js',
    },
    {
      name: 'dashboard',   // 大屏
      testMatch: '**/dashboard*.spec.js',
    },
    {
      name: 'admin',       // 总部
      testMatch: '**/admin*.spec.js',
    },
  ],
});
