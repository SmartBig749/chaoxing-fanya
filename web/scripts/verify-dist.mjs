#!/usr/bin/env node
/**
 * 交付产物校验：确保 web/dist 是最新构建，且确实包含关键功能。
 *
 * 背景：web/dist 曾长期停留在旧构建，导致后端托管 (:5000) 的界面里
 * 「章节选择」等功能完全不存在，而源码却是新的——排查时极易误判。
 *
 * 用法：
 *   node scripts/verify-dist.mjs          # 校验，失败时退出码 1
 *   node scripts/verify-dist.mjs --warn   # 只告警不失败
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '..');
const DIST = path.join(WEB_ROOT, 'dist');
const SRC = path.join(WEB_ROOT, 'src');

const WARN_ONLY = process.argv.includes('--warn');

/** 必须出现在产物中的关键功能文案 */
const REQUIRED_TEXTS = [
  { label: '章节选择入口', text: '选择章节' },
  { label: '自定义章节模式', text: '自定义选择' },
  { label: '只选未完成', text: '只选未完成' },
  { label: '范围选择', text: '应用范围' },
  { label: '会话恢复', text: '正在恢复登录状态' },
  { label: '失联提示', text: '与后端失去连接' },
];

const problems = [];
const fail = (msg) => { problems.push(msg); console.error(`✗ ${msg}`); };
const pass = (msg) => console.log(`✓ ${msg}`);

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

if (!fs.existsSync(DIST)) {
  console.error(`✗ 未找到构建产物目录 ${DIST}，请先执行 npm run build`);
  process.exit(1);
}

const indexPath = path.join(DIST, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`✗ 未找到 ${indexPath}`);
  process.exit(1);
}

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const assetRefs = [...indexHtml.matchAll(/(?:src|href)="\/?assets\/([^"]+)"/g)].map((m) => m[1]);

if (assetRefs.length === 0) {
  fail('dist/index.html 没有引用任何 assets/ 资源，产物可能不完整');
} else {
  assetRefs.forEach((name) => {
    if (!fs.existsSync(path.join(DIST, 'assets', name))) {
      fail(`index.html 引用了不存在的资源：assets/${name}`);
    }
  });
  if (problems.length === 0) pass(`index.html 引用的 ${assetRefs.length} 个资源均存在`);
}

const jsAssets = fs.existsSync(path.join(DIST, 'assets'))
  ? fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
  : [];

if (jsAssets.length === 0) {
  fail('dist/assets 下没有 .js 产物');
} else {
  const bundle = jsAssets.map((f) => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8')).join('\n');
  const missing = REQUIRED_TEXTS.filter((item) => !bundle.includes(item.text));
  if (missing.length) {
    fail(`产物缺少关键功能文案：${missing.map((m) => `${m.label}(${m.text})`).join('、')}`);
  } else {
    pass(`产物包含全部 ${REQUIRED_TEXTS.length} 项关键功能文案`);
  }
}

// 产物是否落后于源码：任一源文件比产物新即判定过期
if (fs.existsSync(SRC) && jsAssets.length) {
  const srcTime = newestMtime(SRC);
  const distTime = Math.max(
    ...jsAssets.map((f) => fs.statSync(path.join(DIST, 'assets', f)).mtimeMs),
    fs.statSync(indexPath).mtimeMs
  );
  if (srcTime > distTime) {
    const lag = Math.round((srcTime - distTime) / 1000);
    fail(`dist 落后于源码约 ${lag} 秒：源码已改动但未重新构建，请执行 npm run build`);
  } else {
    pass('dist 不早于 src，产物与源码一致');
  }
}

if (problems.length) {
  console.error(`\n产物校验失败（${problems.length} 项）。`);
  if (WARN_ONLY) {
    console.error('（--warn 模式：仅告警，不影响退出码）');
    process.exit(0);
  }
  process.exit(1);
}

console.log('\n产物校验通过。');
