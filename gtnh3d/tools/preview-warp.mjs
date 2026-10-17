// Warp the site preview into blueprint grid space and diff it against our layout.
//
// The preview is drawn with perspective, so an affine (x-z) mapping drifts and
// mislabels cells. Instead we fit the homography that sends the blueprint's four
// grid corners onto the four extreme silhouette corners of the preview, warp the
// preview into a 160x160 grid image, and then compare cell by cell with what our
// layout puts on the surface.
//
// Usage:
//   node tools/preview-warp.mjs [--preview=path] [--rule=rank|top]
//     [--warp=out.png] [--diff=out.png]
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};

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

function encodePng(w, h, rgba) {
  function crc(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
  function chunk(type, data) { const o = Buffer.alloc(12 + data.length); o.writeUInt32BE(data.length, 0); o.write(type, 4, "ascii"); data.copy(o, 8); o.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length); return o; }
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let r = 0; r < h; r++) { raw[r * (w * 4 + 1)] = 0; rgba.copy(raw, r * (w * 4 + 1) + 1, r * w * 4, (r + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const img = decodePng(readFileSync(resolve(opt("preview", join(ROOT, "..", ".tmp-blueprint", "bp-preview.png")))));
const px = (x, y) => {
  x = Math.max(0, Math.min(img.w - 1, x | 0));
  y = Math.max(0, Math.min(img.h - 1, y | 0));
  const d = (y * img.w + x) * img.bpp;
  return [img.data[d], img.data[d + 1], img.data[d + 2]];
};

// silhouette extremes
const bg = px(4, 4);
const isModel = (x, y) => {
  const [r, g, b] = px(x, y);
  return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 24;
};
let P00 = null, P10 = null, P01 = null, P11 = null;
for (let y = 0; y < img.h; y++) {
  for (let x = 0; x < img.w; x++) {
    if (!isModel(x, y)) continue;
    if (!P00 || y < P00[1]) P00 = [x, y];
    if (!P11 || y > P11[1]) P11 = [x, y];
    if (!P01 || x < P01[0]) P01 = [x, y];
    if (!P10 || x > P10[0]) P10 = [x, y];
  }
}
// average duplicate rows at the extremes so a stray pixel cannot skew a corner
function refine(pick, better) {
  let best = pick();
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) if (isModel(x, y) && better([x, y], best)) best = [x, y];
  }
  return best;
}
P00 = refine(() => P00, (p, b) => p[1] < b[1]);
P11 = refine(() => P11, (p, b) => p[1] > b[1]);
P01 = refine(() => P01, (p, b) => p[0] < b[0]);
P10 = refine(() => P10, (p, b) => p[0] > b[0]);
console.log(`silhouette corners: (0,0)->${P00}  (159,0)->${P10}  (0,159)->${P01}  (159,159)->${P11}`);

// homography: unit square (u,v in 0..1) -> quad P00 (u=0,v=0), P10 (1,0), P01 (0,1), P11 (1,1)
function homography(q00, q10, q01, q11) {
  // solve for h with the standard 8x8 system via least squares (exact here)
  const A = [];
  const push = (u, v, X, Y) => {
    A.push([u, v, 1, 0, 0, 0, -u * X, -v * X, X]);
    A.push([0, 0, 0, u, v, 1, -u * Y, -v * Y, Y]);
  };
  push(0, 0, q00[0], q00[1]);
  push(1, 0, q10[0], q10[1]);
  push(0, 1, q01[0], q01[1]);
  push(1, 1, q11[0], q11[1]);
  // gaussian elimination on the 8x9 augmented matrix
  for (let i = 0; i < 8; i++) {
    let piv = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    const d = A[i][i];
    for (let c = i; c <= 8; c++) A[i][c] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === i) continue;
      const f = A[r][i];
      if (!f) continue;
      for (let c = i; c <= 8; c++) A[r][c] -= f * A[i][c];
    }
  }
  const h = A.map((row) => row[8]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
const H = homography(P00, P10, P01, P11);
const project = (u, v) => {
  const d = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / d, (H[3] * u + H[4] * v + H[5]) / d];
};

const size = 160, layers = 3;
const bin = readFileSync(join(ROOT, "assets", "floor.bin"));
const cells = bin.subarray(12, 12 + size * size * layers);
const AIR = 3;
const RANK = new Map([[13, 0], [11, 1], [12, 2], [9, 3], [10, 4], [6, 5], [2, 6], [1, 7],
  [4, 8], [7, 9], [8, 10], [5, 11], [15, 12], [14, 13], [16, 14], [0, 15]]);
const NAME = ["gray_concrete", "polished_diorite", "polished_diorite_stairs", "air",
  "polished_granite", "bricks", "white_concrete", "polished_andesite_slab",
  "smooth_quartz_slab", "yellow_terracotta", "black_concrete", "grass_block",
  "moss_block", "cyan_terracotta", "verdant_froglight", "iron_trapdoor", "pearlescent_froglight"];
const PREVIEW_MATCH = {
  gray_concrete: ["mid", "dark", "light"], white_concrete: ["light", "white"],
  polished_diorite: ["light"], polished_diorite_stairs: ["light"], polished_granite: ["light"],
  polished_andesite_slab: ["light"], smooth_quartz_slab: ["white", "light"],
  black_concrete: ["dark"], cyan_terracotta: ["cyan", "dark"],
  grass_block: ["green"], moss_block: ["green"], yellow_terracotta: ["yellow"],
  bricks: ["red"], iron_trapdoor: ["mid", "light"],
  verdant_froglight: ["green", "white", "light"], pearlescent_froglight: ["white", "light"],
};

function classify([r, g, b]) {
  if (Math.abs(r - 51) + Math.abs(g - 51) + Math.abs(b - 77) < 30) return "bg";
  if (g > r + 14 && g > b + 14) return "green";
  if (b > r + 30 && g > r + 15) return "cyan";
  if (r > 165 && g > 120 && b < 130) return "yellow";
  if (r > 120 && r > g + 30 && g > b) return "red";
  if (r > 230 && g > 230 && b > 228) return "white";
  if (r > 175) return "light";
  if (r > 90) return "mid";
  return "dark";
}

function surface(x, z, rule) {
  let top = AIR, best = AIR, br = Infinity;
  for (let y = layers - 1; y >= 0; y--) {
    const v = cells[x + z * size + y * size * size];
    if (v === AIR) continue;
    if (top === AIR) top = v;
    const rk = RANK.has(v) ? RANK.get(v) : 99;
    if (rk < br) { br = rk; best = v; }
  }
  return rule === "rank" ? best : top;
}

const rule = opt("rule", "rank");
const warp = Buffer.alloc(size * size * 4);
const diff = Buffer.alloc(size * size * 4);
const conf = new Map();
let agree = 0, mapped = 0;
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (z + 0.5) / size;
    const [sx, sy] = project(u, v);
    const c = px(Math.round(sx), Math.round(sy));
    const cls = classify(c);
    const idx = surface(x, z, rule);
    const mat = idx === AIR ? "air" : NAME[idx];
    const ok = cls !== "bg" && (PREVIEW_MATCH[mat] || []).includes(cls);
    const d = (z * size + x) * 4;
    warp[d] = c[0]; warp[d + 1] = c[1]; warp[d + 2] = c[2]; warp[d + 3] = 255;
    if (cls === "bg") { diff[d] = 255; diff[d + 1] = 255; diff[d + 2] = 0; }
    else if (ok) { diff[d] = 40; diff[d + 1] = 190; diff[d + 2] = 60; }
    else { diff[d] = 230; diff[d + 1] = 40; diff[d + 2] = 40; }
    diff[d + 3] = 255;
    const key = `${mat} -> ${cls}`;
    conf.set(key, (conf.get(key) || 0) + 1);
    if (cls !== "bg") { mapped++; if (ok) agree++; }
  }
}
console.log(`rule=${rule}: ${mapped} cells land on the model, ${agree} agree with the preview colour = ${((agree / mapped) * 100).toFixed(1)}%`);
console.log("worst disagreements:");
const bad = [...conf.entries()].filter(([k]) => {
  const [m, c] = k.split(" -> ");
  return c !== "bg" && !(PREVIEW_MATCH[m] || []).includes(c);
}).sort((a, b) => b[1] - a[1]).slice(0, 14);
for (const [k, v] of bad) console.log(`   ${k.padEnd(36)} ${String(v).padStart(5)}`);

for (const [name, path, buf] of [["warp", opt("warp"), warp], ["diff", opt("diff"), diff]]) {
  if (!path) continue;
  const out = resolve(path);
  writeFileSync(out, encodePng(size, size, buf));
  console.log(`wrote ${out}`);
}
