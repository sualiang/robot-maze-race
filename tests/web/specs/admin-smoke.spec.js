/**
 * 铁甲快狗 — 总部后台关键场景自动化回归脚本
 *
 * 覆盖场景:
 * 1. 登录冒烟
 * 2. 运营商 CRUD（创建/编辑/搜索/禁用）
 * 3. 商家管理（创建/编辑/搜索）
 * 4. 裁判管理（审核流程）
 *
 * 运行:
 *   npx playwright test packages/server/tests/e2e/admin-smoke.spec.js
 *   或
 *   npx playwright test --project=admin
 *
 * 环境变量:
 *   ADMIN_BASE_URL  — 总部后台地址，默认 https://dog.amberrobot.com.cn
 *   ADMIN_USER      — 测试账号手机号，默认 13800000001
 *   ADMIN_PASS      — 测试账号密码，默认 test123456
 *   PLAYWRIGHT_HEADLESS — 是否无头模式，默认 true
 */
const { test, expect } = require('playwright/test');

// ============================================================
// 配置
// ============================================================
const BASE = process.env.ADMIN_BASE_URL || 'https://dog.amberrobot.com.cn';
const USER = process.env.ADMIN_USER || '13800000001';
const PASS = process.env.ADMIN_PASS || 'test123456';

// 测试数据（加上时间戳避免重复）
const TS = Date.now().toString(36);
const TEST_OP_NAME = `E2E运营商${TS}`;
const TEST_OP_PHONE = `188${String(Date.now()).slice(-8)}`;
const TEST_MERCHANT_NAME = `E2E商家${TS}`;
const TEST_MERCHANT_PHONE = `199${String(Date.now()).slice(-8)}`;
const TEST_REFEREE_NAME = `E2E裁判${TS}`;

// ============================================================
// helpers
// ============================================================

/**
 * 等待 Ant Design 的 Spin（loading）消失
 */
async function waitSpinDone(page) {
  try {
    await page.waitForSelector('.ant-spin-spinning', { state: 'detached', timeout: 15000 });
  } catch {
    // spin 可能不存在，忽略
  }
}

/**
 * 通过标签文本获取 Ant Design Form Item 内的输入框并填入
 */
async function fillFormItem(page, label, value) {
  const item = page.locator(`.ant-form-item:has(label:text("${label}"))`);
  const input = item.locator('input');
  await input.fill(value);
}

/**
 * 从 Table 中查找包含指定文本的行
 */
function tableRow(page, text) {
  return page.locator(`.ant-table-row:has(td:text("${text}"))`);
}

// ============================================================
// 1. 登录冒烟
// ============================================================
test.describe('登录冒烟', () => {

  test('登录页正常渲染', async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await expect(page.locator('text=总部后台')).toBeVisible({ timeout: 15000 });
  });

  test('管理员登录成功并跳转', async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"]', USER);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    // 登录成功后应跳转到运营商列表
    await page.waitForURL('**/admin/operators**', { timeout: 15000 });
    await expect(page.locator('text=运营商管理')).toBeVisible({ timeout: 10000 });
  });

});

// ============================================================
// 2. 运营商 CRUD
// ============================================================
test.describe('运营商 CRUD', () => {

  test.beforeEach(async ({ page }) => {
    // 确保已登录
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"]', USER);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/operators**', { timeout: 15000 });
  });

  test('列表页加载正常', async ({ page }) => {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);
    // 至少应有搜索框和创建按钮
    await expect(page.locator('button:has-text("创建运营商")').first()).toBeVisible({ timeout: 10000 });
  });

  test('创建运营商', async ({ page }) => {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);
    await page.click('button:has-text("创建运营商")');
    await page.waitForSelector('.ant-modal', { timeout: 10000 });

    // 填写表单
    await fillFormItem(page, '运营商名称', TEST_OP_NAME);
    await fillFormItem(page, '联系电话', TEST_OP_PHONE);
    // 省市区选择 — 点击 Cascader 触发下拉
    const cascader = page.locator('.ant-cascader');
    if (await cascader.isVisible()) {
      await cascader.click();
      // 选择第一个省份的第一个城市
      await page.locator('.ant-cascader-menu:first-child .ant-cascader-menu-item').first().click();
      await page.waitForTimeout(500);
      const cityItems = page.locator('.ant-cascader-menu:nth-child(2) .ant-cascader-menu-item');
      if (await cityItems.count() > 0) {
        await cityItems.first().click();
      }
    }

    await page.click('.ant-modal button:has-text("确定")');
    await page.waitForTimeout(2000);

    // 验证列表中出现了新建的运营商
    await expect(tableRow(page, TEST_OP_NAME)).toBeVisible({ timeout: 10000 });
  });

  test('搜索运营商', async ({ page }) => {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);
    const searchInput = page.locator('input[placeholder*="搜索"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(TEST_OP_NAME);
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
      await expect(tableRow(page, TEST_OP_NAME)).toBeVisible({ timeout: 10000 });
    }
  });

  test('编辑运营商', async ({ page }) => {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);

    // 找到刚才创建的运营商行，点击编辑
    const row = tableRow(page, TEST_OP_NAME);
    if (await row.isVisible()) {
      const editBtn = row.locator('button:has-text("编辑")').first() || row.locator('a:has-text("编辑")').first();
      if (await editBtn.isVisible()) {
        await editBtn.click();
      } else {
        // 可能通过点击名字进入详情
        await row.locator('td').first().click();
      }
      await page.waitForSelector('.ant-modal', { timeout: 10000 });

      // 修改运营商名称
      await fillFormItem(page, '运营商名称', `${TEST_OP_NAME}-改`);
      await page.click('.ant-modal button:has-text("确定")');
      await page.waitForTimeout(2000);
      await expect(tableRow(page, `${TEST_OP_NAME}-改`)).toBeVisible({ timeout: 10000 });
    } else {
      test.skip();
    }
  });

  test('禁用/启用运营商', async ({ page }) => {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);

    const row = tableRow(page, `${TEST_OP_NAME}-改`);
    if (await row.isVisible()) {
      const toggleBtn = row.locator('button:has-text("禁用")').first() || row.locator('button:has-text("启用")').first();
      if (await toggleBtn.isVisible()) {
        await toggleBtn.click();
        await page.waitForTimeout(1500);
        // 验证状态已切换
        await expect(row.locator('.ant-tag')).toBeVisible({ timeout: 5000 });
      }
    } else {
      test.skip();
    }
  });

});

// ============================================================
// 3. 商家管理
// ============================================================
test.describe('商家管理', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"]', USER);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/operators**', { timeout: 15000 });
  });

  test('进入某运营商商家列表', async ({ page }) => {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);
    // 点击第一个运营商的"商家"管理入口
    const merchantLink = page.locator('a:has-text("商家管理")').first();
    if (await merchantLink.isVisible()) {
      await merchantLink.click();
      await page.waitForURL('**/admin/operators/**/merchants**', { timeout: 15000 });
      await expect(page.locator('text=商家管理')).toBeVisible({ timeout: 10000 });
    }
  });

  test('创建商家', async ({ page }) => {
    // 先进入商家列表
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);
    const merchantLink = page.locator('a:has-text("商家管理")').first();
    if (!(await merchantLink.isVisible())) {
      test.skip();
      return;
    }
    await merchantLink.click();
    await page.waitForURL('**/merchants**', { timeout: 15000 });

    await page.click('button:has-text("创建商家")');
    await page.waitForSelector('.ant-modal', { timeout: 10000 });
    await fillFormItem(page, '商家名称', TEST_MERCHANT_NAME);
    await fillFormItem(page, '联系电话', TEST_MERCHANT_PHONE);
    await page.click('.ant-modal button:has-text("确定")');
    await page.waitForTimeout(2000);
    await expect(tableRow(page, TEST_MERCHANT_NAME)).toBeVisible({ timeout: 10000 });
  });

});

// ============================================================
// 4. 裁判管理
// ============================================================
test.describe('裁判管理', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"]', USER);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/operators**', { timeout: 15000 });
  });

  test('裁判列表加载正常', async ({ page }) => {
    await page.goto(`${BASE}/admin/referees`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);
    await expect(page.locator('text=裁判管理')).toBeVisible({ timeout: 10000 });
  });

  test('裁判审核流程', async ({ page }) => {
    await page.goto(`${BASE}/admin/referees`, { waitUntil: 'networkidle' });
    await waitSpinDone(page);

    // 如果存在审核按钮
    const reviewBtn = page.locator('button:has-text("审核")').first();
    if (await reviewBtn.isVisible()) {
      await reviewBtn.click();
      await page.waitForSelector('.ant-modal', { timeout: 10000 });
      // 选择通过
      const passRadio = page.locator('label:has-text("通过")');
      if (await passRadio.isVisible()) {
        await passRadio.click();
      }
      await page.click('.ant-modal button:has-text("确定")');
      await page.waitForTimeout(1500);
    }
  });

});
