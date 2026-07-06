检查文件是否存在 docs/audit-tenant-sql-v2.md。如果存在，git add -A && git commit -m "feat: 多库拆分-阶段1-第1项 代码审计报告 v2 (Claude Code生成)

扫描57个.ts文件，180+条SQL查询：
- 已有operator_id过滤: ~30处
- 高危缺口(🔴): 38处分布在 operator.ts/referees.ts/venues.ts/race-packages.ts/race.ts/operator-merchant.ts
- 中危缺口(🟡): coupon-service.ts 券跨运营商发放
- 低危/无需修复: player端(user_id隔离)/merchant端(merchant_id隔离)/admin(有意跨租户)

详见 docs/audit-tenant-sql-v2.md" && git push origin main
如果文件不存在，报告这一结果并列出实际存在的 docs/ 文件。