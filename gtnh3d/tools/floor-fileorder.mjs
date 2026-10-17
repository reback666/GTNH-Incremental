// Print the raw statelist in its *file* order as a picture, before imposing any
// axis interpretation. 76800 values = 480 rows x 160 columns. If the file order
// is (x outer, y middle, z inner) the picture will show a coherent 160x160 plan
// tiled in three 160-tall blocks.
//
// Usage: node tools/floor-fileorder.mjs <.tmp-blueprint/bp13476.bin>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.argv[2] || ".tmp-blueprint/bp13476.bin");
const top = JSON.parse(readFileSync(file, "utf8"));
const vals = /statelist:\[I;([^\]]*)\]/.exec(top.statePosArrayList)[1].split(",").map(Number);

const CH = "0123456789ABCDEFG";
const ROWS = 480;
const COLS = 160;
console.log(`values=${vals.length}  rows=${ROWS} cols=${COLS}`);
if (vals.length !== ROWS * COLS) console.log("!! shape does not match");

// coarse picture: 1 char per 4x4 of the raw array
const R = 4, C = 4;
const out = [];
for (let r = 0; r < ROWS / R; r++) {
  let s = "";
  for (let c = 0; c < COLS / C; c++) {
    const t = new Map();
    for (let dr = 0; dr < R; dr++) {
      for (let dc = 0; dc < C; dc++) {
        const v = vals[Math.min(vals.length - 1, (r * R + dr) * COLS + (c * C + dc))];
        t.set(v, (t.get(v) || 0) + 1);
      }
    }
    let best = 3, bestN = t.get(3) || 0;
    for (const [k, n] of t) if (k !== 3 && n > bestN) { bestN = n; best = k; }
    s += CH[best];
  }
  out.push(s);
}

// Per 160-row band (= per x if x is the outer axis): air share and top materials
for (let band = 0; band < 3; band++) {
  const seg = vals.slice(band * 160 * 160, (band + 1) * 160 * 160);
  const air = seg.filter((v) => v === 3).length;
  const t = new Map();
  for (const v of seg) t.set(v, (t.get(v) || 0) + 1);
  const top5 = [...t.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => `${CH[k]}:${n}`).join(" ");
  console.log(`band ${band} (rows ${band * 160}..${band * 160 + 159}): air=${air}  ${top5}`);
}

console.log("\nraw file order, 1 char per 4x4 (blank rows mean air):");
out.forEach((s, i) => console.log(String(i * R).padStart(3), s));
