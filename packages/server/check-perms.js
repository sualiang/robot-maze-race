const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

console.log("===== 所有角色 =====");
const roles = db.prepare("SELECT id, name, label, scope, permissions FROM admin_roles ORDER BY scope, name").all();
roles.forEach(r => {
  console.log(r.id + "\t" + r.label + "\t[" + r.scope + "]\t" + r.permissions);
});

console.log("\n===== 所有用户及其角色 =====");
const users = db.prepare([
  "SELECT au.phone, au.username, au.role_id,",
  "ar.label as role_label, ar.scope as role_scope",
  "FROM admin_users au",
  "LEFT JOIN admin_roles ar ON ar.id = au.role_id",
  "WHERE au.role_id IS NOT NULL",
  "ORDER BY au.phone"
].join(" ")).all();
users.forEach(u => {
  console.log(u.phone + "\t" + u.username + "\t" + u.role_id + "\t" + (u.role_label || "") + "\t[" + (u.role_scope || "") + "]");
});

db.close();
