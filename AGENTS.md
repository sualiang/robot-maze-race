# 数据库规范

## 强制使用 MySQL
本项目数据库为 MySQL 8.0+。**严禁在 SQL 查询中使用 SQLite 语法。**

### SQLite 写法 → MySQL 正确写法对照表

| 功能 | ❌ SQLite (禁止) | ✅ MySQL (正确) |
|------|-----------------|----------------|
| 当前时间 | `datetime('now')` | `NOW()` |
| 指定时间 | `datetime('2026-01-01')` | `'2026-01-01'` |
| 当前日期 | `datetime('now', 'start of day')` | `CURDATE()` |
| 加N天 | `datetime('now', '+365 days')` | `DATE_ADD(NOW(), INTERVAL 365 DAY)` |
| 加变量天数 | `datetime('now', '+' \|\| $N \|\| ' days')` | `DATE_ADD(NOW(), INTERVAL CAST($N AS SIGNED) DAY)` |
| 保留字列名 | `key`（无引号） | `` `key` ``（反引号） |

### 其他 MySQL 规范
- 字符串拼接用 `CONCAT()`，不用 `||`
- 参数占位符用 `?` 或 `$1`，不用 `$N`（取决于驱动）
- 布尔值用 `1/0` 或 `TRUE/FALSE`，不用 `'true'/'false'` 字符串
- 所有表名和列名遇到 MySQL 保留字必须加反引号 `` `name` ``
- 建表用 InnoDB 引擎，字符集 utf8mb4

### MySQL 保留字（常见，必须加反引号）
`key`, `order`, `group`, `status`, `condition`, `interval`, `value`, `rank`, `desc`, `match`, `user`, `password`, `date`, `time`, `index`, `partition`

## 项目开发规范
- 写新 SQL 前，对照上述对照表检查所有时间函数和保留字
- 不要从任何来源复制 SQLite 语法
