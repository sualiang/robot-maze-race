const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://dog.amberrobot.com.cn';
const ADMIN = 'admin';
const PASS = 'admin123';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  // Track ALL responses including GET
  const allResponses = [];
  const allErrors = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/api/')) {
      const method = resp.request().method();
      if (resp.status() >= 400) {
        resp.text().then(body => {
          allErrors.push({ method, url: url.replace(BASE,''), status: resp.status(), body: body.slice(0, 300) });
          console.log(`🛑 ${method} ${url.replace(BASE,'').slice(0,80)} → ${resp.status()} ${body.slice(0,150)}`);
        }).catch(() => {});
      } else {
        allResponses.push({ method, url: url.replace(BASE,''), status: resp.status() });
      }
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('client-log')) {
      console.log(`  [${msg.type()}] ${msg.text().slice(0, 200)}`);
    }
  });

  // Login
  console.log('=== 登录 ===');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  const userInput = page.locator('input').first();
  const passInput = page.locator('input[type="password"]').first();
  if (await userInput.count() > 0 && await passInput.count() > 0) {
    await userInput.fill(ADMIN);
    await passInput.fill(PASS);
    await page.waitForTimeout(300);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    console.log('  登录 OK, URL:', page.url());
  }

  // ===== FOCUS: 运营商新建深层测试 =====
  console.log('\n=== 运营商创建深层测试 ===');
  await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  
  // Take snapshot to find buttons
  const btns = await page.locator('button').allTextContents();
  console.log('  可见按钮:', btns.filter(b => b && b.trim()).join(', '));
  
  // Look for 新建/新增 button
  const createBtn = page.locator('button:has-text("新建"), button:has-text("新增"), button:has-text("添加"), button:has-text("创建")').first();
  const btnExists = await createBtn.count();
  console.log('  新建按钮存在:', btnExists > 0);

  if (btnExists > 0) {
    await createBtn.click();
    await page.waitForTimeout(2000);
    
    // Screenshot to see the modal/form
    await page.screenshot({ path: 'test-screenshots/admin_operators_modal.png' });
    console.log('  📸 Screenshot: admin_operators_modal.png');
    
    // List all inputs in modal
    const allInputs = await page.locator('.ant-modal input, .ant-drawer input').all();
    console.log(`  表单输入框数量: ${allInputs.length}`);
    for (const inp of allInputs) {
      const ph = await inp.getAttribute('placeholder');
      const id = await inp.getAttribute('id');
      console.log(`    input placeholder="${ph || ''}" id="${id || ''}"`);
    }
    
    // Try to fill
    const phoneInput = page.locator('.ant-modal input').first();
    if (await phoneInput.count() > 0) {
      const phone = '135' + String(Math.floor(Math.random() * 90000000 + 10000000));
      await phoneInput.fill(phone);
      console.log(`  填充手机号: ${phone}`);
      await page.waitForTimeout(500);
    }

    // Try to find all input fields
    const inputs = await page.locator('.ant-modal input, .ant-drawer input').all();
    console.log(`  输入框总数: ${inputs.length}`);
    for (let i = 0; i < inputs.length; i++) {
      const ph = await inputs[i].getAttribute('placeholder');
      const val = await inputs[i].inputValue();
      console.log(`  [${i}] placeholder="${ph || ''}" value="${val}"`);
    }
  }

  // ===== FOCUS: 玩家管理 500 =====
  console.log('\n=== 玩家管理 500 排查 ===');
  const preErrors = allErrors.length;
  await page.goto(`${BASE}/admin/players`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  
  const playerErrors = allErrors.slice(preErrors);
  console.log(`  新增API错误: ${playerErrors.length}`);
  playerErrors.forEach(e => console.log(`  🛑 ${e.method} ${e.url} → ${e.status}`));

  // Check what APIs are called on players page
  const playersApi = allResponses.filter(r => r.url.includes('/admin/players'));
  console.log('\n  玩家页API调用:');
  const seen = new Set();
  playersApi.forEach(a => {
    const key = a.method + ' ' + a.url;
    if (!seen.has(key)) { seen.add(key); console.log(`    ${a.method} ${a.url} → ${a.status}`); }
  });

  // ===== FOCUS: Dashboard APIs =====
  console.log('\n=== Dashboard API详情 ===');
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  const dashApi = allResponses.filter(r => r.url.includes('/admin/dashboard'));
  const dashSeen = new Set();
  dashApi.forEach(a => {
    const key = a.method + ' ' + a.url;
    if (!dashSeen.has(key)) { dashSeen.add(key); console.log(`    ${a.method} ${a.url} → ${a.status}`); }
  });

  // ===== FOCUS: 营销管理 API =====
  console.log('\n=== 营销管理 API详情 ===');
  const preMkt = allErrors.length;
  await page.goto(`${BASE}/admin/marketing`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  const mktErrors = allErrors.slice(preMkt);
  if (mktErrors.length > 0) {
    console.log('  营销管理错误:');
    mktErrors.forEach(e => console.log(`  🛑 ${e.method} ${e.url} → ${e.status}`));
  }

  // ===== FOCUS: 财务管理 API =====
  console.log('\n=== 财务管理 API详情 ===');
  const preFin = allErrors.length;
  await page.goto(`${BASE}/admin/finance`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  const finErrors = allErrors.slice(preFin);
  if (finErrors.length > 0) {
    console.log('  财务管理错误:');
    finErrors.forEach(e => console.log(`  🛑 ${e.method} ${e.url} → ${e.status} | ${e.body}`));
  }

  // ===== SUMMARY =====
  console.log(`\n\n========== 深度排查汇总 ==========`);
  console.log(`API错误 (${allErrors.length}):`);
  allErrors.forEach(e => {
    if (!e.url.includes('client-log')) {
      console.log(`  🛑 ${e.method} ${e.url} → ${e.status} | ${e.body.slice(0,100)}`);
    }
  });

  // Filter out client-log errors for real API issues
  const realErrors = allErrors.filter(e => !e.url.includes('client-log'));
  console.log(`\n真实API错误(不含client-log): ${realErrors.length}`);

  await browser.close();
  process.exit(0);
})();
