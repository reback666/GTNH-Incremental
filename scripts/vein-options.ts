// 矿脉贴图的密度候选。生成一个自包含的对比页，用于挑选。
// 运行：npx tsx scripts/vein-options.ts
import { writeFileSync } from 'node:fs';
import { PALETTE, type SpriteRect } from '../src/game/sprites';

// 形状定稿：碎石堆上立着几块大矿石。下面三版只调整内容密度。

// 原版：三块晶体 + 薄碎石底
const LEAN: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 10, 10, 3, 'stoneDark'],
  [2, 11, 2, 2, 'stoneDark'],
  [12, 11, 2, 2, 'stoneDark'],
  [4, 9, 8, 2, 'stone'],
  [4, 8, 3, 1, 'stoneLight'],
  [3, 6, 3, 4, 'ore'],
  [6, 7, 3, 3, 'oreDark'],
  [10, 5, 3, 5, 'ore'],
  [3, 5, 3, 1, 'accent'],
  [10, 4, 3, 1, 'accent'],
  [8, 10, 2, 1, 'oreDark'],
  [7, 4, 1, 1, 'oreDark'],
];

// 加料：晶体加宽到四块，碎石底座铺满整行，两侧补矿粒
const MEDIUM: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [1, 11, 14, 2, 'stoneDark'],
  [2, 9, 12, 2, 'stone'],
  [2, 9, 12, 1, 'stoneLight'],
  [2, 3, 3, 1, 'accent'],
  [2, 4, 3, 5, 'ore'],
  [5, 6, 2, 3, 'oreDark'],
  [7, 2, 4, 1, 'accent'],
  [7, 3, 4, 6, 'ore'],
  [11, 4, 3, 1, 'accent'],
  [11, 5, 3, 4, 'ore'],
  [1, 10, 1, 1, 'oreDark'],
  [14, 10, 1, 1, 'oreDark'],
  [5, 10, 1, 1, 'oreDark'],
  [10, 10, 1, 1, 'oreDark'],
  [3, 12, 2, 1, 'oreDark'],
  [7, 12, 3, 1, 'oreDark'],
];

// 更满：五块晶体挤满，碎石底座铺到两端，碎矿点更密
const FULL: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [1, 11, 14, 2, 'stoneDark'],
  [1, 9, 14, 2, 'stone'],
  [1, 9, 14, 1, 'stoneLight'],
  [1, 8, 1, 1, 'stoneDark'],
  [14, 8, 1, 1, 'stoneDark'],
  [2, 3, 3, 1, 'accent'],
  [2, 4, 3, 5, 'ore'],
  [5, 5, 2, 4, 'ore'],
  [7, 2, 4, 1, 'accent'],
  [7, 3, 4, 6, 'ore'],
  [11, 3, 3, 1, 'accent'],
  [11, 4, 3, 5, 'ore'],
  [1, 10, 1, 1, 'oreDark'],
  [14, 10, 1, 1, 'oreDark'],
  [4, 10, 1, 1, 'oreDark'],
  [9, 10, 1, 1, 'oreDark'],
  [2, 12, 3, 1, 'oreDark'],
  [8, 12, 3, 1, 'oreDark'],
  [6, 8, 2, 1, 'oreDark'],
];

const VARIANTS: { name: string; note: string; rects: SpriteRect[] }[] = [
  { name: '1 · 原版', note: '三块晶体，底座较薄 —— 你觉得空的就是这个', rects: LEAN },
  { name: '2 · 加料', note: '晶体加到四块，碎石底座铺满整行', rects: MEDIUM },
  { name: '3 · 更满', note: '五块晶体挤满，底座到两端，碎矿点更密', rects: FULL },
];

function renderSvg(rects: SpriteRect[], px: number): string {
  const body = rects
    .map(
      ([x, y, w, h, color]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PALETTE[color]}"/>`,
    )
    .join('');
  return `<svg width="${px}" height="${px}" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`;
}

const cells = VARIANTS.map((variant) =>
  [
    '<figure>',
    `<div class="box">${renderSvg(variant.rects, 168)}</div>`,
    `<figcaption><b>${variant.name}</b><span>${variant.note}</span>`,
    `<div class="small">${renderSvg(variant.rects, 44)}${renderSvg(variant.rects, 24)}</div></figcaption>`,
    '</figure>',
  ].join(''),
).join('');

const css = [
  "body{margin:0;padding:24px;background:#12161c;color:#d7dee8;font:14px/1.6 system-ui,'Microsoft YaHei',sans-serif}",
  'h1{font-size:15px;margin:0 0 16px;color:#8b97a7;font-weight:600}',
  '.grid{display:grid;gap:14px;grid-template-columns:repeat(3,1fr);max-width:1000px}',
  'figure{margin:0;background:#1b2129;border:1px solid #2f3946;border-radius:10px;padding:12px}',
  '.box{display:flex;align-items:center;justify-content:center;height:188px;background:radial-gradient(circle at 50% 65%,#232b35 0%,#171c23 70%);border-radius:8px}',
  'figcaption{display:flex;flex-direction:column;gap:4px;margin-top:10px}',
  'figcaption b{font-size:14px}',
  'figcaption span{font-size:12px;color:#8b97a7}',
  '.small{display:flex;align-items:flex-end;gap:10px;margin-top:4px}',
].join('\n');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>矿脉密度候选</title>
<style>\n${css}\n</style></head>
<body><h1>矿脉贴图 · 形状已定，只比密度（配色不变）</h1><div class="grid">${cells}</div></body></html>`;

writeFileSync('docs/vein-options.html', html, 'utf8');
console.log('已生成 docs/vein-options.html');
