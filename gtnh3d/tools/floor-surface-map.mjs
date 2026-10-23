// Draw our flattened surface as a flat colour map, one pixel per block, so it can
// be laid next to the warped site preview (tools/preview-warp.mjs) cell for cell.
//
// The preview's on-screen "right" may be the blueprint's z axis rather than its x
// axis, so the map can be drawn transposed (--swap) to test both orientations.
//
// Usage: node tools/floor-surface-map.mjs [out.png] [--rule=rank|top] [--swap]
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith("--")) || join(ROOT, "dist", "floor-surface-map.png"));
const rule = (args.find((a) => a.startsWith("--rule=")) || "--rule=rank").split("=")[1];
const swap = args.includes("--swap");

const bin = readFileSync(join(ROOT, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);
const AIR = 3;
const RANK = new Map([[13, 0], [11, 1], [12, 2], [9, 3], [10, 4], [6, 5], [2, 6], [1, 7],
  [4, 8], [7, 9], [8, 10], [5, 11], [15, 12], [14, 13], [16, 14], [0, 15]]);
// colours close to what the site preview shows for each block
const COL = {
  0: [124, 124, 128], 1: [206, 206, 206], 2: [196, 196, 196], 3: [51, 51, 77],
  4: [160, 130, 118], 5: [150, 88, 74], 6: [207, 213, 214], 7: [206, 206, 206],
  8: [235, 232, 226], 9: [242, 198, 38], 10: [23, 26, 30], 11: [96, 156, 66],
  12: [86, 126, 51], 13: [26, 92, 106], 14: [190, 235, 200], 15: [152, 152, 157],
  16: [250, 246, 245],
};

function surface(x, z) {
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

const S = 4;
const W = size * S;
const img = Buffer.alloc(W * W * 4);
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    const v = surface(x, z);
    const c = COL[v];
    // when --swap, draw the grid transposed so (x,z) -> (z,x) on screen
    const px = swap ? z : x;
    const py = swap ? x : z;
    for (let dy = 0; dy < S; dy++) {
      for (let dx = 0; dx < S; dx++) {
        const d = (((py * S + dy) * W) + (px * S + dx)) * 4;
        img[d] = c[0]; img[d + 1] = c[1]; img[d + 2] = c[2]; img[d + 3] = 255;
      }
    }
  }
}
function crc(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const o = Buffer.alloc(12 + data.length); o.writeUInt32BE(data.length, 0); o.write(type, 4, "ascii"); data.copy(o, 8); o.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length); return o; }
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let r = 0; r < W; r++) { raw[r * (W * 4 + 1)] = 0; img.copy(raw, r * (W * 4 + 1) + 1, r * W * 4, (r + 1) * W * 4); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
console.log(`wrote ${out} (${W}x${W}, rule=${rule}${swap ? ", transposed" : ""})`);
