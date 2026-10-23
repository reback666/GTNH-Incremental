// Locate the long straight runs of one material in the decoded bp-13476 grid, in
// both directions, at full resolution. This settles whether the source contains a
// real grid (lines on both axes) or only stripes.
//
// Usage: node tools/floor-runs.mjs
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = readFileSync(join(ROOT, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);
const AIR = 3;
const NAMES = ["gray", "diorite", "stairs", "AIR", "granite", "bricks", "white",
  "andesite_slab", "quartz_slab", "yellow", "black", "grass", "moss",
  "cyan", "froglight", "trapdoor", "pearl_frog"];
const CH = "0123456789ABCDEFG";

const surface = new Uint8Array(size * size);
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    let v = AIR;
    for (let y = layers - 1; y >= 0; y--) {
      const c = cells[x + z * size + y * size * size];
      if (c !== AIR) { v = c; break; }
    }
    surface[x + z * size] = v;
  }
}

/** longest run of identical values along a row (dz=0) or column (dx=0) */
function runs(dx, dz) {
  const best = new Map(); // material -> longest run length
  let total = 0;
  const n = size;
  for (let i = 0; i < n; i++) {
    let run = 1;
    let prev = surface[dx === 0 ? i : 0 + (dz === 0 ? i : 0) * 0]; // placeholder
    for (let j = 0; j < n; j++) {
      const x = dx === 0 ? i : j;
      const z = dz === 0 ? i : j;
      const v = surface[x + z * size];
      if (j === 0) { prev = v; run = 1; continue; }
      if (v === prev) run++;
      else {
        if (run >= 8) { best.set(prev, Math.max(best.get(prev) || 0, run)); total++; }
        prev = v; run = 1;
      }
    }
    if (run >= 8) { best.set(prev, Math.max(best.get(prev) || 0, run)); total++; }
  }
  return { best, total };
}

for (const [name, dx, dz] of [["along x (horizontal rows)", 1, 0], ["along z (vertical columns)", 0, 1]]) {
  const { best, total } = runs(dx, dz);
  console.log(`\n${name}: runs >= 8 blocks — ${total} occurrences`);
  for (const [v, len] of [...best.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${CH[v]} ${NAMES[v].padEnd(14)} longest run ${len}`);
  }
}

// Where are the long black lines? Report every row/column whose black count is high.
console.log("\nrows with many black_concrete (A) cells:");
for (let z = 0; z < size; z++) {
  let n = 0;
  for (let x = 0; x < size; x++) if (surface[x + z * size] === 10) n++;
  if (n > size * 0.5) console.log(`   z=${z}: ${n}`);
}
console.log("columns with many black_concrete (A) cells:");
for (let x = 0; x < size; x++) {
  let n = 0;
  for (let z = 0; z < size; z++) if (surface[x + z * size] === 10) n++;
  if (n > size * 0.5) console.log(`   x=${x}: ${n}`);
}

// Same, but per authored layer (not the flattened surface)
for (let y = 0; y < layers; y++) {
  let rowHits = 0, colHits = 0;
  const cols = [], rows = [];
  for (let z = 0; z < size; z++) {
    let n = 0;
    for (let x = 0; x < size; x++) if (cells[x + z * size + y * size * size] === 10) n++;
    if (n > size * 0.5) { rowHits++; rows.push(z); }
  }
  for (let x = 0; x < size; x++) {
    let n = 0;
    for (let z = 0; z < size; z++) if (cells[x + z * size + y * size * size] === 10) n++;
    if (n > size * 0.5) { colHits++; cols.push(x); }
  }
  console.log(`layer ${y}: full black rows ${rowHits} [${rows.slice(0, 20).join(",")}]  full black cols ${colHits} [${cols.slice(0, 20).join(",")}]`);
}
