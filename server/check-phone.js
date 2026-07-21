const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

const user = db.prepare(`
  SELECT au.id, au.username, au.phone, ar.label as role_name, ar.id as role_id
  FROM admin_users au
  LEFT JOIN admin_roles ar ON au.role_id = ar.id
  WHERE au.phone = '13111111111'
`).get();

if (user) {
  console.log("找到用户:", JSON.stringify(user, null, 2));
} else {
  console.log("数据库中没有 13111111111 这个账号");
  const all = db.prepare("SELECT id, username, phone, role_id FROM admin_users").all();
  console.log("\n当前所有 admin_users 记录:");
  all.forEach(a => console.log("  " + (a.username||"") + "  " + (a.phone||"")));
}

db.close();
