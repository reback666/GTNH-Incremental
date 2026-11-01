import { mkdirSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { inlineDist } from './inline-dist';

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
  const input = resolve(demo ? 'demo.html' : 'index.html');
  await build({ build: { outDir: output, emptyOutDir: true, rollupOptions: { input } } });
  const portableOutput = resolve(temporary, 'portable');
  await build({ build: {
    outDir: portableOutput,
    assetsInlineLimit: 4_000_000,
    rollupOptions: { input, output: { inlineDynamicImports: true } },
  } });
  const html = inlineDist(portableOutput, demo ? 'demo.html' : 'index.html');
  const portable = resolve(demo ? 'dist/GTNH-Incremental-演示.html' : 'dist/GTNH-Incremental.html');
  writeFileSync(portable, html, 'utf8');
  if (!demo) writeFileSync(resolve('dist/index.html'), html, 'utf8');
  console.log(`便携版：${portable}（${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)} KB）`);
  console.log(`Web 入口：${resolve(output, demo ? 'demo.html' : 'index.html')}`);
} finally {
  if (previousTemp === undefined) delete process.env.TEMP; else process.env.TEMP = previousTemp;
  if (previousTmp === undefined) delete process.env.TMP; else process.env.TMP = previousTmp;
  rmSync(temporary, { recursive: true, force: true });
  try { rmdirSync(temporary); } catch { /* cleanup may already have removed it */ }
  try { rmdirSync(temporaryRoot); } catch { /* keep the root if another local build uses it */ }
}
