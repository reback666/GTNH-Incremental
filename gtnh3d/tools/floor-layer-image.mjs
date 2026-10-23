// Render one authored layer of the decoded bp-13476 as a flat colour image, so
// each of the three layers can be judged on its own.
//
// Usage: node tools/floor-layer-image.mjs <0|1|2> [out.png]
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
  0: [125, 125, 128], 1: [205, 205, 205], 2: [190, 190, 190], 3: [40, 40, 70],
  4: [150, 118, 108], 5: [150, 88, 74], 6: [236, 238, 241], 7: [205, 205, 205],
  8: [238, 235, 228], 9: [242, 198, 38], 10: [27, 27, 30], 11: [96, 156, 66],
  12: [86, 126, 51], 13: [26, 92, 106], 14: [190, 235, 200], 15: [152, 152, 157],
  16: [242, 228, 248],
};

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

const y = Number(process.argv[2] ?? 0);
if (!(y >= 0 && y < layers)) throw new Error(`layer must be 0..${layers - 1}`);
const S = 4;
const W = size * S;
const img = Buffer.alloc(W * W * 4);
let solid = 0;
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    const v = cells[x + z * size + y * size * size];
    if (v !== AIR) solid++;
    const c = COL[v];
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const d = (((z * S + py) * W) + (x * S + px)) * 4;
        img[d] = c[0]; img[d + 1] = c[1]; img[d + 2] = c[2]; img[d + 3] = 255;
      }
    }
  }
}
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let r = 0; r < W; r++) {
  raw[r * (W * 4 + 1)] = 0;
  img.copy(raw, r * (W * 4 + 1) + 1, r * W * 4, (r + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);
const out = process.argv[3] ? resolve(process.argv[3]) : join(ROOT, "dist", `floor-layer${y}.png`);
writeFileSync(out, png);
console.log(`wrote ${out} (layer ${y}, ${solid} solid / ${size * size} cells = ${(solid / (size * size) * 100).toFixed(1)}% filled)`);
