# 段位升级奖励 + 奖杯图标 —— 变更记录 (2026-06-21)

## 后端改动

### season.ts
- 新增 `grantLevelUpReward()` 函数
  - 自动升段后触发
  - 查 system_config 获取奖励配置（优惠券金额、积分、有效期）
  - 防重复发放（按 extra_data 标记 + coupon_type=20）
  - 发放优惠券 → user_coupons 表（merchant_id=platform）
  - 赠送积分 → UPDATE users.points + INSERT points_transactions(type='level_up_reward')
  - 记录 coupon 日志
- `/user/info` 新增 `upgradeDesc` 字段（动态拼装下一级的奖励说明）
- 新增 import `getConfig`, `uuid`

### 数据库变更（已通过子 agent 执行）

#### 新增 merchants 记录
- id: `platform`
- merchant_name: `赛事官方`
- audit_status: 3（已通过）

#### 新增 system_config（24条）
| Key | 白银 | 黄金 | 铂金 | 钻石 | 大师 |
|-----|------|------|------|------|------|
| coupon_cents | 500 | 1500 | 2500 | 3000 | 4000 |
| points | 50 | 100 | 200 | 400 | 800 |
| valid_days | 30 | 30 | 30 | 30 | 30 |
| grant_once | true | true | true | true | true |

## 前端改动

### profile.js
- medalInfo 增加 `level` 字段（用于动态展示奖杯图标）
- 根据后端返回的 `res.levelName` 显示段位名称

### profile.wxml
- 奖杯 emoji 改为 `<image src="/assets/images/trophy-{{level}}.svg">`
- 赛季未开启占位图也用同款青铜图标

### profile.wxss
- 新增 `.trophy-icon` 样式（80x80rpx）

### 新增资源
- assets/images/trophy-{1..6}.svg — 6色奖杯SVG图标

## 验证结果
- API 返回：levelName="黄金选手", upgradeDesc="升级铂金选手立得：25元无门槛参赛抵价券 + 200积分"
- 数据库：platform 商家已创建，24条配置已入库
