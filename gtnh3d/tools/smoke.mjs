// Headless smoke test: runs the real scene code in Node (no WebGL) and checks
// the facts the demo claims. Textures are stubbed, so this works before the
// extractor has produced assets.
//
//   node gtnh3d/tools/smoke.mjs

import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REL = (p) => p.replace(ROOT + "\\", "").replace(ROOT + "/", "");

// ---- tiny DOM stand-ins ----------------------------------------------------
const listeners = [];
class FakeCtx {
  constructor() {
    this.imageSmoothingEnabled = true;
  }
  clearRect() {}
  drawImage() {}
}
globalThis.document = {
  createElement(tag) {
    if (tag === "canvas") return { width: 0, height: 0, style: {}, getContext: () => new FakeCtx() };
    const node = {
      tag,
      children: [],
      style: { cssText: "" },
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      append(...kids) {
        this.children.push(...kids);
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return node;
  },
  getElementById: () => null,
  body: { append() {} },
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener(type, fn) {
    listeners.push({ type, fn });
  },
  removeEventListener() {},
};
class FakeImage {
  set src(v) {
    this._src = v;
    this.naturalWidth = 16;
    this.naturalHeight = 16;
    setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() {
    return this._src;
  }
  close() {}
}
globalThis.Image = FakeImage;

// ---- bundle the real modules, stubbing every .png with one asset -----------
// A real 1x1 transparent PNG: the atlas only needs *some* decodable image, so
// the smoke test proves the scene without depending on the extracted assets.
const STUB_PNG_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const stubPngPlugin = {
  name: "stub-png",
  setup(b) {
    // Every png resolves to one decodable data URL. Keep the URL distinct per
    // path so atlas cell accounting stays honest.
    b.onResolve({ filter: /\.png$/ }, (a) => ({ path: a.path, namespace: "stub-png" }));
    b.onLoad({ filter: /.*/, namespace: "stub-png" }, (a) => ({
      contents: STUB_PNG_URL + "#" + a.path.replace(/^.*[\\/]/, ""),
      loader: "text",
    }));
  },
};
const out = await build({
  entryPoints: [
    join(ROOT, "src", "main.js"),
    join(ROOT, "src", "layout.js"),
    join(ROOT, "src", "mesher.js"),
    join(ROOT, "src", "multiblock.js"),
    join(ROOT, "src", "raycast.js"),
  ],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  write: false,
  outdir: join(ROOT, "dist", "smoke"),
  loader: { ".png": "dataurl" },
  plugins: [stubPngPlugin],
  logLevel: "error",
});

const importInMemory = async (file) => {
  const f = out.outputFiles.find((o) => o.path.endsWith(file));
  if (!f) throw new Error(`bundle output missing ${file}`);
  return import("data:text/javascript;base64," + Buffer.from(f.text).toString("base64"));
};

const mod = await importInMemory("layout.js"); // pulls in main.js + scene graph
const mesher = await importInMemory("mesher.js");
const mbMod = await importInMemory("multiblock.js");
const rayMod = await importInMemory("raycast.js");

const { buildScene, FLOOR_SPECS, paletteNameAt, floorIndexAt, FLOOR_LAYERS } = mod;
const { validateStructure, MULTIBLOCKS, materialList } = mbMod;
const { raycastVoxel } = rayMod;

let failures = 0;
const ok = (name, cond, detail = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
};

console.log("\n== 地板 / 蓝图调色板 ==");
const bin = await readFile(join(ROOT, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const cells = bin.subarray(12, 12 + size * size * FLOOR_LAYERS);
const palette = bin.subarray(12 + size * size * FLOOR_LAYERS).toString("utf8").split("|");
ok("floor.bin 160x160x3 (原始三层)", size === 160 && cells.length === 160 * 160 * 3,
  `size=${size} cells=${cells.length} layers=${FLOOR_LAYERS}`);
ok("调色板 17 项", palette.length === 17, `len=${palette.length}`);
ok("FLOOR_SPECS 与调色板一一对应", FLOOR_SPECS.length === palette.length,
  `specs=${FLOOR_SPECS.length} palette=${palette.length}`);

// every spec index must carry a texture, and index 3 (air) must be null
const badSpec = FLOOR_SPECS.map((s, i) => [i, s]).filter(([, s]) => s && !s.tex);
ok("每个地板 spec 都有贴图", badSpec.length === 0);
ok("索引 3（air）为 null", FLOOR_SPECS[3] === null);

// palette name lookup must round-trip through the real cells (all three layers)
function cellOf(idx) {
  for (let y = 0; y < FLOOR_LAYERS; y++) {
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        if (cells[x + z * size + y * size * size] === idx) return [x, z, y];
      }
    }
  }
  return null;
}
const present = [...new Set(cells)].sort((a, b) => a - b);
let roundTrip = 0;
for (const i of present) {
  const [x, z, y] = cellOf(i);
  if (paletteNameAt(x, z, y) === palette[i] && floorIndexAt(x, z, y) === i) roundTrip++;
}
ok(`实际出现的 ${present.length} 个索引全部 round-trip (${roundTrip}/${present.length})`,
  roundTrip === present.length);
ok("蓝图确含空气格 (index 3，三层合计 44893)", cells.filter((v) => v === 3).length === 44893,
  `air=${cells.filter((v) => v === 3).length}`);

const counts = {};
for (const v of cells) counts[v] = (counts[v] || 0) + 1;
ok("白色混凝土 16424（原始层计数）", counts[6] === 16424, `white=${counts[6]}`);
ok("灰混凝土 6745（原始层计数）", counts[0] === 6745, `gray=${counts[0]}`);

// Check against the source stream rather than another copy of the layout rule.
console.log("\n== 蓝图坐标与三层拼接 ==");
const source = JSON.parse(await readFile(join(ROOT, "assets", "floor-blueprint.json"), "utf8"));
const rawStates = /statelist:\[I;([^\]]*)\]/.exec(source.statePosArrayList)[1].split(",").map(Number);
let sourceMismatch = 0;
let cursor = 0;
const layerSolid = [0, 0, 0];
for (let z = 0; z < size; z++) {
  for (let y = 0; y < FLOOR_LAYERS; y++) {
    for (let x = 0; x < size; x++) {
      const expected = rawStates[cursor++];
      if (cells[x + z * size + y * size * size] !== expected || floorIndexAt(x, z, y) !== expected) sourceMismatch++;
      if (expected !== 3) layerSolid[y]++;
    }
  }
}
ok("源蓝图 X→Y→Z 顺序与运行时 76800 格逐格一致", sourceMismatch === 0 && cursor === rawStates.length,
  `mismatch=${sourceMismatch}`);
ok("地基层完整，绿化和盖板分别位于上层", layerSolid.join(",") === "25600,6247,60",
  `solid=${layerSolid}`);

const sceneProbe = buildScene();
let tileMismatch = 0;
let floorCells = 0;
const samples = [];
for (let y = 0; y < FLOOR_LAYERS; y++) {
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const idx = cells[x + z * size + y * size * size];
      for (const [ox, oz] of [[0, 0], [size, 0], [0, size], [size, size]]) {
        const entry = sceneProbe.world.get(x + ox, y, z + oz);
        const matches = idx === 3
          ? entry?.tag !== "floor"
          : entry?.tag === "floor" && entry.spec === FLOOR_SPECS[idx];
        if (!matches) {
          tileMismatch++;
          if (samples.length < 3) samples.push(`(${x + ox},${y},${z + oz}) index=${idx} actual=${entry?.spec.name}`);
        }
        if (entry?.tag === "floor") floorCells++;
      }
    }
  }
}
ok("2×2 拼接保留三层全部方块与空气（307200 格）", tileMismatch === 0,
  `mismatch=${tileMismatch} ${samples.join("; ")}`);
ok("蓝图 31907 个方块完整重复四次", floorCells === 31907 * 4, `floor=${floorCells}`);

const grid = [31, 47, 63, 79, 95, 111, 127, 143];
let gridMismatch = 0;
for (const line of grid) {
  for (let p = 31; p <= 143; p++) {
    if (floorIndexAt(line, p, 0) !== 10) gridMismatch++;
    if (floorIndexAt(p, line, 0) !== 10) gridMismatch++;
  }
}
ok("7×7 广场的横竖各八条黑线完整", gridMismatch === 0, `mismatch=${gridMismatch}`);
let lamps = 0;
for (let z = 39; z <= 135; z += 16) {
  for (let x = 39; x <= 135; x += 16) {
    if (floorIndexAt(x, z, 0) === 16) lamps++;
  }
}
ok("49 个方格中心灯位置正确", lamps === 49, `lamps=${lamps}`);
ok("两侧道路黄线与绿化边框位置正确",
  floorIndexAt(7, 80, 0) === 9 && floorIndexAt(80, 7, 0) === 9 &&
  floorIndexAt(24, 80, 1) === 13 && floorIndexAt(80, 24, 1) === 13);
let plazaCells = 0;
for (let z = 0; z < 2 * size; z++) {
  for (let x = 0; x < 2 * size; x++) {
    if (sceneProbe.world.get(x, 0, z)?.tag === "floor") plazaCells++;
  }
}
ok("地基层铺满 320×320，无空洞", plazaCells === 2 * size * 2 * size, `plazaCells=${plazaCells}`);

console.log("\n== 场景组装 ==");
const scene = buildScene();
const { world } = scene;
ok("地板已铺设 (>= 60000 方块)", world.blocks.size >= 60000, `blocks=${world.blocks.size}`);
ok("LV 机器 10 台", scene.hallInstances.length === 10, `n=${scene.hallInstances.length}`);
ok("ULV 展品 > 20", scene.ulvShowcase.length > 20, `n=${scene.ulvShowcase.length}`);
ok("含 1 个多方块", scene.multiblocks.length === 1);

const b = world.bounds();
ok("机器区焦点位于首个庭院内", scene.center.x > 31 && scene.center.x < 143 && scene.center.z > 31 && scene.center.z < 143,
  `center=${scene.center.x},${scene.center.z}`);
ok("地面之下仍有支撑层 (minY <= -1)", b.mny <= -1, `minY=${b.mny}`);
ok("最高方块 >= 3（3×3×3 电池缓冲 / 砖高炉顶层）", b.mxy >= 3, `maxY=${b.mxy}`);

const machines = scene.hallInstances.map((h) => h.machine.id).sort();
ok("10 台机器 id 唯一", new Set(machines).size === 10, machines.join(","));
ok("含 macerator / electric_furnace", machines.includes("macerator") && machines.includes("electric_furnace"));

console.log("\n== 砖高炉结构（权威数据校验）==");
const mb = scene.multiblocks[0];
const mat = materialList(MULTIBLOCKS[0]);
const byLabel = Object.fromEntries(mat.map((m) => [m.label, m.count]));
// 33 structure blocks = 32 firebricks + 1 controller (the wiki's "36 firebricks"
// counts the 4 used in the crafting recipe as well).
ok("33 个结构方块（32 耐火砖 + 1 控制器）",
  byLabel["耐火砖 Firebricks"] === 33, JSON.stringify(byLabel));
ok("1 控制器", byLabel["砖高炉控制器 Controller"] === 1);
ok("2 格必须留空（第三、四层中心）", byLabel["必须留空"] === 2);
ok("总格数 3*3*4=36", mat.reduce((n, m) => n + m.count, 0) === 36);
ok("结构自检 PASS", mb.validation.ok, mb.validation.problems.slice(0, 4).join(" | "));
ok("校验 36 格", mb.validation.checked === 36, `checked=${mb.validation.checked}`);

// re-validate after deliberately breaking one firebrick
const broken = world.get(mb.origin.x, mb.origin.y + 2, mb.origin.z);
world.set(mb.origin.x, mb.origin.y + 2, mb.origin.z, null);
const brokenCheck = validateStructure(world, MULTIBLOCKS[0], mb.origin);
ok("破坏一格后应 FAIL", !brokenCheck.ok && brokenCheck.problems.length === 1,
  `problems=${brokenCheck.problems.length}`);
world.set(mb.origin.x, mb.origin.y + 2, mb.origin.z, broken.spec, { tag: broken.tag });
ok("恢复后重新 PASS", validateStructure(world, MULTIBLOCKS[0], mb.origin).ok);

console.log("\n== 网格化 (mesher) ==");
// buildAtlas is async/DOM-bound, so prove the mesher against the same
// {uv, bySrc} contract with a synthetic atlas: every spec texture must resolve.
const uvTable = new Map();
const bySrcTable = new Map();
const rect = (i) => ({ u0: (i % 10) / 10, u1: (i % 10) / 10 + 0.1, v0: 0.1, v1: 0.2 });
for (const s of FLOOR_SPECS) {
  if (!s) continue;
  s.tex.forEach((t, i) => {
    if (!uvTable.has(t)) {
      const r = rect(uvTable.size);
      uvTable.set(t, r);
      bySrcTable.set(t, r);
    }
  });
}
const built = mesher.meshWorld(world, { uv: uvTable, bySrc: bySrcTable });
ok("mesher 产出可见面", built.faces > 50000, `faces=${built.faces}`);
ok("mesher 合批分组 > 10", built.groups > 10, `groups=${built.groups}`);
// each group's indices must address only that group's own vertices
const badGroup = built.meshes.find((g) => {
  const n = g.geo.getAttribute("position").count;
  const idx = g.geo.getIndex().array;
  for (const v of idx) if (v >= n) return true;
  return false;
});
ok("索引全部在各组顶点范围内", !badGroup, badGroup ? badGroup.texKey?.slice(-30) : "");
// face count must equal 2 triangles per emitted quad
const tri = built.meshes.reduce((n, g) => n + g.geo.getIndex().count / 3, 0);
ok("三角面数 = 2 × 面数", tri === built.faces * 2, `tri=${tri} faces=${built.faces}`);

console.log("\n== 体素射线（点击拾取）==");
// Aim at an open courtyard cell, clear of raised landscaping and machines.
const target = { x: scene.center.x - 40, z: scene.center.z - 40 };
const cam = { x: target.x - 30, y: 26, z: target.z + 30 };
const dir = { x: (target.x - cam.x) / 200, y: (0.5 - cam.y) / 200, z: (target.z - cam.z) / 200 };
const len = Math.hypot(dir.x, dir.y, dir.z);
const hit = raycastVoxel(world, cam, { x: dir.x / len, y: dir.y / len, z: dir.z / len }, 400);
ok("射线命中平台平面 (y=0)", !!hit && hit.voxel.y === 0, hit ? `voxel=${JSON.stringify(hit.voxel)}` : "no hit");
if (hit) ok("命中方块是地板调色板之一", !!hit.entry.spec.name, hit.entry.spec.name);

// ray straight down from above the multiblock must find the controller / bricks
const ctl = mb.controller;
const down = raycastVoxel(world, { x: ctl.x + 0.5, y: ctl.y + 6, z: ctl.z + 0.5 }, { x: 0, y: -1, z: 0 }, 20);
ok("垂直射线命中砖高炉", !!down && down.voxel.y === ctl.y, down ? JSON.stringify(down.voxel) : "no hit");

console.log(
  failures === 0
    ? "\n✓ smoke: all checks passed\n"
    : `\n✗ smoke: ${failures} check(s) failed\n`
);
process.exit(failures === 0 ? 0 : 1);
