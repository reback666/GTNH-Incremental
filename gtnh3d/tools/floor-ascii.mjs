// Dump the decoded bp-13476 layers as ASCII, one character per block, so the
// structure can be eyeballed against the site's own preview image.
//
// Usage: node tools/floor-ascii.mjs [outDir]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = readFileSync(join(ROOT, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const paletteLen = bin.readUInt32LE(4);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);
const palette = bin.subarray(12 + size * size * layers).toString("utf8").split("|");

const AIR = 3;
const CHARS = "0123456789ABCDEFG";
const outDir = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "dist", "floor-ascii");
mkdirSync(outDir, { recursive: true });

console.log(`palette (${paletteLen}):`);
palette.forEach((p, i) => console.log(`  ${CHARS[i]}  ${i}  ${p}${i === AIR ? "   <- AIR" : ""}`));

// Per layer: ASCII
for (let y = 0; y < layers; y++) {
  const lines = [];
  for (let z = 0; z < size; z++) {
    let s = "";
    for (let x = 0; x < size; x++) s += CHARS[cells[x + z * size + y * size * size]];
    lines.push(s);
  }
  const f = join(outDir, `layer${y}.txt`);
  writeFileSync(f, lines.join("\n") + "\n");
  console.log(`wrote ${f}`);
}

// Flattened top surface (what the demo actually lays)
const topLines = [];
for (let z = 0; z < size; z++) {
  let s = "";
  for (let x = 0; x < size; x++) {
    let v = AIR;
    for (let y = layers - 1; y >= 0; y--) {
      const c = cells[x + z * size + y * size * size];
      if (c !== AIR) { v = c; break; }
    }
    s += CHARS[v];
  }
  topLines.push(s);
}
writeFileSync(join(outDir, "top.txt"), topLines.join("\n") + "\n");
console.log(`wrote ${join(outDir, "top.txt")}`);

// Coarse 1-char-per-4-blocks overview of the flattened surface, majority wins,
// so the overall composition is visible in a terminal.
const block = 4;
console.log(`\nflattened surface, 1 char per ${block}x${block} blocks (majority):`);
for (let bz = 0; bz < size / block; bz++) {
  let s = "";
  for (let bx = 0; bx < size / block; bx++) {
    const tally = new Map();
    let air = 0;
    for (let dz = 0; dz < block; dz++) {
      for (let dx = 0; dx < block; dx++) {
        const v = CHARS[topLines[bz * block + dz].charCodeAt(bx * block + dx) === 32 ? AIR : parseInt(topLines[bz * block + dz][bx * block + dx], 36)];
        tally.set(v, (tally.get(v) || 0) + 1);
      }
    }
    let best = "?", bestN = -1;
    for (const [k, n] of tally) if (n > bestN) { bestN = n; best = k; }
    void air;
    s += best;
  }
  console.log(s);
}
