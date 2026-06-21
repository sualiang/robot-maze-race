/**
 * 运营商后台 — 登录+页面截图测试
 * 
 * 运行: npx playwright test tests/web/specs/ --project=operator
 */
const { test, expect } = require('playwright/test');

const BASE = 'http://localhost:5173';
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123',
};

// 需要检查的页面路由列表
const PAGES = [
  { name: 'Dashboard',        path: '/dashboard' },
  { name: '赛场管理',        path: '/venues' },
  { name: '比赛管理',        path: '/races' },
  { name: '用户管理',        path: '/users' },
  { name: '裁判管理',        path: '/referees' },
  { name: '营销中心',        path: '/marketing' },
  { name: '财务中心',        path: '/finance' },
  { name: '角色与成员',      path: '/roles' },
  { name: '个人中心',        path: '/settings' },
];

test.describe('运营商后台 — 首页登录', () => {

  test('登录页正常渲染', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    const title = await page.title();
    expect(title).toBeTruthy();
    // 截图保存
    await page.screenshot({ path: 'screenshots/operator-login.png', fullPage: true });
  });

  test('管理员登录', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    // 填写登录表单（根据实际 Ant Design 表单选择器调整）
    await page.fill('input[id$="username"], input[name="username"], input[type="text"]', ADMIN_CREDENTIALS.username);
    await page.fill('input[id$="password"], input[name="password"], input[type="password"]', ADMIN_CREDENTIALS.password);
    await page.click('button[type="submit"]');
    // 等待跳转
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
    await page.screenshot({ path: 'screenshots/operator-loggedin.png', fullPage: true });
    expect(page.url()).toContain('/dashboard');
  });

});

test.describe('运营商后台 — 页面截图', () => {

  test.beforeEach(async ({ page }) => {
    // 先登录
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[id$="username"], input[name="username"], input[type="text"]', ADMIN_CREDENTIALS.username);
    await page.fill('input[id$="password"], input[name="password"], input[type="password"]', ADMIN_CREDENTIALS.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
  });

  for (const p of PAGES) {
    test(`${p.name} 页面正常渲染`, async ({ page }) => {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
      // 等待页面主体渲染
      await page.waitForSelector('main, .ant-layout-content, #root > *', { timeout: 5000 });
      await page.screenshot({ path: `screenshots/operator-${p.name}.png`, fullPage: true });
      // 检查无白屏：页面有文字内容
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(0);
    });
  }

});
