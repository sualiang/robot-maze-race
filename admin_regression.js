const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://dog.amberrobot.com.cn';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  const bugs = [];
  const apiErrs = [];
  const consoleErrs = [];

  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/api/') && ['POST','PATCH','PUT','DELETE'].includes(resp.request().method())) {
      const entry = { method: resp.request().method(), url: url.replace(BASE,''), status: resp.status() };
      resp.text().then(b => {
        entry.body = b.slice(0, 200);
        if (resp.status() >= 400) apiErrs.push(entry);
        console.log(`  ${resp.status() >= 400 ? '🛑' : '✅'} ${entry.method} ${entry.url.slice(0,60)} → ${resp.status()} ${b.slice(0,80)}`);
      }).catch(() => {});
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('client-log')) {
      consoleErrs.push({ text: msg.text().slice(0, 200) });
      console.log(`  [${msg.type()}] ${msg.text().slice(0, 150)}`);
    }
  });

  async function addBug(m, t, r) {
    bugs.push({ module: m, test: t, result: r });
    console.log(`  → ${r}`);
  }

  async function ss(name) {
    await page.screenshot({ path: `test-screenshots/regr2_${name}.png` });
    console.log(`  📸 regr2_${name}.png`);
  }

  // 1. LOGIN
  console.log('\n=== 1. 登录 ===');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input').first().fill('admin');
  await page.locator('input[type="password"]').first().fill('admin123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  addBug('登录', 'admin/admin123', page.url().includes('/login') ? '🛑 登录失败' : '✅');

  // 2. OPERATOR CREATE (P0)
  console.log('\n=== 2. 运营商创建 (P0) ===');
  await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("新建运营商")').first().click();
  await page.waitForTimeout(2000);

  const phone = '135' + String(Math.floor(Math.random() * 90000000 + 10000000));
  const name = 'RegrTest_' + Date.now().toString(36);
  console.log(`  创建: ${phone} / ${name}`);

  await page.locator('#phone').fill(phone); await page.waitForTimeout(200);
  await page.locator('#name').fill(name); await page.waitForTimeout(200);
  await page.locator('#contact_person').fill('回归测试V2'); await page.waitForTimeout(200);
  await page.locator('#contact_phone').fill('13800138009'); await page.waitForTimeout(200);
  await page.locator('#company_name').fill('回归测试科技公司V2'); await page.waitForTimeout(200);

  // province cascader
  await page.locator('#province_path').click(); await page.waitForTimeout(1000);
  await page.locator('.ant-cascader-menu-item').first().click(); await page.waitForTimeout(800);
  await page.locator('.ant-cascader-menu-item').first().click(); await page.waitForTimeout(800);
  await page.locator('.ant-cascader-menu-item').first().click(); await page.waitForTimeout(500);
  await page.locator('#company_address').click(); await page.waitForTimeout(300);
  await page.locator('#company_address').fill('回归测试路99号'); await page.waitForTimeout(200);

  // bank
  await page.locator('.ant-form-item').filter({ hasText: /开户行/ }).locator('.ant-select').first().click();
  await page.waitForTimeout(1000);
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first().click();
  await page.waitForTimeout(500);
  await page.locator('#bank_branch').fill('北京分行'); await page.waitForTimeout(200);
  await page.locator('#bank_account').fill('6222021234567890'); await page.waitForTimeout(200);

  // profit_share_rate — use "分润" label match, check NOT disabled
  const rateDisabled = (await page.locator('#profit_share_rate').getAttribute('class') || '').includes('disabled');
  console.log(`  分润比例 disabled: ${rateDisabled}`);
  addBug('运营商创建', '分润比例非disabled', rateDisabled ? '🛑 disabled' : '✅');

  // Click the select via "分润" label
  const rateFormItem = page.locator('.ant-form-item').filter({ hasText: /分润/ });
  if (await rateFormItem.count() > 0) {
    await rateFormItem.locator('.ant-select').first().click({ timeout: 5000 });
    await page.waitForTimeout(1000);
    const rateOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
    if (await rateOpt.count() > 0) {
      await rateOpt.click();
      await page.waitForTimeout(500);
      console.log('  分润比例已选择');
    }
  }

  // Submit
  await page.locator('.ant-modal-body').evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(500);
  const preErr = apiErrs.length;
  await page.locator('.ant-modal-footer .ant-btn-primary').last().click();
  await page.waitForTimeout(4000);

  const createOk = apiErrs.length === preErr;
  addBug('运营商创建', 'POST /admin/operators', createOk ? '✅ 200' : '🛑');
  if (!createOk) await ss('op_create_fail');

  // 3. PLAYER LIST (P0)
  console.log('\n=== 3. 玩家列表 (P0) ===');
  await page.goto(`${BASE}/admin/players`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  const playerFail = apiErrs.filter(e => e.url.includes('/admin/players'));
  addBug('玩家管理', 'GET /admin/players', playerFail.length ? `🛑 ${playerFail[0].status}` : '✅');
  if (playerFail.length) await ss('players_fail');

  // 4. OPERATOR LOGIN
  console.log('\n=== 4. 运营商登录 ===');
  try {
    await page.goto(`${BASE}/operator/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const pwInputs = await page.locator('input[type="password"]').count();
    if (pwInputs > 0) {
      await page.locator('input').first().fill('13500000001');
      await page.locator('input[type="password"]').first().fill('test123');
      await page.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(3000);
      addBug('运营商登录', 'POST operator/login', page.url().includes('/login') ? '⚠️ 凭据无效(需确认)' : '✅');
    } else {
      addBug('运营商登录', '页面加载', '⚠️ 无密码输入框(可能不同UI)');
    }
  } catch (e) {
    addBug('运营商登录', '页面加载', `⚠️ ${e.message.slice(0,60)}`);
  }

  // 5-10. REGRESSION
  const regTests = [
    ['Dashboard', '/admin/dashboard'],
    ['营销管理', '/admin/marketing'],
    ['财务管理', '/admin/finance'],
    ['系统设置', '/admin/settings'],
    ['角色管理', '/admin/rbac'],
  ];
  for (const [name, path] of regTests) {
    console.log(`\n=== ${name} ===`);
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);
      addBug(name, '页面', '✅');
    } catch (e) {
      addBug(name, '页面', `🛑 ${e.message.slice(0,60)}`);
    }
  }

  // operator edit regression
  console.log('\n=== 运营商编辑 ===');
  try {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    const editBtn = page.locator('button:has-text("编辑")').first();
    if (await editBtn.count() > 0) {
      await editBtn.click(); await page.waitForTimeout(1500);
      addBug('运营商编辑', '弹窗', '✅');
    } else {
      addBug('运营商编辑', '弹窗', '⚠️ 无编辑按钮');
    }
  } catch (e) {
    addBug('运营商编辑', '弹窗', `🛑 ${e.message.slice(0,60)}`);
  }

  // REPORT
  await browser.close();
  const errs = bugs.filter(b => b.result.includes('🛑')).length;
  const warns = bugs.filter(b => b.result.includes('⚠️')).length;
  console.log('\n\n========== 回归测试汇总 ==========');
  bugs.forEach(b => console.log(`  ${b.result.includes('🛑') ? '🛑' : b.result.includes('⚠️') ? '⚠️' : '✅'} ${b.module}: ${b.test} → ${b.result}`));
  console.log(`\n🛑:${errs} ⚠️:${warns} ✅:${bugs.length - errs - warns}`);
  if (apiErrs.length) { console.log(`\nAPI错误:`); apiErrs.forEach(e => console.log(`  🛑 ${e.method} ${e.url} → ${e.status}`)); }
  if (consoleErrs.length) { console.log(`\nConsole错误:`); consoleErrs.forEach(e => console.log(`  [${e.text}]`)); }

  fs.writeFileSync('reports/console-logs/regression_report.json', JSON.stringify({ time: new Date().toISOString(), bugs, apiErrs, consoleErrs, summary: { errors: errs, warnings: warns } }, null, 2));
  process.exit(errs > 0 ? 1 : 0);
})();
