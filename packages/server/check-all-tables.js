const Database = require("better-sqlite3");
const db = new Database("./data/robot-maze-race.db");

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();

tables.forEach(t => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
  console.log(t.name + ": " + count.c + " 条");
});

db.close();
