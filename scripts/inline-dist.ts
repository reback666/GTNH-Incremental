// 基于 dist/web 的同一份构建生成便携入口，保留原有 Web 目录。
// file:// 不允许外部 ES 模块；便携入口需内联脚本、样式与素材。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve('dist/web');
const portableDir = resolve('dist');
const indexPath = join(distDir, 'index.html');

if (!existsSync(indexPath)) {
  throw new Error('找不到 dist/web/index.html，请先执行 vite build');
}

let html = readFileSync(indexPath, 'utf8');

function readAsset(relative: string): string {
  const cleaned = relative.replace(/^\.?\//, '');
  const full = resolve(distDir, cleaned);
  // 只允许读 dist 目录里的产物，避免被构建产物里的奇怪路径带出目录
  if (!full.startsWith(distDir)) throw new Error(`资源路径越界：${relative}`);
  return readFileSync(full, 'utf8');
}

html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_match, href: string) => `<style>\n${readAsset(href)}\n</style>`,
);

html = html.replace(
  /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_match, src: string) => {
    // 内联脚本里出现裸的 </script 会提前结束标签，必须转义
    const code = readAsset(src).replace(/<\/script/gi, '<\\/script');
    return `<script type="module">\n${code}\n</script>`;
  },
);

const friendlyPath = join(portableDir, 'GTNH-Incremental.html');
writeFileSync(friendlyPath, html, 'utf8');
writeFileSync(join(portableDir, 'index.html'), html, 'utf8');

console.log(`便携版：${friendlyPath}（${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)} KB）`);
console.log(`Web 入口：${indexPath}`);
