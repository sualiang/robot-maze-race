const { chromium } = require('playwright');
const BASE = 'https://dog.amberrobot.com.cn';
const ADMIN = { phone: 'admin', password: 'admin123' };
const results = [];

function log(r) { console.log(r); results.push(r); }

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  let cs = 0;
  const cons = [];
  page.on('console', m => { cs++; const t = m.text().slice(0,300); if (m.type()==='error') cons.push(`[${m.type()}] ${t}`); });
  page.on('pageerror', e => { cons.push(`[pageerror] ${(e.message||'').slice(0,300)}`); });
  page.on('requestfailed', r => { cons.push(`[netfail] ${r.url().slice(0,120)}`); });
  page.on('response', async r => {
    const u = r.url(); const m = r.request().method();
    if (u.includes('/api/') && ['POST','PATCH','DELETE','PUT'].includes(m)) {
      try { const b = await r.text(); if (r.status()>=400) cons.push(`[API ${r.status()}] ${m} ${u.split('/api/')[1]?.slice(0,100)}: ${b.slice(0,200)}`); }
      catch {}
    }
  });

  // 1. Admin login
  log('\n=== 1. Admin Login ===');
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input[placeholder*="手机"]', ADMIN.phone);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button:has-text("登")');
  await page.waitForURL('**/admin/**', { timeout: 10000 });
  log('✅ Login OK → ' + page.url().slice(0,80));

  // 2. Dashboard stats
  log('\n=== 2. Dashboard ===');
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const dbErrs = cons.filter(c => c.includes('/admin/') && (c.includes('500') || c.includes('error')));
  log(dbErrs.length === 0 ? '✅ Dashboard loaded' : `⚠️  ${dbErrs.length} errors: ${dbErrs.slice(0,3).join('; ')}`);

  // 3. Referee list
  log('\n=== 3. Referee List ===');
  await page.goto(`${BASE}/admin/referees`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const refErrs = cons.filter(c => c.includes('referee') && c.includes('500'));
  log(refErrs.length === 0 ? '✅ Referee list OK' : `⚠️  ${refErrs.join('; ')}`);

  // 4. Referee invite
  log('\n=== 4. Referee Invite ===');
  await page.goto(`${BASE}/admin/referee-invite`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const invErrs = cons.filter(c => c.includes('referee-invite') || c.includes('referee_invites'));
  log(invErrs.length === 0 ? '✅ Referee invite page OK' : `⚠️  ${invErrs.join('; ')}`);

  // 5. Admin attendance
  log('\n=== 5. Admin Attendance ===');
  await page.goto(`${BASE}/admin/attendance`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const attErrs = cons.filter(c => c.includes('attendance') && c.includes('500'));
  log(attErrs.length === 0 ? '✅ Admin attendance OK' : `⚠️  ${attErrs.join('; ')}`);

  // 6. Admin finance
  log('\n=== 6. Admin Finance ===');
  await page.goto(`${BASE}/admin/finance`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const finErrs = cons.filter(c => c.includes('settlement') && c.includes('500'));
  log(finErrs.length === 0 ? '✅ Admin finance OK' : `⚠️  ${finErrs.join('; ')}`);

  // 7. Operators list
  log('\n=== 7. Operators List ===');
  await page.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const opErrs = cons.filter(c => c.includes('operator') && c.includes('500'));
  log(opErrs.length === 0 ? '✅ Operators list OK' : `⚠️  ${opErrs.join('; ')}`);

  // 8. Players
  log('\n=== 8. Players ===');
  await page.goto(`${BASE}/admin/players`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const plErrs = cons.filter(c => c.includes('player') && c.includes('500'));
  log(plErrs.length === 0 ? '✅ Players list OK' : `⚠️  ${plErrs.join('; ')}`);

  // 9. Operator login
  log('\n=== 9. Operator Login ===');
  const opPage = await ctx.newPage();
  opPage.on('response', async r => {
    const u = r.url(); const m = r.request().method();
    if (u.includes('/api/') && ['POST','PATCH','DELETE'].includes(m)) {
      try { const b = await r.text(); if (r.status()>=400) cons.push(`[OP-API ${r.status()}] ${m} ${u.split('/api/')[1]?.slice(0,100)}: ${b.slice(0,200)}`); }
      catch {}
    }
  });
  await opPage.goto(`${BASE}/operator/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await opPage.fill('input[placeholder*="手机"]', '13999999999');
  await opPage.fill('input[type="password"]', 'admin123');
  await opPage.click('button:has-text("登")');
  await opPage.waitForTimeout(3000);
  const opLoginUrl = opPage.url();
  log(opLoginUrl.includes('/operator/') && !opLoginUrl.includes('/login') ? '✅ Operator login OK' : `⚠️  Operator login: ${opLoginUrl.slice(0,80)}`);

  // 10. Operator attendance (if logged in)
  if (opLoginUrl.includes('/operator/') && !opLoginUrl.includes('/login')) {
    await opPage.goto(`${BASE}/operator/attendance`, { waitUntil: 'networkidle', timeout: 15000 });
    await opPage.waitForTimeout(2000);
    const opAttErrs = cons.filter(c => c.includes('operator') && c.includes('attendance') && c.includes('500'));
    log(opAttErrs.length === 0 ? '✅ Operator attendance OK' : `⚠️  ${opAttErrs.join('; ')}`);
  }

  // Summary
  log('\n' + '='.repeat(50));
  log('CONSOLE ERRORS: ' + cons.length);
  cons.forEach(c => log('  ' + c.slice(0,200)));

  await browser.close();
  console.log('\n=== RAW RESULTS ===');
  results.forEach(r => console.log(r));
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
