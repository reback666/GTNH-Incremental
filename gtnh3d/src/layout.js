// Scene layout: the plaza, the ULV (tier 00) infrastructure area, the LV
// single-block machine hall, and the multiblock machines.
//
// Coordinates: +X east, +Y up, +Z south. The plaza reproduces the bp-13476
// blueprint: its 160x160x3 module is repeated 2x2 into a 320x320 plaza,
// preserving the authored ground, landscaping and drain-cover heights.

import {
  FLOOR_LAYERS,
  FLOOR_SIZE,
  FLOOR_TILE,
  BlockWorld,
  block,
  floorIndexAt as blueprintIndexAt,
  floorPaletteNameAt,
} from "./blocks.js";
import * as T from "./textures.js";
import {
  FACE_INDEX,
  LV_MACHINES,
  buildMachine,
  energyHatch,
  heatproofCasing,
  tierCasing,
  ulvHull,
  ulvInfra,
  waterBlock,
} from "./machines.js";
import { MULTIBLOCKS, placeStructure, validateStructure } from "./multiblock.js";

const UP = FACE_INDEX.UP;

/** Blueprint grid index that means "no block". */
const FLOOR_AIR = 3;

export { FLOOR_LAYERS, FLOOR_TILING, PLAZA_SIZE, GROUND_SIZE, FLOOR_APRON };

/** How many times the 160x160 blueprint module is repeated along each axis. */
const FLOOR_TILING = 2;
/** Decorated plaza size: the module tiled FLOOR_TILING x FLOOR_TILING. */
const PLAZA_SIZE = FLOOR_SIZE * FLOOR_TILING;
/** Narrow ring of plain concrete around the plaza so the edge is not cut off. */
const FLOOR_APRON = 24;
/** Total ground footprint (plaza + apron). */
const GROUND_SIZE = PLAZA_SIZE + FLOOR_APRON * 2;

/**
 * Spec table indexed exactly like the decoded blueprint palette. The order MUST
 * stay in sync with assets/floor.bin (and with tools/gen-floor-data.mjs):
 *   0 gray_concrete | 1 polished_diorite | 2 polished_diorite_stairs | 3 air
 *   4 polished_granite | 5 bricks | 6 white_concrete | 7 polished_andesite_slab
 *   8 smooth_quartz_slab | 9 yellow_terracotta | 10 black_concrete | 11 grass_block
 *   12 moss_block | 13 cyan_terracotta | 14 verdant_froglight | 15 iron_trapdoor
 *   16 pearlescent_froglight
 */
export const FLOOR_SPECS = [
  block({ tex: T.floorGrayConcrete, name: "灰色混凝土", nameEn: "Gray Concrete" }),
  block({ tex: T.floorPolishedDiorite, name: "磨制闪长岩", nameEn: "Polished Diorite" }),
  block({ tex: T.floorDioriteStairs, name: "磨制闪长岩台阶", nameEn: "Polished Diorite Stairs" }),
  null, // 3 = air: empty cells above the continuous ground layer
  block({ tex: T.floorPolishedGranite, name: "磨制花岗岩", nameEn: "Polished Granite" }),
  block({ tex: T.floorBricks, name: "砖块", nameEn: "Bricks" }),
  block({ tex: T.floorWhiteConcrete, name: "白色混凝土", nameEn: "White Concrete" }),
  block({ tex: T.floorAndesiteSlab, name: "磨制安山岩台阶", nameEn: "Polished Andesite Slab" }),
  block({ tex: T.floorQuartzSlab, name: "平滑石英台阶", nameEn: "Smooth Quartz Slab" }),
  block({ tex: T.floorYellowTerracotta, name: "黄色陶瓦", nameEn: "Yellow Terracotta" }),
  block({ tex: T.floorBlackConcrete, name: "黑色混凝土", nameEn: "Black Concrete" }),
  block({ tex: T.floorGrass, name: "草方块", nameEn: "Grass Block" }),
  block({ tex: T.floorMoss, name: "苔藓块", nameEn: "Moss Block" }),
  block({ tex: T.floorCyanTerracotta, name: "青色陶瓦", nameEn: "Cyan Terracotta" }),
  block({ tex: T.floorFroglight, emissive: 0.22, name: "翠绿蛙明灯", nameEn: "Verdant Froglight" }),
  block({ tex: T.floorIronTrapdoor, name: "铁活板门", nameEn: "Iron Trapdoor" }),
  block({ tex: T.floorFroglightWarm, emissive: 0.22, name: "珠光蛙明灯", nameEn: "Pearlescent Froglight" }),
];

/** Human-readable palette name for world column (x, z) on blueprint layer y. */
export function paletteNameAt(x, z, y = FLOOR_LAYERS - 1) {
  return floorPaletteNameAt(x, z, y);
}

/** Blueprint palette index at world column (x, z) on layer y (outside -> gray). */
export function floorIndexAt(x, z, y = FLOOR_LAYERS - 1) {
  return blueprintIndexAt(x, z, y);
}

export function placeFloor(world) {
  const baseY = -1;
  const fill = FLOOR_SPECS[0];

  // base: plain concrete across the whole footprint (plaza + apron)
  for (let z = -FLOOR_APRON; z < PLAZA_SIZE + FLOOR_APRON; z++) {
    for (let x = -FLOOR_APRON; x < PLAZA_SIZE + FLOOR_APRON; x++) {
      world.set(x, baseY, z, fill, { tag: "floor" });
    }
  }

  for (let y = 0; y < FLOOR_LAYERS; y++) {
    for (let z = 0; z < PLAZA_SIZE; z++) {
      for (let x = 0; x < PLAZA_SIZE; x++) {
        const idx = blueprintIndexAt(x % FLOOR_SIZE, z % FLOOR_SIZE, y);
        if (idx === FLOOR_AIR) continue;
        world.set(x, baseY + 1 + y, z, FLOOR_SPECS[idx], { tag: "floor" });
      }
    }
  }
  return baseY;
}

const FACTS = {
  ulv: {
    title: "ULV · tier 00",
    voltage: "8 EU/t",
    lines: [
      "GT5U 里 tier 00（ULV）没有基础加工机器：basicmachine.<name>.tier.NN 从 tier.01（LV）开始。",
      "ULV 只有基础设施：机器外壳、电池缓冲、充电机、变压器、能源仓/动力仓、输入输出总线与仓。",
      "所以这个区域展示的是 ULV 基础设施；加工机器从 LV(tier 01) 起。",
    ],
  },
};

export function buildScene() {
  const world = new BlockWorld();
  // Keep the machine pads inside a courtyard, clear of the raised border.
  const center = { x: Math.floor(FLOOR_SIZE / 2), z: Math.floor(FLOOR_SIZE / 2) };

  // ---- 1. plaza -----------------------------------------------------------
  // Blueprint layer 0 is the continuous ground; upper layers are landscaping.
  const baseY = placeFloor(world);
  // Machines stand on the courtyard ground, one block above layer 0.
  const groundY = baseY + 2;

  // ---- 2. ULV infrastructure yard ----------------------------------------
  // A casing pad with a two-row rack of tier-00 blocks.
  const yard = { x: center.x - 20, z: center.z - 10 };
  for (let x = -1; x <= 20; x++) {
    for (let z = -1; z <= 9; z++) {
      world.set(yard.x + x, groundY, yard.z + z, tierCasing("ulv", "ULV 机房地板", "ULV Machine Pad", { role: "机房地坪" }));
    }
  }

  const ulvShowcase = [];
  const addUlv = (dx, dz, spec) => {
    world.set(yard.x + dx, groundY + 1, yard.z + dz, spec);
    ulvShowcase.push({ x: yard.x + dx, y: groundY + 1, z: yard.z + dz, spec });
  };

  // row 1: hulls + energy hatches along the west edge
  for (let i = 0; i < 6; i++) addUlv(i * 3, 0, ulvHull());
  addUlv(0, 3, energyHatch("in"));
  addUlv(3, 3, energyHatch("out"));
  addUlv(6, 3, ulvInfra("transformer", "变压器 (LV→ULV)", "Transformer (LV→ULV)", { id: "transformer.lv_ulv" }));
  addUlv(9, 3, ulvInfra("buffer", "电池缓冲 (ULV)", "Battery Buffer (ULV)", { id: "batterybuffer.1by1.ulv" }));
  addUlv(12, 3, ulvInfra("charger", "电池充电机 (ULV)", "Battery Charger (ULV)", { id: "batterycharger.4by4.ulv" }));
  addUlv(15, 3, ulvInfra("locker", "储物柜 (ULV)", "Locker (ULV)", { id: "locker.ulv" }));

  // 3x3x3 battery buffer as a real tier-00 multiblock-ish rack
  const buf = { x: yard.x + 2, y: groundY + 1, z: yard.z + 6 };
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        const edge = x === 0 || x === 2 || z === 0 || z === 2 || y === 0 || y === 2;
        if (!edge) continue;
        const face = y === 2 ? (x === 1 && z === 1 ? "top" : null) : null;
        const spec =
          face === "top"
            ? ulvInfra("buffer", "电池缓冲 3×3×3 (ULV)", "Battery Buffer 3x3x3 (ULV)", { id: "batterybuffer.3by3.ulv" })
            : ulvHull();
        world.set(buf.x + x, buf.y + y, buf.z + z, spec);
        ulvShowcase.push({ x: buf.x + x, y: buf.y + y, z: buf.z + z, spec });
      }
    }
  }

  // ---- 3. LV single-block machine hall ------------------------------------
  const hall = { x: center.x + 22, z: center.z - 12 };
  const hallInstances = [];
  LV_MACHINES.forEach((def, i) => {
    const gx = i % 5;
    const gz = Math.floor(i / 5);
    const x = hall.x + gx * 4;
    const z = hall.z + gz * 6;
    // 1-block machine pad so each machine reads as a unit
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        world.set(x + dx, groundY, z + dz, tierCasing("lv", "LV 机器地台", "LV Machine Platform", { role: "机器地台" }));
      }
    }
    const machine = buildMachine({ ...def, tier: "lv", facing: FACE_INDEX.NORTH });
    const entry = world.set(x, groundY + 1, z, machine.idle, { machineId: def.id, tag: "machine" });
    hallInstances.push({ slot: entry, machine, x, z, y: groundY + 1 });
  });

  // ---- 4. multiblock machines --------------------------------------------
  const multiblocks = [];
  const bbfDef = MULTIBLOCKS[0];
  const bbfOrigin = { x: center.x + 6, y: groundY, z: center.z + 32 };
  const bbf = placeStructure(world, bbfDef, bbfOrigin, { active: false });
  multiblocks.push({
    def: bbfDef,
    origin: bbfOrigin,
    controller: bbf.controller,
    validation: validateStructure(world, bbfDef, bbfOrigin),
    center: {
      x: bbfOrigin.x + (bbfDef.size.x - 1) / 2,
      y: bbfOrigin.y + (bbfDef.size.y - 1) / 2,
      z: bbfOrigin.z + (bbfDef.size.z - 1) / 2,
    },
  });

  return {
    world,
    center,
    ulvShowcase,
    hallInstances,
    multiblocks,
    facts: FACTS,
    zones: [
      { id: "ulv", label: "ULV 基础设施区", labelEn: "ULV (tier 00) Infra", ...FACTS.ulv },
      { id: "lv", label: "LV 单方块机器区", labelEn: "LV (tier 01) Machines" },
      { id: "multi", label: "多方块机器", labelEn: "Multiblocks" },
    ],
  };
}
