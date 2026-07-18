const m = require("/opt/test-zone/node_modules/mysql2/promise");

(async () => {
  const c = await m.createConnection({
    host: "127.0.0.1", port: 3308,
    user: "root", password: "IronDog2026!Root",
    database: "robot_maze_race_common"
  });

  // === 当前状态 ===
  console.log("=== 执行前 ===");
  let [rows] = await c.query("SELECT id, name, scope FROM admin_roles ORDER BY scope, name");
  rows.forEach(r => console.log(r.id, "|", r.name, "|", r.scope));

  // === 组1: 总部角色 ===
  console.log("\n=== 组1: 总部角色 INSERT IGNORE ===");
  await c.execute(
    `INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?,?,?,?,?), (?,?,?,?,?), (?,?,?,?,?)`,
    [
      "role-admin", "role-admin", "总管理员",
      JSON.stringify(["operators:read","operators:list","operators:create","operators:edit","operators:delete","players:list","dashboard:read","dashboard:list","marketing:read","finance:read","finance:withdraw","finance:history"]),
      "admin",
      "role-ops-admin", "role-ops-admin", "运营管理员",
      JSON.stringify(["operators:read","operators:create","operators:edit","players:list","dashboard:read","dashboard:list"]),
      "admin",
      "role-finance-admin", "role-finance-admin", "财务管理员",
      JSON.stringify(["finance:read","finance:withdraw","finance:history"]),
      "admin"
    ]
  );
  console.log("组1 done");

  // === 组2: 运营商角色 ===
  console.log("=== 组2: 运营商角色 INSERT IGNORE ===");
  await c.execute(
    `INSERT IGNORE INTO admin_roles (id, name, label, permissions, scope) VALUES (?,?,?,?,?), (?,?,?,?,?), (?,?,?,?,?)`,
    [
      "op_super_admin", "op_super_admin", "运营商超管", JSON.stringify(["*"]), "operator",
      "op_admin", "op_admin", "运营",
      JSON.stringify(["venues:read","venues:create","venues:edit","referees:read","referees:create","referees:edit","packages:read","packages:create","packages:edit","marketing:read","marketing:create","marketing:edit","players:read","dashboard:read"]),
      "operator",
      "op_finance", "op_finance", "财务",
      JSON.stringify(["finance:read","finance:withdraw","finance:history","dashboard:read"]),
      "operator"
    ]
  );
  console.log("组2 done");

  // === 组3: UPDATE role-admin 权限 ===
  console.log("=== 组3: UPDATE role-admin ===");
  const [upd] = await c.execute(
    "UPDATE admin_roles SET permissions = ? WHERE name = ?",
    [
      JSON.stringify(["operators:read","operators:list","operators:create","operators:edit","operators:delete","players:list","dashboard:read","dashboard:list","marketing:read","finance:read","finance:withdraw","finance:history"]),
      "role-admin"
    ]
  );
  console.log("UPDATE affected:", upd.affectedRows);

  // === 验证 ===
  console.log("\n=== 执行后 ===");
  [rows] = await c.query("SELECT id, name, label, scope, LEFT(permissions, 80) as perm FROM admin_roles ORDER BY scope, name");
  rows.forEach(r => console.log(r.id, "|", r.scope, "|", r.label, "|", r.perm));

  console.log("\n总角色数:", rows.length);
  c.end();
})();
