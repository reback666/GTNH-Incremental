// Draw the decoded bp-13476 as an isometric image in the same style as the site
// preview, so the decoded structure can be compared with the official picture.
//
// Usage: node tools/floor-iso.mjs [out.png] [--top|--layerN]
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = readFileSync(join(ROOT, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);

const AIR = 3;
const COL = {
  0: [125, 125, 128], 1: [205, 205, 205], 2: [190, 190, 190], 3: null,
  4: [150, 118, 108], 5: [150, 88, 74], 6: [236, 238, 241], 7: [205, 205, 205],
  8: [238, 235, 228], 9: [242, 198, 38], 10: [27, 27, 30], 11: [96, 156, 66],
  12: [86, 126, 51], 13: [26, 92, 106], 14: [190, 235, 200], 15: [152, 152, 157],
  16: [242, 228, 248],
};

const VOX = 7;   // half-width of a block's iso footprint
const VH = 5;    // block height in iso pixels

function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

// choose the height source
const arg = process.argv[3] || "--top";
const RANK = new Map([
  [13, 0], [11, 1], [12, 2], [9, 3], [10, 4], [6, 5], [2, 6], [1, 7],
  [4, 8], [7, 9], [8, 10], [5, 11], [15, 12], [14, 13], [16, 14], [0, 15],
]);
const source = (x, z) => {
  if (arg === "--rank") {
    // same collapse rule as src/layout.js: highest-ranked authored block wins
    let idx = AIR;
    let best = Infinity;
    let bestLayer = 0;
    for (let y = 0; y < layers; y++) {
      const c = cells[x + z * size + y * size * size];
      if (c === AIR) continue;
      const r = RANK.has(c) ? RANK.get(c) : RANK.size;
      if (r < best) { best = r; idx = c; bestLayer = y; }
    }
    return { v: idx, h: bestLayer + 1 };
  }
  if (arg === "--top") {
    for (let y = layers - 1; y >= 0; y--) {
      const c = cells[x + z * size + y * size * size];
      if (c !== AIR) return { v: c, h: y + 1 };
    }
    return { v: AIR, h: 0 };
  }
  const y = Number(arg.replace("--layer", ""));
  return { v: cells[x + z * size + y * size * size], h: y + 1 };
};

const W = (size + size) * VOX + VOX * 2;
const H = (size + size) * (VOX / 2) + VH * (layers + 2) + 20;
const img = Buffer.alloc(W * H * 4);
// background
for (let i = 0; i < W * H; i++) { img[i * 4] = 51; img[i * 4 + 1] = 51; img[i * 4 + 2] = 77; img[i * 4 + 3] = 255; }

function put(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const d = (y * W + x) * 4;
  img[d] = c[0]; img[d + 1] = c[1]; img[d + 2] = c[2]; img[d + 3] = 255;
}
function diamond(cx, cy, col) {
  for (let dy = -VOX / 2; dy <= VOX / 2; dy++) {
    const half = VOX / 2 - Math.abs(dy);
    for (let dx = -half; dx <= half; dx++) put(Math.round(cx + dx), Math.round(cy + dy), col);
  }
}

const originX = size * VOX;
const originY = 10;
// painter order: far to near
for (let s = 0; s < size * 2; s++) {
  for (let x = 0; x < size; x++) {
    const z = s - x;
    if (z < 0 || z >= size) continue;
    const { v, h } = source(x, z);
    if (v === AIR) continue;
    const base = COL[v];
    if (!base) continue;
    const cx = originX + (x - z) * VOX;
    const cy = originY + (x + z) * (VOX / 2) - h * VH;
    const top = base.map((c) => Math.min(255, Math.round(c * 1.0)));
    const sideA = base.map((c) => Math.round(c * 0.8));
    const sideB = base.map((c) => Math.round(c * 0.66));
    // side faces first, then the top
    for (let i = 0; i < VH; i++) {
      for (let dx = -VOX / 2; dx <= 0; dx++) put(Math.round(cx + dx - VOX / 2), Math.round(cy + i + VOX / 2 + dx), sideA);
      for (let dx = 0; dx <= VOX / 2; dx++) put(Math.round(cx + dx + VOX / 2), Math.round(cy + i + VOX / 2 - dx), sideB);
    }
    diamond(cx, cy, top);
  }
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  img.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);
const out = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "dist", "floor-iso.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${W}x${H}, mode=${arg})`);
