const { chromium } = require('playwright');

const BASE = 'https://dog.amberrobot.com.cn';
const ADMIN = 'admin';
const PASS = 'admin123'; // 运行时从文件读取
const fs = require('fs');
const pwd = fs.readFileSync('/tmp/mypwd.txt', 'utf8').trim() || PASS;

const consoleLog = [];
const apiLog = [];
const bugs = [];

function apiCb(resp) {
  const url = resp.url();
  const method = resp.request().method();
  if (url.includes('/api/') && ['POST','PATCH','PUT','DELETE'].includes(method)) {
    resp.text().then(body => {
      const entry = { method, url: url.replace(BASE,''), status: resp.status(), body: body.slice(0, 200) };
      apiLog.push(entry);
      console.log(`  ${resp.status() >= 400 ? '🛑' : '✅'} ${method} ${entry.url} → ${resp.status()} ${body.slice(0,120)}`);
    }).catch(() => {});
  }
}

function setup(page) {
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLog.push({ type: msg.type(), text: msg.text().slice(0, 300) });
      console.log(`  [${msg.type()}] ${msg.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', err => {
    consoleLog.push({ type: 'pageerror', text: (err.message || String(err)).slice(0, 300) });
    console.log(`  [pageerror] ${err.message?.slice(0,200) || err}`);
  });
  page.on('requestfailed', req => {
    consoleLog.push({ type: 'requestfailed', text: req.url().slice(0, 150) + ': ' + (req.failure()?.errorText || '') });
    console.log(`  [requestfailed] ${req.url().slice(0, 100)}`);
  });
  page.on('response', apiCb);
}

async function screenshotIfBug(page, name) {
  const recent = apiLog.slice(-6);
  const hasErr = recent.some(r => r.status >= 400) || consoleLog.slice(-5).some(c => c.type === 'error' || c.type === 'pageerror');
  if (hasErr) {
    await page.screenshot({ path: `test-screenshots/admin_${name}.png`, fullPage: false });
    console.log(`  📸 Screenshot: admin_${name}.png`);
    return true;
  }
  return false;
}

(async () => {
  fs.mkdirSync('test-screenshots', { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  setup(page);

  // ========== 1. LOGIN ==========
  console.log('\n=== 1. 登录 ===');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  
  // Fill login form
  const userInput = page.locator('input[placeholder*="用户"], input[placeholder*="账号"], input[id*="username"], input[name*="username"]').first();
  const passInput = page.locator('input[type="password"]').first();
  
  if (await userInput.count() > 0) {
    await userInput.fill(ADMIN);
    await passInput.fill(pwd);
    await page.waitForTimeout(300);
    await page.locator('button[type="submit"], button:has-text("登")').first().click();
    await page.waitForTimeout(3000);
  }
  
  // Check if login succeeded
  const currentUrl = page.url();
  const loginOk = !currentUrl.includes('/login');
  bugs.push({ module: '登录', test: 'admin登录', result: loginOk ? '✅' : '🛑 500/401/未跳转', url: currentUrl });
  console.log(`  登录结果: ${loginOk ? '✅ 成功' : '🛑 失败'} → ${currentUrl}`);
  await screenshotIfBug(page, 'login');

  if (!loginOk) {
    console.log('登录失败，终止测试');
    await browser.close();
    // Print report
    printReport();
    return;
  }

  await page.waitForTimeout(2000);
  const startConsole = consoleLog.length;

  // ========== 2. DASHBOARD ==========
  console.log('\n=== 2. Dashboard ===');
  try {
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    const dashHasError = consoleLog.length > startConsole;
    bugs.push({ module: 'Dashboard', test: '页面加载', result: dashHasError ? '⚠️ Console有报错' : '✅' });
    console.log(`  Dashboard 加载完成`);
    await screenshotIfBug(page, 'dashboard');
  } catch(e) {
    bugs.push({ module: 'Dashboard', test: '页面加载', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // ========== 3. 运营商管理 ==========
  console.log('\n=== 3. 运营商管理 ===');
  
  // 3a. 列表
  try {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    console.log('  运营商列表加载完成');
    bugs.push({ module: '运营商管理', test: '列表加载', result: '✅' });
    await screenshotIfBug(page, 'operators_list');
  } catch(e) {
    bugs.push({ module: '运营商管理', test: '列表加载', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // 3b. 新建运营商
  try {
    const addBtn = page.locator('button:has-text("新建"), button:has-text("新增"), button:has-text("添加")').first();
    if (await addBtn.count() > 0 && await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(1500);
      
      // Fill form
      const phone = '138' + String(Math.floor(Math.random() * 90000000 + 10000000));
      const name = 'TestOp_' + Date.now().toString(36);
      
      // Try to fill phone
      const phoneInput = page.locator('.ant-modal input[placeholder*="手机"], .ant-drawer input[placeholder*="手机"], .ant-modal input[id*="phone"], .ant-drawer input[id*="phone"]').first();
      if (await phoneInput.count() > 0) {
        await phoneInput.fill(phone);
        await page.waitForTimeout(300);
      }
      
      // Fill name
      const nameInput = page.locator('.ant-modal input[placeholder*="名称"], .ant-drawer input[placeholder*="名称"], .ant-modal input[id*="name"], .ant-drawer input[id*="name"]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill(name);
        await page.waitForTimeout(300);
      }

      // Submit
      const submitBtn = page.locator('.ant-modal-footer .ant-btn-primary, .ant-drawer-footer .ant-btn-primary, .ant-modal .ant-btn-primary').last();
      if (await submitBtn.count() > 0 && await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForTimeout(2000);
      }

      const createOk = apiLog.filter(r => r.url.includes('/operators') && r.method === 'POST' && r.status === 200).length > 0;
      const create500 = apiLog.filter(r => r.url.includes('/operators') && r.method === 'POST' && r.status >= 400).length > 0;
      bugs.push({ module: '运营商管理', test: `新建(${phone})`, result: createOk ? '✅' : create500 ? '🛑 API 5xx' : '⚠️ 未检测到POST' });
      console.log(`  新建 ${phone} / ${name}: ${createOk ? '✅' : create500 ? '🛑' : '⚠️'}`);
      await screenshotIfBug(page, 'operators_create');
    } else {
      bugs.push({ module: '运营商管理', test: '新建按钮', result: '⚠️ 未找到新建按钮' });
    }
  } catch(e) {
    bugs.push({ module: '运营商管理', test: '新建', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // 3c. 编辑运营商
  try {
    await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    const editBtn = page.locator('button:has-text("编辑"), a:has-text("编辑"), [data-row-key] button:has-text("编")').first();
    if (await editBtn.count() > 0 && await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(1500);
      
      // Modify name
      const nameInput = page.locator('.ant-modal input, .ant-drawer input').first();
      if (await nameInput.count() > 0) {
        const currentVal = await nameInput.inputValue();
        await nameInput.fill(currentVal + '_edit');
        await page.waitForTimeout(300);
      }
      
      // Save
      const saveBtn = page.locator('.ant-modal-footer .ant-btn-primary, .ant-drawer-footer .ant-btn-primary').first();
      if (await saveBtn.count() > 0 && await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
      }
      console.log('  编辑完成');
      bugs.push({ module: '运营商管理', test: '编辑', result: '✅' });
    } else {
      bugs.push({ module: '运营商管理', test: '编辑', result: '⚠️ 无数据或无编辑按钮' });
    }
  } catch(e) {
    bugs.push({ module: '运营商管理', test: '编辑', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // ========== 4. 玩家管理 ==========
  console.log('\n=== 4. 玩家管理 ===');
  try {
    await page.goto(`${BASE}/admin/players`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    const playerPageOk = !(await page.locator('text=500, text=404, text=403').first().count()) > 0;
    bugs.push({ module: '玩家管理', test: '列表加载', result: playerPageOk ? '✅' : '⚠️ 页面异常' });
    console.log(`  玩家列表: ${playerPageOk ? '✅' : '⚠️'}`);
    await screenshotIfBug(page, 'players_list');
  } catch(e) {
    bugs.push({ module: '玩家管理', test: '列表加载', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // ========== 5. 营销管理 ==========
  console.log('\n=== 5. 营销管理 ===');
  try {
    await page.goto(`${BASE}/admin/marketing`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    bugs.push({ module: '营销管理', test: '页面加载', result: '✅' });
    console.log('  营销管理加载完成');
    await screenshotIfBug(page, 'marketing');
  } catch(e) {
    bugs.push({ module: '营销管理', test: '页面加载', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // ========== 6. 财务管理 ==========
  console.log('\n=== 6. 财务管理 ===');
  try {
    await page.goto(`${BASE}/admin/finance`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    bugs.push({ module: '财务管理', test: '页面加载', result: '✅' });
    console.log('  财务管理加载完成');
    await screenshotIfBug(page, 'finance');
  } catch(e) {
    bugs.push({ module: '财务管理', test: '页面加载', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // ========== 7. 系统设置 ==========
  console.log('\n=== 7. 系统设置 ===');
  try {
    await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    bugs.push({ module: '系统设置', test: '页面加载', result: '✅' });
    console.log('  系统设置加载完成');
    await screenshotIfBug(page, 'settings');
  } catch(e) {
    bugs.push({ module: '系统设置', test: '页面加载', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // ========== 8. 角色管理 ==========
  console.log('\n=== 8. 角色管理 ===');
  try {
    await page.goto(`${BASE}/admin/rbac`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    bugs.push({ module: '角色管理', test: '页面加载', result: '✅' });
    console.log('  角色管理加载完成');
    await screenshotIfBug(page, 'rbac');
  } catch(e) {
    bugs.push({ module: '角色管理', test: '页面加载', result: `🛑 ${e.message.slice(0,80)}` });
  }

  // ========== REPORT ==========
  await browser.close();
  
  console.log('\n\n========== 测试汇总 ==========');
  bugs.forEach(b => console.log(`  ${b.module} | ${b.test} | ${b.result}`));
  
  console.log(`\n=== API 记录 (${apiLog.length}) ===`);
  apiLog.forEach(a => console.log(`  ${a.status >= 400 ? '🛑' : '✅'} ${a.method} ${a.url} → ${a.status}`));
  
  console.log(`\n=== Console 错误/警告 (${consoleLog.length}) ===`);
  consoleLog.forEach(c => console.log(`  [${c.type}] ${c.text}`));
  
  const errCount = bugs.filter(b => b.result.includes('🛑')).length;
  const warnCount = bugs.filter(b => b.result.includes('⚠️')).length;
  console.log(`\n🛑 错误: ${errCount}, ⚠️ 警告: ${warnCount}`);
  
  // Save report
  const report = {
    time: new Date().toISOString(),
    bugs: bugs.map(b => ({ module: b.module, test: b.test, result: b.result })),
    api: apiLog.map(a => ({ method: a.method, url: a.url, status: a.status })),
    console: consoleLog.map(c => ({ type: c.type, text: c.text })),
    summary: { errors: errCount, warnings: warnCount, total: bugs.length }
  };
  fs.writeFileSync('reports/console-logs/admin_test_report.json', JSON.stringify(report, null, 2));
  fs.writeFileSync('/tmp/admin_test_report.json', JSON.stringify(report, null, 2));
  console.log('\n报告已保存: reports/console-logs/admin_test_report.json');
  
  process.exit(errCount > 0 ? 1 : 0);
})();
