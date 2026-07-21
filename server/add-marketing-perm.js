const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

// role-admin 加上 marketing:edit
const role1 = db.prepare("SELECT permissions FROM admin_roles WHERE id = 'role-admin'").get();
const perms1 = JSON.parse(role1.permissions);
if (!perms1.includes('marketing:edit')) perms1.push('marketing:edit');
db.prepare("UPDATE admin_roles SET permissions = ? WHERE id = 'role-admin'").run(JSON.stringify(perms1));
console.log("role-admin:", JSON.stringify(perms1));

// role-ops-admin 加上 marketing:read 和 marketing:edit
const role2 = db.prepare("SELECT permissions FROM admin_roles WHERE id = 'role-ops-admin'").get();
const perms2 = JSON.parse(role2.permissions);
if (!perms2.includes('marketing:read')) perms2.push('marketing:read');
if (!perms2.includes('marketing:edit')) perms2.push('marketing:edit');
db.prepare("UPDATE admin_roles SET permissions = ? WHERE id = 'role-ops-admin'").run(JSON.stringify(perms2));
console.log("role-ops-admin:", JSON.stringify(perms2));

db.close();
