import { mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const demo = process.argv.includes('--demo');
const output = resolve(demo ? 'dist/demo' : 'dist/web');
const temporaryRoot = resolve('outputs/.tmp');
mkdirSync(temporaryRoot, { recursive: true });
const temporary = mkdtempSync(resolve(temporaryRoot, 'game-build-'));
const previousTemp = process.env.TEMP;
const previousTmp = process.env.TMP;
// Windows may deny esbuild's removal of large transform files in the system temp root.
process.env.TEMP = temporary;
process.env.TMP = temporary;
try {
  await build(demo ? { build: { outDir: output, rollupOptions: { input: resolve('demo.html') } } } : {});
  if (demo) {
    const asset = (relative: string): string => readFileSync(resolve(output, relative.replace(/^\.?\//, '')), 'utf8');
    let html = readFileSync(resolve(output, 'demo.html'), 'utf8');
    html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_match, href: string) => `<style>${asset(href)}</style>`);
    html = html.replace(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_match, src: string) => `<script type="module">${asset(src).replace(/<\/script/gi, '<\\/script')}</script>`);
    const portable = resolve('dist/GTNH-Incremental-演示.html');
    writeFileSync(portable, html, 'utf8');
    console.log(`演示入口：${portable}`);
  } else {
    await import('./inline-dist');
  }
} finally {
  if (previousTemp === undefined) delete process.env.TEMP; else process.env.TEMP = previousTemp;
  if (previousTmp === undefined) delete process.env.TMP; else process.env.TMP = previousTmp;
  rmSync(temporary, { recursive: true, force: true });
  try { rmdirSync(temporary); } catch { /* cleanup may already have removed it */ }
  try { rmdirSync(temporaryRoot); } catch { /* keep the root if another local build uses it */ }
}
