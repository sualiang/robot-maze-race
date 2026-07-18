const { chromium } = require('playwright');

const BASE = 'https://dog.amberrobot.com.cn';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  const apiCalls = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/api/') && ['POST','PATCH','PUT','DELETE'].includes(resp.request().method())) {
      resp.text().then(body => {
        apiCalls.push({ method: resp.request().method(), url: url.replace(BASE,''), status: resp.status(), body: body.slice(0, 300) });
        console.log(`  ${resp.status() >= 400 ? '🛑' : '✅'} ${resp.request().method()} ${url.replace(BASE,'').slice(0,70)} → ${resp.status()} ${body.slice(0,100)}`);
      }).catch(() => {});
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('client-log'))
      console.log(`  [${msg.type()}] ${msg.text().slice(0,200)}`);
  });

  // Login
  console.log('=== 登录 ===');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input').first().fill('admin');
  await page.locator('input[type="password"]').first().fill('admin123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);

  // Operators
  console.log('\n=== 新建运营商 ===');
  await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("新建运营商")').first().click();
  await page.waitForTimeout(2000);

  const phone = '135' + String(Math.floor(Math.random() * 90000000 + 10000000));
  const name = 'TestOp_' + Date.now().toString(36);
  console.log(`  ${phone} / ${name}`);

  // Fill text inputs
  await page.locator('#phone').fill(phone); await page.waitForTimeout(200);
  await page.locator('#name').fill(name); await page.waitForTimeout(200);
  await page.locator('#contact_person').fill('张三'); await page.waitForTimeout(200);
  await page.locator('#contact_phone').fill('13800138001'); await page.waitForTimeout(200);
  await page.locator('#company_name').fill('测试科技有限公司'); await page.waitForTimeout(200);

  // Cascader province
  await page.locator('#province_path').click(); await page.waitForTimeout(800);
  await page.locator('.ant-cascader-menu-item').first().click(); await page.waitForTimeout(800);
  await page.locator('.ant-cascader-menu-item').first().click(); await page.waitForTimeout(800);
  await page.locator('.ant-cascader-menu-item').first().click(); await page.waitForTimeout(500);
  await page.locator('#company_address').click(); await page.waitForTimeout(300);
  await page.locator('#company_address').fill('科技园路88号'); await page.waitForTimeout(300);

  // Bank - use parent .ant-select
  await page.locator('.ant-form-item').filter({ hasText: /开户行/ }).locator('.ant-select').first().click();
  await page.waitForTimeout(1000);
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first().click();
  await page.waitForTimeout(500);

  await page.locator('#bank_branch').fill('北京分行营业部'); await page.waitForTimeout(200);
  await page.locator('#bank_account').fill('6222021234567890'); await page.waitForTimeout(200);

  // profit_share_rate - find .ant-select parent, not the disabled input
  const rateLabel = page.locator('.ant-form-item').filter({ hasText: /分成比例|分润比例|利润比例|profit/ });
  if (await rateLabel.count() > 0) {
    const rateSelector = rateLabel.first().locator('.ant-select');
    if (await rateSelector.count() > 0) {
      // Check if disabled
      const isDisabled = await rateSelector.first().getAttribute('class');
      console.log(`  分成比例 class: ${isDisabled}`);
      await rateSelector.first().click();
      await page.waitForTimeout(1000);
      const rateOpt = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first();
      if (await rateOpt.count() > 0) {
        await rateOpt.click(); await page.waitForTimeout(500);
        console.log('  分成比例 OK');
      }
    }
  }

  // Verify
  console.log(`  验证: phone=${await page.locator('#phone').inputValue()}, name=${await page.locator('#name').inputValue()}`);

  await page.screenshot({ path: 'test-screenshots/admin_operators_filled.png', fullPage: true });

  // Scroll and submit
  await page.locator('.ant-modal-body').evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(500);
  
  const btns = await page.locator('.ant-modal-footer .ant-btn').all();
  console.log(`  底部按钮: ${await Promise.all(btns.map(b => b.textContent()))}`);
  
  const submitBtn = page.locator('.ant-modal-footer .ant-btn-primary');
  if (await submitBtn.count() > 0) {
    await submitBtn.last().click();
    console.log('  提交!'); await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: 'test-screenshots/admin_operators_result.png', fullPage: true });

  const ok = apiCalls.filter(a => a.url.includes('/operators') && a.method === 'POST' && a.status === 200);
  const fail = apiCalls.filter(a => a.url.includes('/operators') && a.method === 'POST' && a.status >= 400);
  console.log(`\n创建: 200=${ok.length}, 失败=${fail.length}`);
  fail.forEach(f => console.log(`  🛑 ${f.url} → ${f.status} | ${f.body}`));
  ok.forEach(s => console.log(`  ✅ ${s.url} → ${s.status} | ${s.body}`));

  await browser.close();
  process.exit(0);
})();
