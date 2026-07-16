const fs = require('fs');
const path = '/Users/longshe/.openclaw/workspace/projects/robot-maze-race/packages/server/src/config/database.ts';
let content = fs.readFileSync(path, 'utf8');

// The area to insert seed data is right after: console.log('[DB] Common schema initialized');
// and before the closing } of initSchema
const marker = "console.log('[DB] Common schema initialized');";
const markerEnd = "\n}";

// Find the position of the marker  
let pos = content.indexOf(marker);
if (pos === -1) {
  console.log("Marker not found!");
  // Try alternate search
  pos = content.indexOf("Common schema initialized");
  console.log("Found at:", pos);
  if (pos === -1) process.exit(1);
}

// Find the closing brace after the marker
let afterMarker = content.indexOf(markerEnd, pos);
if (afterMarker === -1) {
  console.log("Could not find closing brace");
  process.exit(1);
}

const seedCode = `
  // ==================== 种子数据 ====================
  // 默认后台管理员角色
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["role-super-admin", "role-super-admin", "超级管理员", JSON.stringify(["*"]), "admin"]); } catch {}
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["ops_admin", "ops_admin", "运营", JSON.stringify(["dashboard","venues","races","players","finance","attendance","settlement","marketing","merchant","point_shop","task","announcement","rbac","referee","settings","operator_settings","reports","player"]), "operator"]); } catch {}
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["finance_admin", "finance_admin", "财务", JSON.stringify(["finance","settlement","reports","point_shop","player"]), "operator"]); } catch {}
  try { await conn.execute("INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?, ?, ?, ?, ?)", ["op_super_admin", "op_super_admin", "运营商超管", JSON.stringify(["*"]), "operator"]); } catch {}
  // 默认超级管理员账号 (admin/admin123)
  try { await conn.execute("INSERT IGNORE INTO admin_users (id, username, password, nickname, role_id, status) VALUES (?, ?, ?, ?, ?, ?)", ["admin-001", "admin", "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy", "Admin", "role-super-admin", "active"]); } catch {}
`;

const newContent = content.slice(0, afterMarker) + seedCode + "\n" + content.slice(afterMarker);
fs.writeFileSync(path, newContent);
console.log("Seed data added successfully at position", afterMarker);
