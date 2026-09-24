// 把构建产物内联成单个 HTML 文件。
//
// 动机：浏览器不允许 file:// 页面加载外部 ES 模块（CORS 会直接拦掉），
// 所以双击 dist/index.html 会是白屏。内联成 <script type="module"> 之后没有外部请求，
// 双击就能玩，也方便直接把这一个文件发给别人。
//
// 运行：npx tsx scripts/inline-dist.ts（已挂在 npm run build 末尾）
import { existsSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve('dist');
const indexPath = join(distDir, 'index.html');

if (!existsSync(indexPath)) {
  throw new Error('找不到 dist/index.html，请先执行 vite build');
}

let html = readFileSync(indexPath, 'utf8');
const usedAssets = new Set<string>();

function readAsset(relative: string): string {
  const cleaned = relative.replace(/^\.?\//, '');
  const full = resolve(distDir, cleaned);
  // 只允许读 dist 目录里的产物，避免被构建产物里的奇怪路径带出目录
  if (!full.startsWith(distDir)) throw new Error(`资源路径越界：${relative}`);
  usedAssets.add(cleaned);
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

writeFileSync(indexPath, html, 'utf8');

// 资源已经内联，清掉不再被引用的 assets 目录，保持产物干净
// 资源已经内联，清掉不再被引用的 assets 目录。
// 逐文件删 + rmdir，不用递归删除：某些环境会静默忽略 rmSync 的 recursive。
const assetsDir = join(distDir, 'assets');
if (existsSync(assetsDir)) {
  try {
    for (const entry of readdirSync(assetsDir)) unlinkSync(join(assetsDir, entry));
    rmdirSync(assetsDir);
  } catch (error) {
    console.warn('  assets 目录未能清理（不影响使用）：', error);
  }
}

const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log('');
console.log(`构建完成，可玩文件就这一个（${sizeKb} KB）：`);
console.log(`  ${indexPath}`);
console.log('双击即可打开，也可以直接发送给别人。');
console.log('注意：项目根目录的 index.html 是开发入口，双击打不开，只能用 npm run dev。');
