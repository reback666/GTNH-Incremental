// Why does the blueprint look fragmented / striped?
//
// Reads assets/floor.bin (the decoded bp-13476 grid) and reports the shape of
// the authored data: how much of each layer is air, whether blocks come in
// runs or singles, and how the three layers overlap per column.
//
// Usage: node tools/floor-shape.mjs
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = readFileSync(join(ROOT, "assets", "floor.bin"));

const size = bin.readUInt32LE(0);
const paletteLen = bin.readUInt32LE(4);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);
const palette = bin
  .subarray(12 + size * size * layers)
  .toString("utf8")
  .split("|");

const AIR = 3;
const at = (x, z, y) => cells[x + z * size + y * size * size];

/** Longest run of non-air cells through a row/column, and how many runs of 1. */
function runStats(get) {
  const runs = [];
  let run = 0;
  for (let i = 0; i < size; i++) {
    if (get(i) !== AIR) run++;
    else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  const singles = runs.filter((r) => r === 1).length;
  return { runs: runs.length, singles, longest: runs.length ? Math.max(...runs) : 0 };
}

console.log(`bp-13476 decoded grid: ${size} x ${size} x ${layers} layers\n`);
console.log("== 每层有多少方块 ==");
for (let y = 0; y < layers; y++) {
  let solid = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) if (at(x, z, y) !== AIR) solid++;
  }
  const pct = ((solid / (size * size)) * 100).toFixed(1);
  console.log(`  layer ${y}: ${String(solid).padStart(6)} / ${size * size} 方块 = ${pct}% 实心, ${(100 - pct).toFixed(1)}% 空气`);
}

console.log("\n== 每层的横向 / 纵向连续段 ==");
console.log("  （若图案是“面”，每一行应该只有几段长条；若图案是“碎屑”，会有大量长度为 1 的单格段）");
for (let y = 0; y < layers; y++) {
  let rowRuns = 0, rowSingles = 0, colRuns = 0, colSingles = 0, rowLongest = 0, colLongest = 0;
  for (let z = 0; z < size; z++) {
    const r = runStats((x) => at(x, z, y));
    rowRuns += r.runs; rowSingles += r.singles; rowLongest = Math.max(rowLongest, r.longest);
  }
  for (let x = 0; x < size; x++) {
    const c = runStats((z) => at(x, z, y));
    colRuns += c.runs; colSingles += c.singles; colLongest = Math.max(colLongest, c.longest);
  }
  console.log(
    `  layer ${y}: 横向 ${rowRuns} 段（其中长度=1 的孤格 ${rowSingles}，最长 ${rowLongest}）` +
    ` | 纵向 ${colRuns} 段（孤格 ${colSingles}，最长 ${colLongest}）`
  );
}

console.log("\n== 三层的重叠：一列里到底有几层有方块 ==");
const hist = [0, 0, 0, 0];
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    let n = 0;
    for (let y = 0; y < layers; y++) if (at(x, z, y) !== AIR) n++;
    hist[n]++;
  }
}
for (let n = 0; n <= layers; n++) {
  console.log(`  ${n} 层有方块: ${String(hist[n]).padStart(6)} 列  (${((hist[n] / (size * size)) * 100).toFixed(1)}%)`);
}

console.log("\n== 方块构成（全三层）==");
const counts = new Array(paletteLen).fill(0);
for (const v of cells) counts[v]++;
[...counts.keys()]
  .filter((i) => i !== AIR && counts[i])
  .sort((a, b) => counts[b] - counts[a])
  .forEach((i) => {
    console.log(
      `  ${String(counts[i]).padStart(6)}  ${palette[i]}  (${((counts[i] / cells.length) * 100).toFixed(1)}% of all cells)`
    );
  });
