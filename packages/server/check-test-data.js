const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

// 检查各个表的详细数据，判断哪些是假的/测试的
console.log("=== operators ===");
const ops = db.prepare("SELECT id, name, phone, admin_phone, status FROM operators").all();
ops.forEach(o => console.log("  ", o.name, o.phone, "admin:", o.admin_phone, o.status));

console.log("\n=== admin_users ===");
const aus = db.prepare("SELECT username, phone, nickname, role_id FROM admin_users").all();
aus.forEach(a => console.log("  ", a.username, a.phone, a.nickname, a.role_id));

console.log("\n=== venues ===");
const vs = db.prepare("SELECT id, name, address, operator_id, status FROM venues").all();
vs.forEach(v => console.log("  ", v.name, v.address, "op:", v.operator_id?.slice(0,8), v.status));

console.log("\n=== race_packages ===");
const rps = db.prepare("SELECT id, name, price, status FROM race_packages").all();
rps.forEach(r => console.log("  ", r.name, r.price, r.status));

console.log("\n=== system_config ===");
const scs = db.prepare("SELECT key, value FROM system_config LIMIT 5").all();
scs.forEach(s => console.log("  ", s.key, "=", s.value));
console.log("  ...共", db.prepare("SELECT COUNT(*) as c FROM system_config").get().c, "条");

console.log("\n=== settings ===");
const st = db.prepare("SELECT key, value FROM settings").all();
st.forEach(s => console.log("  ", s.key, "=", s.value));

console.log("\n=== marketing_config ===");
const mcs = db.prepare("SELECT id, name, type, status FROM marketing_config").all();
mcs.forEach(m => console.log("  ", m.name, m.type, m.status));

console.log("\n=== client_logs ===");
console.log("  ", db.prepare("SELECT COUNT(*) as c FROM client_logs").get().c, "条");

db.close();
