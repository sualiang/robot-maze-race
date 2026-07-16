const fs = require('fs');
const bcrypt = require('bcryptjs');

const path = '/Users/longshe/.openclaw/workspace/projects/robot-maze-race/packages/server/src/config/database.ts';
let content = fs.readFileSync(path, 'utf8');

// Find after Common schema initialized, before closing }
const marker = "console.log('[DB] Common schema initialized');";
let pos = content.indexOf(marker);
if (pos === -1) { console.log("Marker not found!"); process.exit(1); }

// Find the closing brace of initSchema after marker
let braceCount = 0;
let inFunction = false;
let insertPos = -1;
for (let i = pos; i < content.length; i++) {
  if (content[i] === '{') { braceCount++; inFunction = true; }
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0 && inFunction) {
      insertPos = i;
      break;
    }
  }
}
if (insertPos === -1) {
  // Try simpler search: find next "}\n" after marker
  insertPos = content.indexOf("}\n", pos);
}

const adminHash = bcrypt.hashSync('admin123', 10);
console.log('bcrypt hash for admin123:', adminHash);

const seedCode = `
  // ==================== 种子数据 ====================
  // 默认后台管理员角色
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["role-super-admin", "role-super-admin", "超级管理员", JSON.stringify(["*"]), "admin"]); } catch {}
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["ops_admin", "ops_admin", "运营", JSON.stringify(["dashboard","venues","races","players","finance","attendance","settlement","marketing","merchant","point_shop","task","announcement","rbac","referee","settings","operator_settings","reports","player"]), "operator"]); } catch {}
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["finance_admin", "finance_admin", "财务", JSON.stringify(["finance","settlement","reports","point_shop","player"]), "operator"]); } catch {}
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["op_super_admin", "op_super_admin", "运营商超管", JSON.stringify(["*"]), "operator"]); } catch {}
  // 默认超级管理员账号 (admin/admin123)
  try { await conn.execute("INSERT IGNORE INTO admin_users (id, username, password, nickname, role_id, status) VALUES (?, ?, ?, ?, ?, ?)", ["admin-001", "admin", "${adminHash}", "Admin", "role-super-admin", "active"]); } catch {}
`;

const newContent = content.slice(0, insertPos) + seedCode + content.slice(insertPos);
fs.writeFileSync(path, newContent);
console.log("Seed data added at position", insertPos);
console.log("Done!");
