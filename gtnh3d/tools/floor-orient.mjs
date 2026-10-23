// Compare the two possible axis assignments for the decoded bp-13476 grid and
// write both as coarse ASCII so the true orientation can be judged against the
// site's own preview image.
//
// A: index = x + z*size + y*size*size   (x fastest)
// B: index = z + x*size + y*size*size   (z fastest = X/Z transposed)
//
// Usage: node tools/floor-orient.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = readFileSync(join(ROOT, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);
const palette = bin.subarray(12 + size * size * layers).toString("utf8").split("|");

const AIR = 3;
const CHARS = "0123456789ABCDEFG";

/** sample(x, z, y) returns the palette index under one axis assignment. */
function recipe(axis) {
  return axis === "A"
    ? (x, z, y) => cells[x + z * size + y * size * size]
    : (x, z, y) => cells[z + x * size + y * size * size];
}

function surface(axis) {
  const get = recipe(axis);
  const grid = new Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      let v = AIR;
      for (let y = layers - 1; y >= 0; y--) {
        const c = get(x, z, y);
        if (c !== AIR) { v = c; break; }
      }
      grid[x + z * size] = v;
    }
  }
  return grid;
}

function coarse(grid, block) {
  const lines = [];
  for (let bz = 0; bz < size / block; bz++) {
    let s = "";
    for (let bx = 0; bx < size / block; bx++) {
      const tally = new Map();
      for (let dz = 0; dz < block; dz++) {
        for (let dx = 0; dx < block; dx++) {
          const v = grid[(bx * block + dx) + (bz * block + dz) * size];
          tally.set(v, (tally.get(v) || 0) + 1);
        }
      }
      // air wins ties so holes stay visible; otherwise most common material
      let best = AIR, bestN = tally.get(AIR) || 0;
      for (const [k, n] of tally) {
        if (k === AIR) continue;
        if (n > bestN) { bestN = n; best = k; }
      }
      s += CHARS[best];
    }
    lines.push(s);
  }
  return lines;
}

/** Count how "regular" a surface is: long straight same-colour seams. */
function regularity(grid) {
  const at = (x, z) => grid[x + z * size];
  let xSeam = 0, zSeam = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 1; x < size; x++) if (at(x, z) !== at(x - 1, z)) xSeam++;
  }
  for (let x = 0; x < size; x++) {
    for (let z = 1; z < size; z++) if (at(x, z) !== at(x, z - 1)) zSeam++;
  }
  return { xSeam, zSeam };
}

for (const axis of ["A", "B"]) {
  const grid = surface(axis);
  const counts = new Array(palette.length).fill(0);
  for (const v of grid) counts[v]++;
  const air = counts[AIR];
  const r = regularity(grid);
  console.log(`\n=== assignment ${axis} ===`);
  console.log(`  air on surface: ${air} / ${size * size} (${((air / (size * size)) * 100).toFixed(1)}%)`);
  console.log(`  vertical seams (colour changes along x): ${r.xSeam}`);
  console.log(`  horizontal seams (colour changes along z): ${r.zSeam}`);
  const lines = coarse(grid, 4);
  console.log(lines.join("\n"));
  writeFileSync(join(ROOT, "dist", `floor-shape-${axis}.txt`), lines.join("\n") + "\n");
}
