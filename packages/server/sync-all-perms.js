const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

const updates = {
  // 总部总管理员：能看到运营商管理、数据看板、营销配置、财务中心
  // 需要补齐：operators:read operators:create operators:edit operators:delete marketing:edit
  "role-admin": [
    "operators:list",
    "operators:read",
    "operators:create",
    "operators:edit",
    "operators:delete",
    "marketing:read",
    "marketing:edit",
    "finance:read",
    "dashboard:read",
    "dashboard:list"
  ],
  // 总部运营管理员：能看到运营商管理、数据看板、营销配置
  // 需要补齐：operators:create operators:edit operators:delete marketing:read marketing:edit
  "role-ops-admin": [
    "operators:read",
    "operators:list",
    "operators:create",
    "operators:edit",
    "operators:delete",
    "dashboard:read",
    "marketing:read",
    "marketing:edit"
  ],
  // 总部财务管理员：财务中心 + 个人中心（无权限要求）
  // 已有的就够用
  "role-finance-admin": [
    "finance:read",
    "finance:withdraw",
    "finance:history"
  ],
};

for (const [roleId, perms] of Object.entries(updates)) {
  const result = db.prepare("UPDATE admin_roles SET permissions = ? WHERE id = ?").run(JSON.stringify(perms), roleId);
  console.log(roleId + ":", JSON.stringify(perms), "→ 影响", result.changes, "行");
}

console.log("\n验证:");
const roles = db.prepare("SELECT id, label, permissions FROM admin_roles").all();
roles.forEach(r => console.log(r.label, "→", r.permissions));

db.close();
