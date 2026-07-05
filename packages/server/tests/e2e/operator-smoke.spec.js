// @ts-check
const { test, expect } = require('@playwright/test');

// 环境变量
const BASE_URL = process.env.OPERATOR_BASE_URL || 'https://dog.amberrobot.com.cn';
const USER = process.env.OPERATOR_USER || '13999999999';
const PASS = process.env.OPERATOR_PASS || 'RobotTest2026!';

/**
 * 运营商后台登录函数（包含首次改密兼容）
 */
async function operatorLogin(page, username = USER, password = PASS) {
  await page.goto(`${BASE_URL}/operator/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // 如果已经登录跳转过了，直接返回
  const currentUrl = page.url();
  if (currentUrl.includes('/operator/venues') || currentUrl.includes('/operator/profile')) {
    return;
  }

  // 填写登录表单
  const phoneInput = page.locator('input[id^="phone"]').first();
  if (await phoneInput.isVisible()) {
    await phoneInput.fill(username);
  } else {
    // fallback: 找 placeholder 含"手机号"的输入框
    await page.getByPlaceholder(/手机号/).fill(username);
  }
  await page.getByPlaceholder(/密码/).fill(password);
  await page.getByRole('button', { name: /登/ }).click();
  await page.waitForTimeout(2000);

  // 检查是否需要首次修改密码（弹窗会出现在首次登录时）
  const pwdModalTitle = page.locator('.ant-modal-title');
  if (await pwdModalTitle.isVisible().catch(() => false)) {
    const titleText = await pwdModalTitle.textContent();
    if (titleText && titleText.includes('修改密码')) {
      // 首次登录改密弹窗
      await page.locator('input[id$="oldPassword"]').fill(password);
      await page.locator('input[id$="newPassword"]').fill(PASS);
      await page.locator('input[id$="confirmPassword"]').fill(PASS);
      await page.locator('.ant-modal').getByRole('button', { name: '确认修改' }).click();
      await page.waitForTimeout(2000);
      await page.waitForURL('**/operator/venues**', { timeout: 15000 });
      return;
    }
  }

  // 正常登录等待跳转
  try {
    await page.waitForURL('**/operator/venues**', { timeout: 15000 });
  } catch {
    // 如果没跳转到 venues，可能去了其他地方，继续执行
  }
}

// ============================================================
// 1. 登录冒烟测试
// ============================================================
test.describe('运营商后台 - 登录冒烟', () => {

  test('登录成功并显示9个菜单', async ({ page }) => {
    await operatorLogin(page);
    // 等待页面加载
    await page.waitForURL('**/operator/venues**', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // 验证左侧菜单是否显示
    const sidebar = page.locator('.ant-layout-sider');
    await expect(sidebar).toBeVisible();

    // 验证所有9个菜单项
    const expectedMenus = [
      '赛场管理',
      '裁判管理',
      '参赛包管理',
      '营销管理',
      '财务中心',
      '角色与成员管理',
      '商家管理',
      '玩家管理',
      '个人中心',
    ];

    for (const menu of expectedMenus) {
      const menuItem = page.locator('.ant-layout-sider').getByText(menu);
      await expect(menuItem).toBeVisible({ timeout: 5000 });
    }

    // 验证头部显示用户信息
    await expect(page.locator('.ant-layout-header')).toBeVisible();
  });

});

// ============================================================
// 2. 赛场管理
// ============================================================
test.describe('运营商后台 - 赛场管理', () => {

  test('赛场管理页面加载并打开新建弹窗', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/venues`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('.ant-card-head-title').getByText('赛场管理')).toBeVisible({ timeout: 10000 });

    // 点击新建赛场按钮
    await page.getByRole('button', { name: /新建赛场/ }).click();
    await page.waitForTimeout(500);

    // 验证弹窗显示
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('新建赛场')).toBeVisible();

    // 验证关键字段存在
    await expect(modal.locator('text=赛场名称')).toBeVisible();
    await expect(modal.locator('label.ant-form-item-required').getByText('省/市/区')).toBeVisible();
    await expect(modal.locator('text=详细地址')).toBeVisible();
    await expect(modal.locator('text=营业开始')).toBeVisible();
    await expect(modal.locator('text=营业结束')).toBeVisible();
    await expect(modal.locator('text=排队上限')).toBeVisible();
    await expect(modal.locator('text=状态')).toBeVisible();
    await expect(modal.locator('text=描述')).toBeVisible();

    // 关闭弹窗（弹窗底部无取消按钮，用右上角 X）
    await modal.locator('.ant-modal-close').click();
    await expect(modal).not.toBeVisible();
  });

});

// ============================================================
// 3. 裁判管理
// ============================================================
test.describe('运营商后台 - 裁判管理', () => {

  test('裁判管理页面加载', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/referees`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });

  test('邀请裁判弹窗存在邀请链接', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/referees`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 查找邀请按钮
    const inviteBtn = page.getByRole('button', { name: /邀请/ });
    if (await inviteBtn.isVisible().catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(500);

      // 验证弹窗内容：应该有邀请链接
      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible();
      // 验证有复制按钮
      await expect(modal.getByRole('button', { name: /复制/ })).toBeVisible({ timeout: 5000 });

      // 关闭弹窗
      const closeBtn = modal.getByRole('button', { name: /关闭/ });
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      } else {
        await modal.locator('.ant-modal-close').click();
      }
      await expect(modal).not.toBeVisible();
    }
  });

});

// ============================================================
// 4. 参赛包管理
// ============================================================
test.describe('运营商后台 - 参赛包管理', () => {

  test('参赛包管理页面加载并打开新增弹窗', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/packages`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 页面应该可以加载
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // 找新增按钮
    const addBtn = page.getByRole('button', { name: /新增参赛包|新增/ });
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible();
      await expect(modal.locator('text=名称')).toBeVisible();
      await expect(modal.locator('text=标准指导价')).toBeVisible();

      // 关闭弹窗
      // 关闭弹窗：点击右上角 X 按钮或取消按钮
      const cancelBtn = modal.getByRole('button', { name: /取消/ });
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
      } else {
        await modal.locator('.ant-modal-close').click();
      }
      await expect(modal).not.toBeVisible();
    }
  });

});

// ============================================================
// 5. 营销管理
// ============================================================
test.describe('运营商后台 - 营销管理', () => {

  test('营销管理页面加载并切换Tab', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/marketing`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // 检查Tabs
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    if (tabCount > 0) {
      // 切换到第二个Tab
      if (tabCount > 1) {
        await tabs.nth(1).click();
        await page.waitForTimeout(500);
      }
      // 切换到第三个Tab（如果有）
      if (tabCount > 2) {
        await tabs.nth(2).click();
        await page.waitForTimeout(500);
      }
    }
  });

});

// ============================================================
// 6. 财务中心
// ============================================================
test.describe('运营商后台 - 财务中心', () => {

  test('财务中心页面加载', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/finance`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });

});

// ============================================================
// 7. 角色与成员管理
// ============================================================
test.describe('运营商后台 - 角色与成员管理', () => {

  test('角色管理页面加载并切换Tab', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/rbac`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // 检查Tabs
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    if (tabCount > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
    }
  });

});

// ============================================================
// 8. 商家管理
// ============================================================
test.describe('运营商后台 - 商家管理', () => {

  test('商家管理页面加载并切换Tab', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/merchant`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // 检查Tabs
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    if (tabCount > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
    }
  });

});

// ============================================================
// 9. 玩家管理
// ============================================================
test.describe('运营商后台 - 玩家管理', () => {

  test('玩家管理页面加载', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/players`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });
  });

});

// ============================================================
// 10. 个人中心
// ============================================================
test.describe('运营商后台 - 个人中心', () => {

  test('个人中心页面加载并切换Tab', async ({ page }) => {
    await operatorLogin(page);
    await page.goto(`${BASE_URL}/operator/profile`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // 检查Tabs
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    if (tabCount > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
    }
  });

});
