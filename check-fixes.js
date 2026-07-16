const fs = require('fs');

let report = '';

function checkFile(name) {
  const content = fs.readFileSync(`packages/server/src/routes/${name}.ts`, 'utf8');
  const lines = content.split('\n');
  let matches = [];
  lines.forEach((line, i) => {
    if (line.includes('queryOpOne')) {
      matches.push(`  Line ${i+1}: ${line.trim()}`);
    }
    if (line.includes('operator_members') && line.includes('queryOpOne')) {
      matches.push(`  **ISSUE: Line ${i+1}: ${line.trim()}`);
    }
    if (line.includes('.role ') || line.includes('.role)') || line.includes('.role,')) {
      matches.push(`  ROLE REF: Line ${i+1}: ${line.trim()}`);
    }
    if (line.includes('password_hash')) {
      matches.push(`  PWDHASH: Line ${i+1}: ${line.trim()}`);
    }
  });
  report += `=== ${name}.ts ===\n`;
  if (matches.length === 0) report += '  CLEAN\n';
  else matches.forEach(m => report += m + '\n');
  report += '\n';
}

['operator-marketing', 'referee-invite', 'referees', 'auth', 'operator', 'admin-operators'].forEach(checkFile);

fs.writeFileSync('/tmp/fix-report.txt', report);
console.log('Report written to /tmp/fix-report.txt');
