---
name: "playwright-console-test"
description: "Playwright全量Console捕获 + 真人模拟测试模式（铁甲快狗验证过的方案）"
---

# Playwright 全量 Console 捕获测试方案

## 核心理念

不是跑完就完，而是**逐层深入、问题驱动、反复验证**：
1. 全面扫一遍 → 发现问题 → 修复 → 回归验证 → 发现隐藏问题 → 再修复
2. Console 报错是核心，API 响应是参考，两者结合定位真实 Bug
3. 真人操作 vs Playwright 模拟的差异要区分：不是所有"操作失败"都是 Bug

## 环境准备

```bash
# Playwright 安装在全局 npm 目录
export NODE_PATH=/Users/longshe/.npm-global/lib/node_modules

# 截图目录
mkdir -p test-screenshots/

# Console 日志目录  
mkdir -p reports/console-logs/
```

## 测试分层流程

### 第一层：全面遍历（广度优先）
1. 登录所有端（总部后台、裁判端、运营商端、商家端、大屏端）
2. 每个端的每个一级菜单点一遍
3. 每个页面的每个功能按钮点一遍（详情、编辑、新建、删除、导出等）
4. 不做深度表单操作，只看页面能否正常加载

**产出：** 粗筛问题列表 + 各页面 Console 基线

### 第二层：功能深挖（重点功能全流程）
1. 新建表单：填所有字段，提交
2. 编辑表单：改一个参数，保存
3. 禁用/启用：点按钮 → popconfirm 确认 → 验证结果
4. 删除：点按钮 → popconfirm 确认 → 验证结果
5. 搜索/筛选：输入关键词 → 回车触发搜索
6. 导出：点导出按钮 → 验证 API 响应

### 第三层：单点精准测试（修复后回归验证）
1. 小C修复后重新验证修复点
2. 确认修复前后 Console 报错消除
3. 检查修复是否引入新问题

## 关键事件捕获

### 全量 Console 不遗漏
```javascript
let consoleSeq = 0;
const allConsole = [];

page.on('console', msg => {
  allConsole.push({
    seq: ++consoleSeq,
    type: msg.type(),     // error, warning, log, info, debug, verbose
    text: msg.text().slice(0, 500)
  });
  if (msg.type() === 'error' || msg.type() === 'warning')
    console.log(`  [${msg.type()}] #${seq}: ${msg.text()}`);
});

page.on('pageerror', err => {
  allConsole.push({
    seq: ++consoleSeq,
    type: 'pageerror',
    text: (err.stack || err.message || String(err)).slice(0, 500)
  });
  console.log(`  [pageerror] #${consoleSeq}: ${err.message || err.stack}`);
});

page.on('requestfailed', req => {
  allConsole.push({
    seq: ++consoleSeq,
    type: 'requestfailed',
    text: `${req.url().slice(0, 100)}: ${req.failure()?.errorText}`
  });
});
```

### API 响应跟踪（POST/PATCH/DELETE）
```javascript
page.on('response', resp => {
  const url = resp.url();
  const method = resp.request().method();
  if (url.includes('/api/') && ['POST','PATCH','DELETE'].includes(method)) {
    resp.text().then(body => {
      console.log(`  ${resp.status() >= 400 ? '🛑' : '✅'} API ${method} ${url} -> ${resp.status()}: ${body.slice(0, 200)}`);
    }).catch(() => {});
  }
});
```

## Ant Design 组件交互注意事项

### ✅ 安全的操作（Playwright 原生工作良好）
- 点按钮 (`page.locator('button:has-text("刷新")').click()`)
- 点菜单、标签页
- 表格行操作按钮（详情/编辑/禁用/删除）
- popconfirm 确认 (`ant-popconfirm .ant-btn-primary`)
- 翻页、搜索输入

### ⚠️ 有风险的操作（需额外处理）
- **Text input**: 用 `fill()` 基本 OK，Cascader 选择后 DOM 刷新可能导致 input 引用失效，需重新定位
- **Cascader（省市区级联）**: 点开后用 `page.locator('.ant-cascader-menu-item').first()` 逐级点击，每级间隔 500ms+
- **Select（下拉选择）**: 用 `.ant-form-item`.filter({hasText}).locator('.ant-select') 定位后点击，注意下拉关闭后 DOM 可能重建
- **表单提交**: 用 `.ant-modal-footer .ant-btn-primary` 定位提交按钮

### ❌ 已知问题（非 Bug，Playwright 事件链差异）
- 点 Select 选项后可能触发 React `removeChild` 异常（`NotFoundError: Failed to execute 'removeChild' on 'Node'`）
- 选择后可能导致页面导航/刷新（但不是真实用户操作的 Bug）
- 解决方案：每步间隔加大（500ms+），操作后等待 DOM stable

## 问题分级与记录

### Bug 分级
| 级别 | 说明 | 处理 |
|------|------|------|
| P0 | 页面白屏/崩溃，核心功能不可用 | 立即停线修复 |
| P1 | 功能逻辑错误（500/404 API错误，操作无响应） | 高优先级修复 |
| P2 | 表单验证问题、UI异常、缺少提示 | 按计划修复 |
| P3 | Console warning/noise | 优化建议 |

### 记录格式
```markdown
**URL:** https://...
**操作:** 点击XX按钮 → 确认XX弹窗
**Console报错:**
```
#1 [error] Failed to load resource: 500 ()
#2 [pageerror] ...
```
**API响应:** POST /api/... → 500 {"code":500,"message":"..."}
**状态:** 🐛 Bug / ❌ 非Bug（自动化工具差异） / ✅ 已知已修复
```

## 完整报告模板

```markdown
# 铁甲快狗 Web端 全功能测试报告

测试时间: YYYY-MM-DD
测试环境: https://amberrobot.com.cn
Playwright版本: 1.60.0

## 测试端

- [x] 总部管理后台
- [ ] 裁判端
- [ ] 运营商端
- [ ] 商家端
- [ ] 大屏端

## 测试结果概览

| 模块 | 功能点 | 结果 | 备注 |
|------|--------|------|------|
| 运营商管理 | 新建运营商 | ⚠️ | Playwright事件链问题，真人操作正常 |
| 运营商管理 | 编辑 | ✅ | |
| 运营商管理 | 禁用 | 🐛 | API 500 更新运营商状态失败 |
| ... | ... | ... | ... |

## 详细 Bug 列表

### Bug 1: 禁用运营商返回500
- **URL:** /admin/operators
- **API:** PATCH /api/v1/admin/operators/{id} → 500
- **响应:** {"code":500,"message":"更新运营商状态失败"}
- **Console:** Failed to load resource: 500
- **截图:** test-screenshots/xxx.png

## 修复跟踪

| Bug ID | 修复人 | 修复时间 | 回归结果 |
|--------|--------|----------|----------|
| Bug 1 | cc-dev | YYYY-MM-DD | ✅ |
```

## 版本历史

- v1.0 (2026-07-02): 初始版，铁甲快狗首次全功能测试实践
