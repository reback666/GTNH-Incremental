// Measure the site preview's grid pitch: walk a horizontal scanline through the
// plaza, find the dark (black concrete) grid lines, and convert their spacing to
// blocks using the plaza's known 160x160 extent. Confirms whether the courtyard
// grid really is 16 blocks per tile.
//
// Usage: node tools/preview-pitch.mjs <.tmp-blueprint/bp-preview.png>
import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error("unsupported bit depth");
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
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
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

const img = decodePng(readFileSync(resolve(process.argv[2] || ".tmp-blueprint/bp-preview.png")));
const { w, h, bpp, data } = img;
const lum = (x, y) => {
  const d = (y * w + x) * bpp;
  return 0.299 * data[d] + 0.587 * data[d + 1] + 0.114 * data[d + 2];
};

// bounding box of the model vs the flat background
const bg = lum(4, 4);
let minX = w, maxX = -1, minY = h, maxY = -1;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (Math.abs(lum(x, y) - bg) > 6) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
console.log(`model bbox x ${minX}..${maxX} (${maxX - minX + 1})  y ${minY}..${maxY} (${maxY - minY + 1})`);
// iso projection: the diamond's horizontal extent spans 160+160 blocks
const pxPerBlock = (maxX - minX + 1) / 320;
console.log(`px per block (horizontal) = ${pxPerBlock.toFixed(3)}`);

// scan several horizontal lines through the plaza's middle band
for (const frac of [0.45, 0.5, 0.55, 0.6]) {
  const y = Math.round(minY + (maxY - minY) * frac);
  const dark = [];
  let prevDark = false;
  for (let x = minX; x <= maxX; x++) {
    const isDark = lum(x, y) < 60;
    if (isDark && !prevDark) dark.push(x);
    prevDark = isDark;
  }
  const gaps = [];
  for (let i = 1; i < dark.length; i++) gaps.push(dark[i] - dark[i - 1]);
  const med = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;
  console.log(`y=${y} (frac ${frac}): ${dark.length} dark runs, median gap ${med}px`
    + ` = ${(med / pxPerBlock).toFixed(1)} blocks`
    + `   first ${dark.slice(0, 8).join(",")}`);
}
