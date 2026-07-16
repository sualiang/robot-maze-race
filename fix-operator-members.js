const fs = require('fs');

// Fix operator-marketing.ts
let f1 = fs.readFileSync('packages/server/src/routes/operator-marketing.ts','utf8');
let count1 = 0;
f1 = f1.replace(
  /const roleMember = await queryOpOne<\{ operator_id: string \}>\(req, \n\s+'SELECT operator_id FROM operator_members WHERE id = \$1',\n\s+\[req\.user!\.userId\]\);/g,
  () => { count1++; return `const roleMember = await queryOne<{ operator_id: string }>(\n      'SELECT operator_id FROM operator_members WHERE id = ?', [req.user!.userId]);`; }
);
fs.writeFileSync('packages/server/src/routes/operator-marketing.ts', f1);
console.log('operator-marketing.ts: fixed', count1, 'occurrences');

// Fix referee-invite.ts line ~29
let f2 = fs.readFileSync('packages/server/src/routes/referee-invite.ts','utf8');
let count2 = 0;
f2 = f2.replace(
  /const member = await queryOpOne<\{ operator_id: string \}>\(req, \n\s+'SELECT operator_id FROM operator_members WHERE id = \$1', \[req\.user!\.userId\]/g,
  () => { count2++; return `const member = await queryOne<{ operator_id: string }>(\n        'SELECT operator_id FROM operator_members WHERE id = ?', [req.user!.userId]`; }
);
fs.writeFileSync('packages/server/src/routes/referee-invite.ts', f2);
console.log('referee-invite.ts: fixed', count2, 'occurrences');

// Fix referees.ts line ~158
let f3 = fs.readFileSync('packages/server/src/routes/referees.ts','utf8');
let count3 = 0;
f3 = f3.replace(
  /const roleMember = await queryOpOne<\{ operator_id: string \}>\(req, \n\s+'SELECT operator_id FROM operator_members WHERE id = \$1',/g,
  () => { count3++; return `const roleMember = await queryOne<{ operator_id: string }>(\n          'SELECT operator_id FROM operator_members WHERE id = ?',`; }
);
fs.writeFileSync('packages/server/src/routes/referees.ts', f3);
console.log('referees.ts: fixed', count3, 'occurrences');
