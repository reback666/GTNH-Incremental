// 将专用的内联构建转换成便携入口，保留独立的 Web 目录。
// file:// 不允许外部 ES 模块；便携入口需内联脚本、样式与素材。
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function inlineDist(directory: string, entry = 'index.html'): string {
  const distDir = resolve(directory);
  const indexPath = join(distDir, entry);
  if (!existsSync(indexPath)) throw new Error(`找不到构建入口：${indexPath}`);
  let html = readFileSync(indexPath, 'utf8');

  function readAsset(relative: string): string {
    const cleaned = relative.replace(/^\.?\//, '');
    const full = resolve(distDir, cleaned);
    // 只允许读构建目录里的产物。
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
      // 内联脚本里出现裸的 </script 会提前结束标签，必须转义。
      const code = readAsset(src).replace(/<\/script/gi, '<\\/script');
      return `<script type="module">\n${code}\n</script>`;
    },
  );

  return html;
}
