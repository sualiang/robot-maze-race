const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

const u = db.prepare("SELECT username, role_id, first_login FROM admin_users WHERE username = ?").get("admin");
console.log("admin用户:", JSON.stringify(u));

const r = db.prepare("SELECT id, name, permissions FROM admin_roles WHERE id = ?").get("role-admin");
console.log("role-admin:", JSON.stringify(r));

db.close();
