const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

const role = db.prepare("SELECT id, permissions FROM admin_roles WHERE id = ?").get("role-admin");
console.log("修改前:", role.permissions);

const newPerms = ["operators:list","marketing:read","finance:read","dashboard:read","dashboard:list"];
const result = db.prepare("UPDATE admin_roles SET permissions = ? WHERE id = ?").run(JSON.stringify(newPerms), "role-admin");
console.log("修改后:", newPerms, "影响行数:", result.changes);

const check = db.prepare("SELECT id, label, permissions FROM admin_roles WHERE id = ?").get("role-admin");
console.log("验证:", check.label, "→", check.permissions);

db.close();
