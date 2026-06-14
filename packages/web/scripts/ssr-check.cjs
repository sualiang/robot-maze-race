/**
 * 服务端渲染 (SSR) 兼容性检查
 *
 * 使用方法:
 *   node scripts/ssr-check.js
 *
 * 说明:
 *   检查 web 前端包的代码是否兼容服务端渲染。
 *   - 扫描 .ts / .tsx 文件中是否直接使用浏览器全局对象
 *   - 检查项目配置是否支持 SSR
 *   - 输出检查报告
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, 'src');

// ---------- 配置 ----------
// 需要检查的文件模式
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// 需要排除的目录片段
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git'];

// 浏览器全局对象访问模式（SSR 不兼容）
const BROWSER_GLOBALS_PATTERNS = [
  { pattern: /\bwindow\b/, name: 'window' },
  { pattern: /\bdocument\b/, name: 'document' },
  { pattern: /\blocalStorage\b/, name: 'localStorage' },
  { pattern: /\bsessionStorage\b/, name: 'sessionStorage' },
  { pattern: /\bnavigator\b/, name: 'navigator' },
  { pattern: /\blocation\b/, name: 'location (直接访问)' },
];

// ---------- 辅助函数 ----------

function getAllFiles(dir, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.some(e => fullPath.includes(e))) {
        getAllFiles(fullPath, result);
      }
    } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name))) {
      result.push(fullPath);
    }
  }
  return result;
}

function isInNodeModules(filePath) {
  return filePath.includes('node_modules');
}

function isTestFile(filePath) {
  return filePath.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/);
}

function isConfigFile(filePath) {
  return filePath.match(/\.config\.(ts|js)$/) || filePath.match(/\/vite-env\.d\.ts$/);
}

// 检查文件是否包含浏览器全局变量
function checkBrowserGlobals(filePath, content) {
  const results = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const { pattern, name } of BROWSER_GLOBALS_PATTERNS) {
      // 跳过注释行
      const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (pattern.test(stripped)) {
        results.push({
          file: path.relative(ROOT, filePath),
          line: lineNum,
          content: line.trim(),
          issue: `直接引用 ${name}`,
        });
      }
    }
  }

  return results;
}

// 判断是否已经做了 SSR 防护（typeof window !== 'undefined' 等）
function hasSSRGuard(content) {
  const guardPatterns = [
    /typeof window\s*(===|!==)\s*(['"])undefined['"]/,
    /typeof document\s*(===|!==)\s*(['"])undefined['"]/,
    /typeof localStorage\s*(===|!==)\s*(['"])undefined['"]/,
    /typeof navigator\s*(===|!==)\s*(['"])undefined['"]/,
    /typeof location\s*(===|!==)\s*(['"])undefined['"]/,
    /import\.meta\.env\.SSR/,
    /process\.env\.SSR/,
    /typeof window\s*!==\s*(['"])undefined['"]/,
  ];
  return guardPatterns.some(p => p.test(content));
}

// 检查 import.meta.env 使用
function checkImportMetaEnv(content) {
  const envPattern = /import\.meta\.env\.(\w+)/g;
  const matches = [];
  let match;
  while ((match = envPattern.exec(content)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

// 检查 vite.config.ts 的 SSR 配置
function checkViteConfig() {
  const configPath = path.join(ROOT, 'vite.config.ts');
  if (!fs.existsSync(configPath)) {
    return { hasSsrConfig: false, hasBuildConfig: false };
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return {
    hasSsrConfig: /ssr\s*:/i.test(content),
    hasBuildConfig: /build\s*:/.test(content),
    hasSSRDirectives: /ssr(?:\.\w+)?\s*[=:]/.test(content),
  };
}

// 检查 package.json 的 build script
function checkPackageJson() {
  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) return { buildScript: null, dependencies: {} };

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return {
    buildScript: pkg.scripts?.build || '未配置',
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    hasReactDOMServer: !!pkg.dependencies?.['react-dom'],
  };
}

// ---------- 主检查函数 ----------

function runSSRCheck() {
  console.log('='.repeat(70));
  console.log('  SSR (服务端渲染) 兼容性检查报告');
  console.log('  Web 包路径:', ROOT);
  console.log('='.repeat(70));

  // 1. 扫描所有 source 文件
  console.log('\n[1/4] 扫描浏览器全局变量引用...');
  const allFiles = getAllFiles(SRC);
  console.log(`  共 ${allFiles.length} 个文件`);

  let totalIssues = 0;
  let filesWithGuard = 0;
  let filesWithoutGuard = 0;

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const results = checkBrowserGlobals(filePath, content);

    if (results.length > 0) {
      const hasGuard = hasSSRGuard(content);
      if (hasGuard) {
        filesWithGuard++;
        // 即使有防护，也显示可能的问题点（标注已防护）
        console.log(`\n  📁 ${path.relative(ROOT, filePath)} (✅ 已有 SSR 防护)`);
        for (const r of results) {
          console.log(`    ⚠️  第 ${r.line} 行: ${r.content.substring(0, 80)}`);
          console.log(`       类型: ${r.issue} — 但文件已有 typeof 防护`);
        }
      } else {
        filesWithoutGuard++;
        console.log(`\n  📁 ${path.relative(ROOT, filePath)} (❌ 无 SSR 防护)`);
        for (const r of results) {
          console.log(`    🚫 第 ${r.line} 行: ${r.content.substring(0, 80)}`);
          console.log(`      问题: ${r.issue}`);
        }
      }
      totalIssues += results.length;
    }
  }

  if (totalIssues === 0) {
    console.log('  ✅ 所有文件均未直接引用浏览器全局变量');
  }

  // 2. 检查项目配置是否支持 SSR
  console.log('\n[2/4] 检查项目配置...');
  const viteConfig = checkViteConfig();
  const pkg = checkPackageJson();

  console.log(`  - Vite SSR 配置: ${viteConfig.hasSsrConfig ? '已配置 ✅' : '未配置 ❌'}`);
  console.log(`  - React 依赖: ${pkg.hasReactDOMServer ? '已安装 ✅' : '未安装 ❌'}`);

  if (pkg.buildScript) {
    console.log(`  - 构建命令: ${pkg.buildScript}`);
  }

  // 3. 检查是否可以使用 SSR 构建
  console.log('\n[3/4] 检查 SSR 构建可行性...');
  const hasIndexHtml = fs.existsSync(path.join(ROOT, 'index.html'));
  const hasMainTsx = fs.existsSync(path.join(SRC, 'main.tsx'));
  console.log(`  - index.html: ${hasIndexHtml ? '存在 ✅' : '缺失 ❌'}`);
  console.log(`  - src/main.tsx: ${hasMainTsx ? '存在 ✅' : '缺失 ❌'}`);

  // 检查 main.tsx 是否使用了 createRoot (CSR only)
  if (hasMainTsx) {
    const mainContent = fs.readFileSync(path.join(SRC, 'main.tsx'), 'utf-8');
    const hasCreateRoot = mainContent.includes('createRoot');
    const hasHydrate = mainContent.includes('hydrateRoot');
    console.log(`  - SSR 入口点: ${hasHydrate ? '已使用 hydrateRoot ✅' : '使用 createRoot (CSR) ⚠️'}`);
    console.log(`  - 是否需要改为 hydrateRoot: ${hasCreateRoot && !hasHydrate ? '是' : '否'}`);
  }

  // 4. 总结
  console.log('\n[4/4] 检查总结');
  console.log('-'.repeat(60));

  const score = Math.max(0, 100 -
    (totalIssues > 0 ? 30 : 0) -
    (viteConfig.hasSsrConfig ? 0 : 25) -
    (filesWithoutGuard > 0 ? 20 * Math.min(1, filesWithoutGuard / 5) : 0) -
    (pkg.hasReactDOMServer ? 0 : 15));

  console.log(`  SSR 就绪评分: ${score}/100`);
  console.log(`  - 浏览器全局引用: ${totalIssues} 处`);
  console.log(`    - 已有防护: ${filesWithGuard} 个文件`);
  console.log(`    - 无防护: ${filesWithoutGuard} 个文件`);
  console.log(`  - 项目使用 React SPA (Vite + React Router)`);
  console.log('');

  if (score < 70) {
    console.log('  📋 SSR 改造建议:');
    console.log('    1. 在 vite.config.ts 中添加 ssr: { external: [...] } 配置');
    console.log('    2. 将 src/main.tsx 改为支持 hydrateRoot 的 SSR 入口');
    console.log('    3. 创建 server.js 入口（Node Express/Fastify 服务）');
    console.log('    4. 使用 import.meta.env.SSR 或 typeof window !== "undefined" 做环境判断');
    console.log('    5. 所有 window/document/localStorage 引用需包裹在客户端条件判断中');
    console.log('    6. antd + BrowserRouter 本身 SSR 兼容，无需更换');
    console.log('    7. 更新 package.json 添加 "build:ssr" 脚本');
  } else {
    console.log('  ✅ 项目已基本具备 SSR 改造条件');
  }

  console.log('='.repeat(70));
  return { totalIssues, filesWithGuard, filesWithoutGuard, score };
}

// ---------- 导出 & 执行 ----------

if (require.main === module) {
  const result = runSSRCheck();
  process.exit(result.totalIssues > 0 ? 1 : 0);
}

module.exports = { runSSRCheck };
