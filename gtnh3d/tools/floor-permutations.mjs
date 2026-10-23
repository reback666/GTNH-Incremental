// All six axis-order interpretations of the bp-13476 state list, scored on how
// much they look like the site's own preview (a big flat plaza with a courtyard,
// a border ring and roads).
//
// The payload is 160 x 3 x 160 = 76800 cells. Which of x/y/z is the "3" axis and
// which order the three axes are laid out in are both unknown, so try all six.
//
// Usage: node tools/floor-permutations.mjs <.tmp-blueprint/bp13476.bin>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.argv[2] || ".tmp-blueprint/bp13476.bin");
const top = JSON.parse(readFileSync(file, "utf8"));
const payload = top.statePosArrayList;
const vals = /statelist:\[I;([^\]]*)\]/.exec(payload)[1].split(",").map(Number);

const N = { x: 160, y: 3, z: 160 };
const AIR = 3;
const NAMES = ["gray", "diorite", "stairs", "AIR", "granite", "bricks", "white",
  "andesite_slab", "quartz_slab", "yellow_terra", "black", "grass", "moss",
  "cyan_terra", "froglight", "trapdoor", "pearl_frog"];

// every permutation of the axes defines a different linear index
const perms = [
  ["x", "y", "z"], ["x", "z", "y"],
  ["y", "x", "z"], ["y", "z", "x"],
  ["z", "x", "y"], ["z", "y", "x"],
];

for (const p of perms) {
  const [a, b, c] = p; // a fastest, then b, then c
  const na = N[a], nb = N[b], nc = N[c];
  const idx = (i, j, k) => i + j * na + k * na * nb;

  // air per layer along the "stacking" axis, which is always the axis of size 3
  const stackAxis = p.find((ax) => N[ax] === 3);
  const stackLen = N[stackAxis];
  const perLayer = [];
  for (let layer = 0; layer < stackLen; layer++) {
    let air = 0;
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        // build coordinates: fastest = i, middle = j, slowest = layer
        const co = {};
        co[a] = i; co[b] = j; co[c] = layer;
        if (vals[idx(co[a], co[b], co[c])] === AIR) air++;
      }
    }
    perLayer.push(air);
  }

  // flattened surface using this interpretation: topmost non-air along stackAxis
  const surfN = p.filter((ax) => N[ax] !== 3);
  const [u, v] = surfN;
  const nu = N[u], nv = N[v];
  const surf = new Array(nu * nv);
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      let found = AIR;
      for (let layer = stackLen - 1; layer >= 0; layer--) {
        const co = {};
        co[u] = iu; co[v] = iv; co[stackAxis] = layer;
        const val = vals[idx(co[a], co[b], co[c])];
        if (val !== AIR) { found = val; break; }
      }
      surf[iu + iv * nu] = found;
    }
  }

  const airSurf = surf.filter((x) => x === AIR).length;
  const tally = new Map();
  for (const s of surf) tally.set(s, (tally.get(s) || 0) + 1);
  const shares = [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)
    .map(([k, n]) => `${NAMES[k]}:${(n / surf.length * 100).toFixed(1)}%`).join(" ");

  console.log(`\n=== order ${p.join(" -> ")} (fastest first)   stacking axis=${stackAxis} ===`);
  console.log(`  air per stack layer: ${perLayer.join(", ")}`);
  console.log(`  surface air ${(airSurf / surf.length * 100).toFixed(1)}%   top materials: ${shares}`);

  // coarse map so the composition is visible
  const block = Math.max(1, Math.floor(nu / 40));
  const lines = [];
  for (let bv = 0; bv < Math.floor(nv / block); bv++) {
    let s = "";
    for (let bu = 0; bu < Math.floor(nu / block); bu++) {
      const t = new Map();
      for (let dv = 0; dv < block; dv++) {
        for (let du = 0; du < block; du++) {
          const val = surf[(bu * block + du) + (bv * block + dv) * nu];
          t.set(val, (t.get(val) || 0) + 1);
        }
      }
      let best = AIR, bestN = t.get(AIR) || 0;
      for (const [k, n] of t) if (k !== AIR && n > bestN) { bestN = n; best = k; }
      s += "0123456789ABCDEFG"[best];
    }
    lines.push(s);
  }
  console.log(lines.slice(0, 40).join("\n"));
}
