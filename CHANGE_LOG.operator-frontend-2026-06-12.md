# 运营商后台前端重构 (2026-06-12 00:51)

## 🗑️ 删除
- **仪表盘页面** — 整页删除 `OperatorDashboard.tsx`，路由移除
- **折行路由**：根路由 `/operator/dashboard` → 改为 `/operator/venues`

## 🔄 赛场景管理整合（Tabs切换）
- `VenueList.tsx` 重新设计为 **Tabs** 结构：赛场列表 + 比赛管理
- **比赛管理** `OperatorRaces.tsx` 作为子Tab整合到赛场管理页

## 🌐 新建赛场 - 省市区 Cascader
- 从 `/api/v1/operator/regions` API 加载省市区数据
- 新建/编辑表单均使用 antd `<Cascader>` 选择省市区（取代原来的本地数据）
- 排队上限 `max_capacity` 设为 `disabled` 只读（取总部设置的排队上限，后端默认）

## 🤝 新增"绑定裁判员"操作
- VenueList 每行新增"绑定裁判员"按钮
- 弹窗显示所有可用裁判员，Select 多选
- 后端新增两个 API：
  - `GET /api/v1/venues/:id/referees` — 获取已绑裁判员列表
  - `PUT /api/v1/venues/:id/referees` — 覆写式绑定裁判员
- 绑定后列表自动刷新

## 👥 角色与成员管理（新增）
- **后端**：
  - `admin_users` 表新增 `operator_id` 字段（引用 operators.id）
  - `operator.ts` 新增 5 个 RBAC 端点：
    - `GET /operator/rbac/roles` — 3个预定义角色
    - `GET /operator/rbac/users` — 运营商下成员列表
    - `POST /operator/rbac/users` — 创建成员
    - `PUT /operator/rbac/users/:id` — 编辑成员
    - `DELETE /operator/rbac/users/:id` — 删除成员
    - `POST /operator/rbac/users/:id/reset-password` — 重置密码
  - 所有 API 按 `operator_id` 隔离数据
- **前端**：
  - `OperatorRbac.tsx` — Tabs容器（成员管理 + 角色权限说明）
  - `OperatorUserManage.tsx` — 成员CRUD（增删改查、搜索、重置密码弹窗）
  - `OperatorRoleManage.tsx` — 角色权限表格说明
- 菜单栏新增 **"角色与成员管理"** 频道（盾牌图标）

## 💰 财务中心重构
- **删除**「支付流水」子频道
- **删除**「可提现」统计数据（之前显示的可提现金额已全部去除）
- **只保留4个统计卡片**：今日营收、本月营收、今日订单、本月订单
- 子频道 Tabs → 营收明细 + 结算记录（移除支付流水）

## 👤 个人中心重写
- **只保留**两个 Tab：**修改登录密码** + **登出**
- 移除个人资料编辑、信息查看等其他所有内容

## 🎯 营销管理
- 营销管理页面 `MarketingConfig.tsx` 继承全局设置，未改动（确认已是全局配置模式）

## ✅ 编译验证
- 前端 `npx tsc --noEmit`：EXIT:0 ✅
- 后端 `npx tsc`：EXIT:0 ✅
- 后端 pm2 重启：online ✅
- 前端 Vite hot-reload：running ✅
