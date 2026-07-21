# 铁甲快狗 V2.0 小程序开发说明

## 设计原则
- 设计基准: 750rpx
- 页面背景: #0F172A（深海军蓝）
- 卡片背景: #1E293B
- 主强调色: #FF3B5C（亮红色）
- 荣誉金色: #F59E0B
- 一级正文: #E2E8F0
- 二级辅助: #94A3B8
- 分割线/进度条底色: #334155
- 成功色: #10B981

## 字体层级
- 特大号数字: 56rpx, 700
- 一级标题: 36rpx, 600
- 二级标题: 32rpx, 600
- 正文: 28rpx, 400
- 辅助小字: 24rpx, 400

## 通用组件规范
- 卡片圆角: 24rpx, box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.2)
- 按钮圆角: 16rpx, 点击缩放95%+opacity90%
- 页面左右边距: 32rpx
- 卡片内边距: 横向32rpx, 纵向24rpx
- 卡片纵向间距: 24rpx

## TabBar配置
4个Tab: 首页(index)、比赛(race)、排行(leaderboard)、我的(profile)

## 后端API接口(供参考)
### 现有接口
- POST /api/v1/auth/wx-login - 微信/手机登录
- POST /api/v1/auth/register - 玩家注册
- GET /api/v1/player/packages - 参赛包列表
- GET /api/v1/player/coupons?status=X - 玩家卡包
- GET /api/v1/season/user/info - 赛季用户信息
- POST /api/v1/player/orders - 创建订单
- GET /api/v1/player/me/profile - 用户信息

### 需要新增的接口(由后端agent负责)
- GET /api/v1/player/coupons/v2 - V2卡包(按三类券分类)
- GET /api/v1/points/balance - 积分余额
- GET /api/v1/points/mall/items - 积分兑换商品列表
- POST /api/v1/points/mall/exchange - 兑换商品
- GET /api/v1/season/config - 赛季配置
- GET /api/v1/rank/daily|weekly|total - 日/周/总榜
- POST /api/v1/race/result - 提交比赛成绩
- GET /api/v1/race/records - 历史参赛记录
- POST /api/v1/payment/wxpay - 微信支付下单
- GET /api/v1/player/checkin/stores - 可签到商家列表

## 现有页面结构
pages/
  index/       - 首页(Tab1)
  race/        - 比赛(Tab2)
  leaderboard/ - 排行(Tab3)
  profile/     - 我的(Tab4)
  login/       - 登录页
  coupon/      - 我的卡包
  packages/    - 参赛包购买
  checkin/     - 签到
  help/        - 好友助力
  edit-profile/- 编辑资料
  lottery/     - 积分抽奖(将废弃)
  task/        - 任务中心
  evaluation/  - 评估区(将废弃)
  prize/       - 奖品
  assist/      - 助力明细

## 第一期MVP开发任务分配
### Agent A: 首页(index) + TabBar调整
- 首页完整重构
- TabBar保持4个不变
- 全局样式统一

### Agent B: 比赛页(race) 重做
- 成绩展示
- 历史记录列表
- 底部转化条

### Agent C: 排行榜(leaderboard) 重做
- 日/周/总榜切换
- 前三名特殊展示
- 用户高亮
- 规则弹窗

### Agent D: 我的(profile) 调整 + 我的卡包(coupon)重做
- 段位卡片
- 福利资产
- 功能入口调整
- 卡包三类券Tab

### Agent E: 后端API补充
- 参赛包配置化接口
- 赛季周期可配置
