// Sample the site's preview image on a grid so its composition can be compared
// numerically with the decoded data. The preview is an isometric projection of a
// square plaza, so the plaza's four corners are found by scanning for non-
// background pixels, then a grid of samples is printed as characters.
//
// Usage: node tools/preview-sample.mjs <.tmp-blueprint/bp-preview.png> [out.txt]
import { inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(process.argv[2] || join(ROOT, "..", ".tmp-blueprint", "bp-preview.png"));

/** Minimal PNG decoder: 8-bit, colour types 2 (RGB) and 6 (RGBA). */
function decodePng(buf) {
  let p = 8;
  let w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported png bd=${bd} ct=${ct}`);
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
      if (f === 1) v += a;
      else if (f === 2) v += b;
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

const img = decodePng(readFileSync(file));
const { w, h, bpp, data } = img;
const px = (x, y) => {
  const d = (y * w + x) * bpp;
  return [data[d], data[d + 1], data[d + 2]];
};
// background is the dark blue-grey; anything far from it is the model
const bg = px(4, 4);
console.log(`image ${w}x${h}  bg=rgb(${bg.join(",")})`);

const near = (c, t, tol) => Math.abs(c[0] - t[0]) <= tol && Math.abs(c[1] - t[1]) <= tol && Math.abs(c[2] - t[2]) <= tol;
let minX = w, maxX = -1, minY = h, maxY = -1;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (!near(px(x, y), bg, 14)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
console.log(`model bounding box: x ${minX}..${maxX} (${maxX - minX + 1})  y ${minY}..${maxY} (${maxY - minY + 1})`);

// The ISO square: left/right extremes are the E/W corners, top/bottom the N/S corners.
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const hw = (maxX - minX) / 2;
const hh = (maxY - minY) / 2;

/** Inverse isometric sample: grid (u,v) in [0,1]^2 over the plaza. */
function sample(u, v) {
  // u: west->east along one axis, v: north->south along the other
  const a = (u - 0.5) * hw;
  const b = (v - 0.5) * hh;
  const x = Math.round(cx + a - 0); // iso: x shifts with u
  const y = Math.round(cy + b);
  if (x < 0 || y < 0 || x >= w || y >= h) return [0, 0, 0];
  return px(x, y);
}

const CLS = (c) => {
  const [r, g, b] = c;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 70) return "#";                        // black / very dark
  if (g > r + 18 && g > b + 18) return "G";       // green
  if (b > r + 18 && g > r + 10) return "C";       // cyan / teal
  if (r > 170 && g > 130 && b < 110) return "Y";  // yellow
  if (r > g + 25 && r > b + 25) return "R";       // red / brown
  if (mx - mn < 18 && mx > 200) return ".";       // white
  if (mx - mn < 30) return "-";                   // grey
  return "?";
};

console.log("\nplaza sampled on a 48x48 grid ('.'=white '-'=grey '#'=black G=green C=cyan Y=yellow R=red):");
const lines = [];
for (let iv = 0; iv < 48; iv++) {
  let s = "";
  for (let iu = 0; iu < 48; iu++) s += CLS(sample((iu + 0.5) / 48, (iv + 0.5) / 48));
  lines.push(s);
}
console.log(lines.join("\n"));

const outFile = process.argv[3] ? resolve(process.argv[3]) : join(ROOT, "dist", "preview-sample.txt");
writeFileSync(outFile, [`image ${w}x${h} bbox ${minX},${minY}..${maxX},${maxY}`, ...lines].join("\n") + "\n");
console.log(`\nwrote ${outFile}`);
