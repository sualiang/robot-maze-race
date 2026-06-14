const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

// 查看所有用户和它们的 subscribe_venue_id
const users = db.prepare(`SELECT u.id, u.nickname, u.phone, u.subscribe_venue_id, 
  v.name as venue_name, v.operator_id,
  o.name as operator_name
FROM users u
LEFT JOIN venues v ON u.subscribe_venue_id = v.id
LEFT JOIN operators o ON v.operator_id = o.id`).all();

console.log("所有用户（users表）:");
users.forEach(u => {
  const shortId = u.id.slice(0, 12) + "...";
  console.log(`  ${shortId}  ${u.nickname || 'null'}  ${u.phone || 'null'}`);
  console.log(`    subscribe_venue: ${u.subscribe_venue_id || 'null'}  venue: ${u.venue_name || 'null'}  operator: ${u.operator_name || 'null'}`);
});

console.log("\n---");
console.log("总部直属玩家 : subscribe_venue_id IS NULL 的用户（无场馆）");

// 再看运营商超管和其他 admin_users
const admins = db.prepare(`SELECT au.phone, au.username, au.role_id, ar.label as role_label, 
  au.operator_id, o.name as operator_name
FROM admin_users au
LEFT JOIN admin_roles ar ON au.role_id = ar.id
LEFT JOIN operators o ON au.operator_id = o.id`).all();
console.log("\nadmin_users 表所有记录:");
admins.forEach(a => {
  console.log(`  ${a.phone || a.username}  role: ${a.role_label} operator: ${a.operator_name || '总后台'}`);
});

db.close();
