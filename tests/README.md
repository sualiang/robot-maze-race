# 机器狗迷宫竞速 — 自动化测试

## 测试工具

| 测试对象 | 工具 | 版本 | 入口 |
|----------|------|------|------|
| 运营商后台/大屏/裁判端/总部 | Playwright | v1.61.0 | `tests/web/` |
| 玩家端小程序 | Minium | v1.6.0 | `tests/miniprogram/` |

## 前置条件

### Playwright（网页测试）
```bash
# 启动前端 dev server
cd packages/web && npx vite --port 5173 &

# 运行测试
cd robot-maze-race
npx playwright test tests/web/specs/ --project=operator
```

### Minium（小程序测试）
1. 打开微信开发者工具，登录微信号
2. 关闭开发者工具（或保持开启，CLI 会自动启用自动化端口）
3. 运行测试：
```bash
export PATH="$PATH:$HOME/Library/Python/3.9/bin"
minitest -c tests/miniprogram/config.json -s tests/miniprogram/specs
```

## 测试用例清单

### Web 端（Playwright）
- [ ] 运营商后台登录页渲染
- [ ] 管理员登录流程
- [ ] 各页面截图（9个子页面）
- [ ] 无白屏/404 检查

### 小程序端（Minium）
- [ ] 小程序启动正常
- [ ] 首页/登录页/个人中心/卡券页/参赛包/积分商城/排行榜 加载
- [ ] 段位信息显示
- [ ] 卡券4Tab切换
- [ ] 积分商品列表
- [ ] 参赛包详情

## 注意
- Minium 需要开发者工具 CLI 支持，首次运行 IDE 会自动打开
- Playwright 用系统 Chrome（`channel: 'chrome'`），不额外下载浏览器
- 测试结果截图/报告在对应 `reports/` 或 `screenshots/` 目录
