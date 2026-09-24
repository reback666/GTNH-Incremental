// 矿脉贴图的形状候选。生成一个自包含的对比页，用于挑选形状。
// 运行：npx tsx scripts/vein-options.ts
import { writeFileSync } from 'node:fs';
import { PALETTE, type SpriteRect } from '../src/game/sprites';

const CURRENT: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 9, 10, 4, 'stoneDark'],
  [2, 10, 2, 3, 'stoneDark'],
  [12, 10, 2, 3, 'stoneDark'],
  [4, 7, 8, 3, 'stone'],
  [5, 6, 3, 1, 'stoneLight'],
  [7, 4, 2, 2, 'stoneLight'],
  [6, 3, 1, 1, 'stone'],
  [6, 8, 2, 2, 'ore'],
  [10, 9, 2, 2, 'ore'],
  [4, 11, 2, 2, 'oreDark'],
  [9, 6, 1, 1, 'ore'],
  [12, 11, 1, 1, 'oreDark'],
];

// A：斜向矿脉带 —— 一块方形岩体，矿石像矿脉一样斜穿过去
const A: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [1, 4, 14, 9, 'stone'],
  [1, 4, 14, 1, 'stoneLight'],
  [2, 3, 12, 1, 'stoneLight'],
  [1, 12, 14, 1, 'stoneDark'],
  [2, 10, 3, 2, 'oreDark'],
  [4, 9, 3, 2, 'ore'],
  [6, 8, 3, 2, 'ore'],
  [8, 7, 3, 2, 'ore'],
  [10, 6, 3, 2, 'ore'],
  [12, 5, 2, 1, 'oreDark'],
  [3, 6, 2, 1, 'oreDark'],
  [11, 10, 2, 1, 'oreDark'],
];

// B：矿石簇 —— 碎石堆上立着几块大矿石，像裸露的矿脉
const B: SpriteRect[] = [
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

// C：矿石断面 —— 方块岩体，表面嵌着大小不一的矿石
const C: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [2, 2, 12, 11, 'stoneDark'],
  [3, 3, 10, 9, 'stone'],
  [3, 3, 10, 1, 'stoneLight'],
  [3, 11, 10, 1, 'stoneDark'],
  [4, 5, 2, 2, 'ore'],
  [8, 4, 3, 2, 'ore'],
  [5, 9, 3, 2, 'ore'],
  [10, 8, 2, 2, 'oreDark'],
  [6, 6, 1, 1, 'oreDark'],
  [11, 5, 1, 1, 'oreDark'],
  [4, 9, 1, 1, 'oreDark'],
];

// D：蜂窝矿脉 —— 矿石连成一片，分布更密
const D: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [2, 2, 12, 11, 'stoneDark'],
  [3, 3, 10, 9, 'stone'],
  [3, 3, 10, 1, 'stoneLight'],
  [5, 5, 2, 2, 'ore'],
  [8, 6, 2, 2, 'ore'],
  [6, 8, 2, 2, 'ore'],
  [9, 9, 2, 2, 'ore'],
  [3, 7, 2, 2, 'ore'],
  [11, 4, 1, 2, 'oreDark'],
  [10, 7, 1, 1, 'oreDark'],
  [7, 4, 1, 1, 'oreDark'],
];

const VARIANTS: { name: string; note: string; rects: SpriteRect[] }[] = [
  { name: '现在这个', note: '岩石丘 + 零散矿点', rects: CURRENT },
  { name: 'A · 斜向矿脉带', note: '矿石像矿脉一样斜穿整块岩石', rects: A },
  { name: 'B · 矿石簇', note: '碎石堆上立着几块大矿石', rects: B },
  { name: 'C · 方块矿石断面', note: '方块岩体，表面嵌着大小不一的矿石', rects: C },
  { name: 'D · 蜂窝矿脉', note: '矿石连成一片，分布更密', rects: D },
];

function renderSvg(rects: SpriteRect[], px: number): string {
  const body = rects
    .map(([x, y, w, h, color]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PALETTE[color]}"/>`)
    .join('');
  return `<svg width="${px}" height="${px}" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`;
}

const cells = VARIANTS.map((variant) => {
  return [
    '<figure>',
    `<div class="box">${renderSvg(variant.rects, 152)}</div>`,
    `<figcaption><b>${variant.name}</b><span>${variant.note}</span>`,
    `<div class="small">${renderSvg(variant.rects, 40)}${renderSvg(variant.rects, 22)}</div></figcaption>`,
    '</figure>',
  ].join('');
}).join('');

const css = [
  "body{margin:0;padding:24px;background:#12161c;color:#d7dee8;font:14px/1.6 system-ui,'Microsoft YaHei',sans-serif}",
  'h1{font-size:15px;margin:0 0 16px;color:#8b97a7;font-weight:600}',
  '.grid{display:grid;gap:14px;grid-template-columns:repeat(3,1fr)}',
  'figure{margin:0;background:#1b2129;border:1px solid #2f3946;border-radius:10px;padding:12px}',
  '.box{display:flex;align-items:center;justify-content:center;height:170px;background:radial-gradient(circle at 50% 65%,#232b35 0%,#171c23 70%);border-radius:8px}',
  'figcaption{display:flex;flex-direction:column;gap:4px;margin-top:10px}',
  'figcaption b{font-size:14px}',
  'figcaption span{font-size:12px;color:#8b97a7}',
  '.small{display:flex;align-items:center;gap:10px;margin-top:4px}',
].join('\n');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>矿脉形状候选</title>
<style>\n${css}\n</style></head>
<body><h1>矿脉贴图形状候选（配色不变）</h1><div class="grid">${cells}</div></body></html>`;

writeFileSync('docs/vein-options.html', html, 'utf8');
console.log('已生成 docs/vein-options.html');
