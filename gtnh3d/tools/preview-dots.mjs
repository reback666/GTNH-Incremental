// Measure the site preview's courtyard pitch from the small bright dots the
// schematic puts at each tile centre (the froglights). Distance between adjacent
// dots, converted to blocks with the plaza's known 160x160 extent, tells us how
// many blocks one courtyard tile spans -- which is the one number the floor
// layout must match.
//
// Usage: node tools/preview-dots.mjs <.tmp-blueprint/bp-preview.png>
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
const rgb = (x, y) => {
  const d = (y * w + x) * bpp;
  return [data[d], data[d + 1], data[d + 2]];
};

// A dot is a small very bright spot surrounded by the courtyard's mid-light grey.
const dots = [];
for (let y = 2; y < h - 2; y++) {
  for (let x = 2; x < w - 2; x++) {
    const c = lum(x, y);
    if (c < 235) continue;
    // brightest pixel in its 3x3 neighbourhood?
    let isMax = true;
    for (let dy = -2; dy <= 2 && isMax; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (lum(x + dx, y + dy) > c) { isMax = false; break; }
      }
    }
    if (!isMax) continue;
    // surrounded by courtyard grey (100..215), not road/black
    const around = [lum(x - 4, y), lum(x + 4, y), lum(x, y - 3), lum(x, y + 3)];
    if (around.some((v) => v < 90 || v > 232)) continue;
    dots.push({ x, y, c, rgb: rgb(x, y) });
  }
}
console.log(`found ${dots.length} bright dots inside the courtyard`);
if (!dots.length) process.exit(0);

// bounding box of the whole model (for the px/block scale)
const bg = lum(4, 4);
let minX = w, maxX = -1, minY = h, maxY = -1;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) if (Math.abs(lum(x, y) - bg) > 6) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
const a = (maxX - minX + 1) / 318;          // horizontal px per block
const b = a / 2;                             // 2:1 isometric vertical step
console.log(`model bbox x ${minX}..${maxX}  px/block a=${a.toFixed(3)} b=${b.toFixed(3)}`);

// nearest-neighbour distance between dots, in pixels and in blocks
const dists = [];
for (let i = 0; i < dots.length; i++) {
  let best = Infinity;
  for (let j = 0; j < dots.length; j++) {
    if (i === j) continue;
    const d = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
    if (d < best) best = d;
  }
  if (best < Infinity) dists.push(best);
}
dists.sort((p, q) => p - q);
const med = dists[Math.floor(dists.length / 2)];
// for an isometric lattice with pitch p blocks, nearest dot distance = p * hypot(a, b)
const blocks = med / Math.hypot(a, b);
console.log(`median nearest-dot distance: ${med.toFixed(1)} px = ${blocks.toFixed(2)} blocks`);
console.log(`  -> tile pitch would be ${(160 / Math.round(blocks)).toFixed(1)} for ${Math.round(blocks)}-block tiles`);
console.log(`  sample dots (x,y): ${dots.slice(0, 12).map((d) => `${d.x},${d.y}`).join("  ")}`);
console.log(`  dot colours (rgb): ${[...new Set(dots.map((d) => d.rgb.join(",")))].slice(0, 6).join(" | ")}`);
