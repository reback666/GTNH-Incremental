// Render the decoded bp-13476 surface as a colour-coded image at 1 px per block
// using each block's real average texture colour, so it can be compared directly
// with the site's own preview image.
//
// Usage: node tools/floor-bitmap.mjs [out.png]
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
// approximate colour of each palette entry, taken from the extracted textures
const COLORS = {
  0: [125, 125, 125], 1: [200, 200, 200], 2: [190, 190, 190], 3: [0, 0, 0],
  4: [160, 120, 110], 5: [150, 90, 75], 6: [235, 237, 240], 7: [200, 200, 200],
  8: [235, 232, 225], 9: [240, 200, 40], 10: [25, 25, 28], 11: [95, 155, 65],
  12: [85, 125, 50], 13: [25, 90, 105], 14: [190, 235, 200], 15: [150, 150, 155],
  16: [240, 225, 245],
};

function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
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

// Two display modes:
//   default  : topmost authored block per column (what the demo used to do)
//   --flat   : collapse the three authored levels onto one plane, keeping the
//              most "structural" block per column (see PRIORITY)
const FLAT = process.argv.includes("--flat");
const PRIORITY = [
  "cyan_terracotta", "grass_block", "moss_block", "yellow_terracotta",
  "black_concrete", "white_concrete",
  "polished_diorite_stairs", "polished_diorite", "polished_granite", "polished_andesite_slab",
  "smooth_quartz_slab", "bricks", "iron_trapdoor", "verdant_froglight", "pearlescent_froglight",
  "gray_concrete",
];
const pnames = bin.subarray(12 + size * size * layers).toString("utf8").split("|");
const rank = new Map(PRIORITY.map((n, i) => [pnames.indexOf(n), i]));

const surf = new Uint8Array(size * size);
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    let v = AIR;
    if (FLAT) {
      let bestRank = Infinity;
      for (let y = 0; y < layers; y++) {
        const c = cells[x + z * size + y * size * size];
        if (c === AIR) continue;
        const r = rank.has(c) ? rank.get(c) : PRIORITY.length;
        if (r < bestRank) { bestRank = r; v = c; }
      }
    } else {
      for (let y = layers - 1; y >= 0; y--) {
        const c = cells[x + z * size + y * size * size];
        if (c !== AIR) { v = c; break; }
      }
    }
    surf[x + z * size] = v;
  }
}

// Optional denoise: fill each air cell with the most common material among its
// neighbours (radius 3), which is what makes the plaza look continuous instead
// of speckled. Pass --fill to enable.
const FILL = process.argv.includes("--fill");
const out8 = new Uint8Array(surf);
if (FILL) {
  const R = 3;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (surf[x + z * size] !== AIR) continue;
      const t = new Map();
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const v = surf[nx + nz * size];
          if (v === AIR) continue;
          const w = 1 / (Math.abs(dx) + Math.abs(dz));
          t.set(v, (t.get(v) || 0) + w);
        }
      }
      let best = AIR, bestN = -1;
      for (const [k, n] of t) if (n > bestN) { bestN = n; best = k; }
      out8[x + z * size] = best;
    }
  }
  let filled = 0;
  for (let i = 0; i < surf.length; i++) if (surf[i] === AIR && out8[i] !== AIR) filled++;
  console.log(`denoise: filled ${filled} air cells`);
}

const SCALE = 4;
const W = size * SCALE;
const rgba = Buffer.alloc(W * W * 4);
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    const v = out8[x + z * size];
    const col = COLORS[v] || [255, 0, 255];
    for (let py = 0; py < SCALE; py++) {
      for (let px = 0; px < SCALE; px++) {
        const d = (((z * SCALE + py) * W) + (x * SCALE + px)) * 4;
        rgba[d] = col[0]; rgba[d + 1] = col[1]; rgba[d + 2] = col[2]; rgba[d + 3] = 255;
      }
    }
  }
}
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0;
  rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);
const out = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "dist", "floor-bitmap.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${W}x${W}, 1 px = ${SCALE}x${SCALE} blocks, top surface)`);
