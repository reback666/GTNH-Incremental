// Score the floor layout against the site's own preview image.
//
// The preview is an isometric render of the same 160x160x3 grid, so every grid
// cell maps to one preview pixel. For each cell we take the preview's colour
// class and the material our layout puts there, then count how often they agree
// -- per layout rule (rank / top), so the two rules can be compared on evidence
// instead of by eye.
//
// Geometry: the preview diamond's four corners are (0,0) top, (159,0) right,
// (0,159) left, (159,159) bottom. Fitted from the model's bounding box.
//
// Usage:
//   node tools/preview-score.mjs [preview.png] [--rule=rank|top] [--dump=out.png]
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, bpp, data: out };
}

const args = process.argv.slice(2);
const previewPath = resolve(args.find((a) => !a.startsWith("--")) || join(ROOT, "..", ".tmp-blueprint", "bp-preview.png"));
const rule = (args.find((a) => a.startsWith("--rule=")) || "--rule=rank").split("=")[1];
const dump = (args.find((a) => a.startsWith("--dump=")) || "").split("=")[1];

const img = decodePng(readFileSync(previewPath));
const px = (x, y) => {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return [0, 0, 0];
  const d = (y * img.w + x) * img.bpp;
  return [img.data[d], img.data[d + 1], img.data[d + 2]];
};

// model bounding box in the preview
const bg = px(4, 4);
let minX = img.w, maxX = -1, minY = img.h, maxY = -1;
for (let y = 0; y < img.h; y++) {
  for (let x = 0; x < img.w; x++) {
    const [r, g, b] = px(x, y);
    if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 24) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
const CX = (minX + maxX) / 2;
const TOP = minY;
const A = (maxX - minX) / (2 * 159);          // px per block along x-z
const B = (maxY - minY) / (2 * 159);          // px per block along x+z
const proj = (x, z) => [CX + (x - z) * A, TOP + (x + z) * B];

// our grid
const bin = readFileSync(join(ROOT, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);
const AIR = 3;
const RANK = new Map([[13, 0], [11, 1], [12, 2], [9, 3], [10, 4], [6, 5], [2, 6], [1, 7],
  [4, 8], [7, 9], [8, 10], [5, 11], [15, 12], [14, 13], [16, 14], [0, 15]]);
const NAME = ["gray_concrete", "polished_diorite", "polished_diorite_stairs", "air",
  "polished_granite", "bricks", "white_concrete", "polished_andesite_slab",
  "smooth_quartz_slab", "yellow_terracotta", "black_concrete", "grass_block",
  "moss_block", "cyan_terracotta", "verdant_froglight", "iron_trapdoor", "pearlescent_froglight"];

// colour classes, in the order the preview renders them
function previewClass([r, g, b]) {
  if (Math.abs(r - 51) + Math.abs(g - 51) + Math.abs(b - 77) < 24) return "bg";
  if (r < 80 && g < 80 && b < 85) return "dark";
  if (g > r + 14 && g > b + 14 && g > 60) return "green";
  if (b > r + 25 && g > r + 12) return "cyan";
  if (r > 170 && g > 130 && b < 130) return "yellow";
  if (r > 120 && r > g + 25 && g > b) return "red";
  if (r > 225 && g > 225 && b > 225) return "white";
  if (r > 175) return "light";
  if (r > 95) return "mid";
  return "dark";
}
const materialClass = {
  gray_concrete: "mid", polished_diorite: "light", polished_diorite_stairs: "light",
  polished_granite: "light", bricks: "red", white_concrete: "light",
  polished_andesite_slab: "light", smooth_quartz_slab: "white", yellow_terracotta: "yellow",
  black_concrete: "dark", grass_block: "green", moss_block: "green",
  cyan_terracotta: "cyan", verdant_froglight: "green", iron_trapdoor: "mid",
  pearlescent_froglight: "white",
};

function surfaceIndex(x, z, useRank) {
  let bestIdx = AIR, bestRank = Infinity;
  let topIdx = AIR;
  for (let y = layers - 1; y >= 0; y--) {
    const v = cells[x + z * size + y * size * size];
    if (v === AIR) continue;
    if (topIdx === AIR) topIdx = v;
    const rk = RANK.has(v) ? RANK.get(v) : RANK.size;
    if (rk < bestRank) { bestRank = rk; bestIdx = v; }
  }
  return useRank ? bestIdx : topIdx;
}

const matrix = new Map();
let agree = 0, total = 0, bgHits = 0;
const dumpBuf = Buffer.alloc(size * size * 4);
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    const [sx, sy] = proj(x, z);
    const cls = previewClass(px(Math.round(sx), Math.round(sy)));
    const idx = surfaceIndex(x, z, rule === "rank");
    const mcls = idx === AIR ? "air" : materialClass[NAME[idx]];
    const key = `${mcls} -> ${cls}`;
    matrix.set(key, (matrix.get(key) || 0) + 1);
    total++;
    if (cls === "bg") bgHits++;
    else if (cls === mcls) agree++;
    const d = (z * size + x) * 4;
    dumpBuf[d] = cls === "bg" ? 255 : 0;
    dumpBuf[d + 1] = cls === mcls ? 200 : 0;
    dumpBuf[d + 2] = 0;
    dumpBuf[d + 3] = 255;
  }
}

console.log(`preview ${previewPath}  ${img.w}x${img.h}  bbox x ${minX}..${maxX} y ${minY}..${maxY}`);
console.log(`projection A=${A.toFixed(3)} B=${B.toFixed(3)} px/block, CX=${CX.toFixed(1)} TOP=${TOP}`);
console.log(`rule=${rule}: cells ${total}, preview-background ${bgHits}, agreeing ${agree} = ${((agree / (total - bgHits)) * 100).toFixed(1)}% of mapped cells`);
const rows = [...matrix.entries()].filter(([k]) => k.includes("->")).sort((a, b) => b[1] - a[1]);
console.log("confusion (our material class -> preview colour class), top 18:");
for (const [k, v] of rows.slice(0, 18)) console.log(`   ${k.padEnd(24)} ${String(v).padStart(6)}`);
const perMat = new Map();
for (const [k, v] of rows) {
  const m = k.split(" -> ")[0];
  perMat.set(m, (perMat.get(m) || 0) + v);
}
console.log("material distribution on the surface:");
for (const [m, v] of [...perMat.entries()].sort((a, b) => b[1] - a[1])) {
  const ok = rows.filter(([k]) => k.startsWith(`${m} -> ${m}`)).reduce((s, [, n]) => s + n, 0);
  console.log(`   ${m.padEnd(18)} ${String(v).padStart(6)}  matched ${((ok / v) * 100).toFixed(1)}%`);
}

if (dump) {
  function crc(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
  function chunk(type, data) { const o = Buffer.alloc(12 + data.length); o.writeUInt32BE(data.length, 0); o.write(type, 4, "ascii"); data.copy(o, 8); o.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length); return o; }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let r = 0; r < size; r++) { raw[r * (size * 4 + 1)] = 0; dumpBuf.copy(raw, r * (size * 4 + 1) + 1, r * size * 4, (r + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  writeFileSync(resolve(dump), png);
  console.log(`wrote ${resolve(dump)} (white = preview background, green = agree)`);
}
