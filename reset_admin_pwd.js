const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
(async () => {
  const conn = await mysql.createConnection({ host:"127.0.0.1", port:3308, user:"root", password:"IronDog2026!Root", database:"robot_maze_race_common" });
  const hash = bcrypt.hashSync("admin123", 10);
  console.log("New hash:", hash);
  const [r] = await conn.execute("UPDATE admin_users SET password = ? WHERE username = ?", [hash, "admin"]);
  console.log("Updated, affected:", r.affectedRows);
  conn.end();
})();
