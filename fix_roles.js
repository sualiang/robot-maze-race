const m = require("/opt/test-zone/node_modules/mysql2/promise");
const b = require("/opt/test-zone/node_modules/bcryptjs");
(async () => {
  const c = await m.createConnection({ host: "127.0.0.1", port: 3308, user: "root", password: "IronDog2026!Root", database: "robot_maze_race_common" });
  const hash = b.hashSync("admin123", 10);
  await c.execute("UPDATE admin_users SET password = ? WHERE username = ?", [hash, "admin"]);
  console.log("PWD_OK, hash:", hash.substring(0, 20) + "...");
  
  const [roles] = await c.query("SELECT id, name, label, permissions, scope FROM admin_roles ORDER BY id");
  roles.forEach(r => console.log(r.id, "|", r.name, "|", r.label, "|", typeof r.permissions, "|", String(r.permissions).substring(0, 60)));
  
  c.end();
})();
