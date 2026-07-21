const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

const del = db.prepare("DELETE FROM admin_users WHERE phone = '13800000002' AND username != 'admin_fin'").run();
console.log("删除了", del.changes, "条13800000002的测试记录");

const aus = db.prepare("SELECT id, username, phone, role_id FROM admin_users").all();
console.log("\nadmin_users 最终(" + aus.length + "条):");
aus.forEach(a => console.log("  " + (a.username||"") + "  " + (a.phone||"") + "  role:" + a.role_id));

db.close();
