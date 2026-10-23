// Re-verify the raw bp-13476 NBT-style payload without trusting assets/floor.bin
// or the earlier decode: parse the downloaded blueprint file directly, report the
// declared dimension strings, the state list length, and how many cells the two
// candidate index orders actually visit, plus a per-layer occupancy table.
//
// Usage: node tools/floor-verify-raw.mjs <blueprint file>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.argv[2] || ".tmp-blueprint/bp13476.bin");
const text = readFileSync(file, "utf8");

// top-level JSON
let top;
try {
  top = JSON.parse(text);
} catch {
  top = null;
}
console.log("top-level parse:", top ? "ok" : "FAILED (not plain JSON)");
if (top) console.log("top-level keys:", Object.keys(top).join(", "));

const payload = top && typeof top.statePosArrayList === "string" ? top.statePosArrayList : text;

// statelist
const m = /statelist:\[I;([^\]]*)\]/.exec(payload);
if (!m) throw new Error("no statelist found");
const vals = m[1].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
console.log("statelist length:", vals.length);

// declared pos / startpos
const pos = /pos:\{([^}]*)\}/.exec(payload);
const start = /startpos:\{([^}]*)\}/.exec(payload);
console.log("pos:", pos ? pos[1] : "?");
console.log("startpos:", start ? start[1] : "?");
const endpos = /endpos:\{([^}]*)\}/.exec(payload);
if (endpos) console.log("endpos:", endpos[1]);

function num(s, k) {
  const r = new RegExp(`${k}:(-?\\d+)`).exec(s || "");
  return r ? Number(r[1]) : null;
}
const px = num(pos && pos[1], "X");
const py = num(pos && pos[1], "Y");
const pz = num(pos && pos[1], "Z");
const sx = num(start && start[1], "X");
const sy = num(start && start[1], "Y");
const sz = num(start && start[1], "Z");
console.log(`declared  x:[${sx}..${px}]  y:[${sy}..${py}]  z:[${sz}..${pz}]`);

const candidates = [
  { name: "x fastest (x + z*nx + y*nx*nz)", nx: px - sx + 1, ny: py - sy + 1, nz: pz - sz + 1, map: (x, y, z, d) => x + z * d.nx + y * d.nx * d.nz },
  { name: "z fastest (z + x*nx + y*nx*nz)", nx: px - sx + 1, ny: py - sy + 1, nz: pz - sz + 1, map: (x, y, z, d) => z + x * d.nx + y * d.nx * d.nz },
];

// distinct values and their meaning
const uniq = [...new Set(vals)].sort((a, b) => a - b);
console.log("distinct state ids:", uniq.length, uniq.slice(0, 24).join(","));

for (const c of candidates) {
  const need = c.nx * c.ny * c.nz;
  console.log(`\n--- ${c.name}`);
  console.log(`    nx=${c.nx} ny=${c.ny} nz=${c.nz}  -> cells=${need}  (statelist ${vals.length})  match=${need === vals.length}`);
  if (need !== vals.length) continue;
  // occupancy per y
  for (let y = 0; y < c.ny; y++) {
    const tally = new Map();
    for (let z = 0; z < c.nz; z++) {
      for (let x = 0; x < c.nx; x++) {
        const v = vals[c.map(x, y, z, c)];
        tally.set(v, (tally.get(v) || 0) + 1);
      }
    }
    const air = tally.get(3) || 0;
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, n]) => `${k}:${n}`).join(" ");
    console.log(`    y=${y}  air=${air}  top: ${top}`);
  }
}
