const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

// 只看哪些表有假数据，用户说"全部清除假数据"
// 分析每个表哪些是测试数据

// 1. operators - 哪些是测试运营商
const ops = db.prepare("SELECT id, name, phone, contact_phone, status, company_name FROM operators").all();
console.log("=== operators (" + ops.length + "条) ===");
ops.forEach(o => console.log("  " + o.name + "  phone:" + o.phone + " status:" + o.status + " 公司:" + (o.company_name||"")));

// 2. admin_users - 全部都是测试/管理账号
const aus = db.prepare("SELECT username, phone FROM admin_users").all();
console.log("\n=== admin_users (" + aus.length + "条) ===");
aus.forEach(a => console.log("  " + (a.username||"null") + "  " + a.phone));

// 3. venues
const vs = db.prepare("SELECT name, address FROM venues").all();
console.log("\n=== venues (" + vs.length + "条) ===");
vs.forEach(v => console.log("  " + v.name + "  " + v.address));

// 4. race_packages
const rps = db.prepare("SELECT name, price FROM race_packages").all();
console.log("\n=== race_packages (" + rps.length + "条) ===");
rps.forEach(r => console.log("  " + r.name + "  " + r.price));

// 5. marketing_config
const mcs = db.prepare("SELECT name, type, status FROM marketing_config").all();
console.log("\n=== marketing_config (" + mcs.length + "条) ===");
mcs.forEach(m => console.log("  " + m.name + "  " + m.type + "  " + m.status));

// 6. client_logs - 日志，删除
const cl = db.prepare("SELECT COUNT(*) as c FROM client_logs").get();
console.log("\n=== client_logs (" + cl.c + "条) 日志记录 ===");

// 7. system_config - 系统配置，需要保留
const sc = db.prepare("SELECT COUNT(*) as c FROM system_config").get();
console.log("=== system_config (" + sc.c + "条) 系统配置(保留) ===");

// 8. settings
const st = db.prepare("SELECT key, value FROM settings").all();
console.log("=== settings (" + st.length + "条) ===");
st.forEach(s => console.log("  " + s.key + " = " + s.value));

db.close();
