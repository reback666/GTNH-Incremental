// Multiblock machines.
//
// The structure of every machine here is DATA, not invention: each entry keeps
// the source it was transcribed from so it can be audited. `validateStructure`
// re-derives PASS/FAIL from the voxel world, so the HUD claim "structure OK"
// is computed rather than asserted.
//
// Bricked Blast Furnace — GTNH 中文维基《砖高炉》(https://gtnh.huijiwiki.com/p/267):
//   「砖高炉是一个 3×4×3 的结构，第一层是 3×3 的耐火砖，第二层是 3×3 中空的
//     耐火砖，其中位于边上的一格替换为砖高炉主体方块，第三、四层都是 3×3 中空
//     的耐火砖，算上合成砖高炉使用的 4 个耐火砖共计需要使用 36 个耐火砖」
//   → 32 耐火砖（本体）+ 1 控制器，内部中空、顶层中心留空。

import { PASS, block } from "./blocks.js";
import * as T from "./textures.js";

const TAG = { S: "bbf-firebrick", C: "bbf-controller" };

// '.' = must be air, 'S' = firebrick, 'C' = controller
// layer[y][z][x]
const BBF_LAYERS = [
  ["SSS", "SSS", "SSS"], // y+0 实心耐火砖底
  ["SSS", "SCS", "SSS"], // y+1 中空，正面中央为控制器
  ["SSS", "S.S", "SSS"], // y+2 中空
  ["SSS", "S.S", "SSS"], // y+3 中空，顶层中心留空
];

export const MULTIBLOCKS = [
  {
    id: "bricked_blast_furnace",
    name: "砖高炉",
    nameEn: "Bricked Blast Furnace",
    size: { x: 3, y: 4, z: 3 },
    hollow: true,
    layers: BBF_LAYERS,
    legend: { S: "耐火砖 Firebricks", C: "砖高炉控制器 Controller", ".": "必须留空 Air" },
    facts: [
      "尺寸 3×4×3（中空）",
      "32 耐火砖 + 1 控制器；内部与顶层中心必须留空",
      "控制器：正面中央（第二层靠外一格）",
      "只能手工输入输出；每秒产生 200 点污染",
      "配方：铁锭 + 木炭/焦煤 → 钢锭（原始高炉配方）",
    ],
    source: "https://gtnh.huijiwiki.com/p/267 （GTNH 2.8.4，2025 修订）",
  },
];

function specFor(ch, m) {
  if (ch === "S") return m.firebrick;
  if (ch === "C") return m.controller;
  return null;
}

/**
 * Stamp a multiblock into the world.
 * @returns {{origin:{x,y,z}, pattern:Array, controller:{x,y,z}|null, layers:number}}
 */
export function placeStructure(world, mb, origin, { active = false } = {}) {
  const m = {
    firebrick: block({
      tex: T.brick,
      name: "耐火砖",
      nameEn: "Firebricks",
      meta: { id: "blockcasings4.15", role: "多方块结构方块", note: "原版砖块贴图（GT 耐火砖块）" },
    }),
    controller: block({
      tex: [
        T.brick, // east
        T.brick, // west
        T.brick, // up
        T.brick, // down
        active ? T.brickedFurnaceActive : T.brickedFurnaceCasing, // south = front
        T.brick, // north
      ],
      name: "砖高炉",
      nameEn: "Bricked Blast Furnace",
      emissive: active ? 0.2 : 0,
      meta: {
        id: "gt.blockmachines:140",
        type: "multiblock",
        structure: mb.id,
        state: active ? "running" : "idle",
      },
    }),
  };

  const placed = [];
  let controller = null;
  mb.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const spec = specFor(ch, m);
        const wx = origin.x + x;
        const wy = origin.y + y;
        const wz = origin.z + z;
        placed.push({ x: wx, y: wy, z: wz, ch });
        if (spec) {
          world.set(wx, wy, wz, spec, { tag: TAG[ch] });
        } else {
          world.set(wx, wy, wz, null);
        }
        if (ch === "C") controller = { x: wx, y: wy, z: wz };
      }
    });
  });
  return { origin, pattern: placed, controller, layers: mb.layers.length };
}

/**
 * Re-derive the structure from the world and compare it with the pattern.
 * Every cell must match: a block where a block is required, air where the
 * pattern requires air.
 */
export function validateStructure(world, mb, origin) {
  const problems = [];
  let checked = 0;
  mb.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const wx = origin.x + x;
        const wy = origin.y + y;
        const wz = origin.z + z;
        const entry = world.get(wx, wy, wz);
        const wantBlock = ch === "S" || ch === "C";
        checked++;
        if (wantBlock && !entry) {
          problems.push(`(${x},${y},${z}) 缺少 ${mb.legend[ch]}`);
        } else if (!wantBlock && entry && entry.spec.solid) {
          problems.push(`(${x},${y},${z}) 应为空气，实际是 ${entry.spec.nameEn || "block"}`);
        } else if (wantBlock && entry && entry.tag !== TAG[ch]) {
          problems.push(`(${x},${y},${z}) 方块类型不符：需要 ${mb.legend[ch]}`);
        }
      }
    });
  });
  return { ok: problems.length === 0, checked, problems };
}

/** Counts the blocks a machine needs, for the HUD material list. */
export function materialList(mb) {
  const counts = { S: 0, C: 0, ".": 0 };
  for (const layer of mb.layers) {
    for (const row of layer) {
      for (const ch of row) counts[ch]++;
    }
  }
  return [
    { label: mb.legend.S, count: counts.S },
    { label: mb.legend.C, count: counts.C },
    { label: "必须留空", count: counts["."] },
  ];
}
