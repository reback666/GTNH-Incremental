// GTNH single-block machines (tier 00 / 01) driven by the real GT5U texture
// layout: MACHINE_<TIER>_{SIDE,TOP,BOTTOM} base + basicmachines/<machine>/
// OVERLAY_<FACE>[_ACTIVE] function faces.
//
// Important GT5U fact encoded here: tier 00 (ULV) has NO basic processing
// machines -- in GT5U `basicmachine.<name>.tier.NN` starts at tier.01 (LV).
// ULV only has infrastructure: hulls, battery buffers, chargers, transformers,
// hatches and buses. So the ULV area shows infrastructure, and the processing
// machines are shown at LV (tier 01), each with its own overlay set.

import { PASS, block } from "./blocks.js";
import * as T from "./textures.js";

export const FACE_INDEX = { EAST: 0, WEST: 1, UP: 2, DOWN: 3, SOUTH: 4, NORTH: 5 };

function tex6({ e, w, up, down, south, north }) {
  return [e, w, up, down, south, north];
}

const BASES = {
  ulv: { side: T.machineUlvSide, top: T.machineUlvTop, bottom: T.machineUlvBottom },
  lv: { side: T.machineLvSide, top: T.machineLvTop, bottom: T.machineLvBottom },
};

const CASINGS = {
  ulv: T.casingUlv,
  lv: T.casingLv,
  mv: T.casingMv,
  hv: T.casingHv,
  ev: T.casingEv,
  iv: T.casingIv,
  luv: T.casingLuv,
  zpm: T.casingZpm,
  uv: T.casingUv,
};

/**
 * Rotate a machine so that its function face (SOUTH by default) points to
 * `facing`. Missing face textures fall back to the tier base texture, exactly
 * like GT5U: a machine with no SIDE overlay is just bare casing on the sides.
 */
function orientFaces(base, ov, facing = FACE_INDEX.SOUTH) {
  const f = {
    [FACE_INDEX.EAST]: ov.side && ov.side.e ? ov.side.e : base.side,
    [FACE_INDEX.WEST]: ov.side && ov.side.w ? ov.side.w : base.side,
    [FACE_INDEX.UP]: ov.top ? ov.top : base.top,
    [FACE_INDEX.DOWN]: ov.bottom ? ov.bottom : base.bottom,
    [FACE_INDEX.SOUTH]: ov.front,
    [FACE_INDEX.NORTH]: ov.side && ov.side.n ? ov.side.n : base.side,
  };
  const out = new Array(6);
  for (const [target, src] of Object.entries(facingPairs(facing))) {
    out[target] = f[src];
  }
  return out;
}

/** Maps target face -> source face when rotating a south-facing texture set. */
function facingPairs(facing) {
  // south is the canonical "front"
  switch (facing) {
    case FACE_INDEX.SOUTH:
      return { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
    case FACE_INDEX.NORTH:
      return { 0: 1, 1: 0, 2: 2, 3: 3, 4: 5, 5: 4 };
    case FACE_INDEX.EAST:
      return { 0: 4, 1: 5, 2: 2, 3: 3, 4: 1, 5: 0 };
    case FACE_INDEX.WEST:
      return { 0: 5, 1: 4, 2: 2, 3: 3, 4: 0, 5: 1 };
    default:
      return { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
  }
}

/**
 * Build one GT5U single-block machine (idle + running variants).
 * @param {object} o
 * @param {string} o.id       GT5U machine id, e.g. "macerator"
 * @param {string} o.tier     "ulv" | "lv"
 * @param {string} o.name     中文名
 * @param {string} o.nameEn   英文名
 * @param {object} o.tex      { front, frontActive, side?, sideActive?, top?, topActive?, bottom?, bottomActive? }
 * @param {number} [o.facing] FACE_INDEX the function face points at
 * @param {object} [o.meta]
 */
export function buildMachine(o) {
  const base = BASES[o.tier];
  const facing = o.facing ?? FACE_INDEX.SOUTH;
  const ov = {
    front: o.tex.front,
    side: o.tex.side ? { e: o.tex.side, w: o.tex.side, n: o.tex.side } : null,
    top: o.tex.top || null,
    bottom: o.tex.bottom || null,
  };
  const ovActive = {
    front: o.tex.frontActive || o.tex.front,
    side: o.tex.sideActive
      ? { e: o.tex.sideActive, w: o.tex.sideActive, n: o.tex.sideActive }
      : ov.side,
    top: o.tex.topActive || ov.top,
    bottom: o.tex.bottomActive || ov.bottom,
  };

  const meta = {
    id: o.id,
    tier: o.tier,
    voltage: o.tier === "ulv" ? "ULV · 8 EU/t" : "LV · 32 EU/t",
    ...o.meta,
  };
  const idle = block({
    tex: orientFaces(base, ov, facing),
    name: o.name,
    nameEn: o.nameEn,
    meta: { ...meta, state: "idle" },
  });
  const run = block({
    tex: orientFaces(base, ovActive, facing),
    name: o.name,
    nameEn: o.nameEn,
    emissive: 0.18,
    meta: { ...meta, state: "running" },
  });
  return { id: o.id, tier: o.tier, name: o.name, nameEn: o.nameEn, meta, idle, run };
}

/** The GT5U LV single-block processing machines, with their overlay sets. */
export const LV_MACHINES = [
  {
    id: "macerator",
    name: "研磨机",
    nameEn: "Macerator",
    tex: {
      front: T.maceratorFront,
      frontActive: T.maceratorFrontActive,
      top: T.maceratorTop,
      topActive: T.maceratorTopActive,
    },
    meta: { tiers: "LV–UV", role: "粉碎矿石为粉", recipe: "矿石 → 2 粉" },
  },
  {
    id: "alloy_smelter",
    name: "合金炉",
    nameEn: "Alloy Smelter",
    tex: {
      front: T.alloySmelterFront,
      frontActive: T.alloySmelterFrontActive,
      side: T.alloySmelterSide,
      sideActive: T.alloySmelterSideActive,
      top: T.alloySmelterTop,
      topActive: T.alloySmelterTopActive,
      bottom: T.alloySmelterBottom,
      bottomActive: T.alloySmelterBottomActive,
    },
    meta: { tiers: "LV–UV", role: "合金 / 熔炼", recipe: "金属 + 金属 → 合金锭" },
  },
  {
    id: "compressor",
    name: "压缩机",
    nameEn: "Compressor",
    tex: {
      front: T.compressorFront,
      frontActive: T.compressorFrontActive,
      side: T.compressorSide,
      sideActive: T.compressorSideActive,
      top: T.compressorTop,
      topActive: T.compressorTopActive,
    },
    meta: { tiers: "LV–UV", role: "压缩", recipe: "锭 → 块 / 粉 → 锭" },
  },
  {
    id: "extractor",
    name: "提取机",
    nameEn: "Extractor",
    tex: {
      front: T.extractorFront,
      frontActive: T.extractorFrontActive,
      side: T.extractorSide,
      sideActive: T.extractorSideActive,
      top: T.extractorTop,
      topActive: T.extractorTopActive,
    },
    meta: { tiers: "LV–UV", role: "提取", recipe: "橡胶木 → 橡胶" },
  },
  {
    id: "electric_furnace",
    name: "电炉",
    nameEn: "Electric Furnace",
    tex: { front: T.electricFurnaceFront, frontActive: T.electricFurnaceFrontActive },
    meta: { tiers: "LV–UV", role: "烧炼", recipe: "矿石/粉 → 锭", note: "无 SIDE/TOP 覆盖层" },
  },
  {
    id: "wiremill",
    name: "线材轧机",
    nameEn: "Wiremill",
    tex: {
      front: T.wiremillFront,
      frontActive: T.wiremillFrontActive,
      side: T.wiremillSide,
      sideActive: T.wiremillSideActive,
      top: T.wiremillTop,
      topActive: T.wiremillTopActive,
    },
    meta: { tiers: "LV–UV", role: "拉线", recipe: "锭 → 2 线 / 1 细线" },
  },
  {
    id: "hammer",
    name: "锻造锤",
    nameEn: "Forge Hammer",
    tex: { front: T.hammerFront, frontActive: T.hammerFrontActive },
    meta: { tiers: "LV–UV", role: "锻打", recipe: "锭 → 板", note: "无 SIDE/TOP 覆盖层" },
  },
  {
    id: "fluid_heater",
    name: "流体加热器",
    nameEn: "Fluid Heater",
    tex: {
      front: T.fluidHeaterFront,
      frontActive: T.fluidHeaterFrontActive,
      side: T.fluidHeaterSide,
      sideActive: T.fluidHeaterSideActive,
      top: T.fluidHeaterTop,
      topActive: T.fluidHeaterTopActive,
    },
    meta: { tiers: "LV–UV", role: "加热流体", recipe: "流体 + EU → 热流体" },
  },
  {
    id: "fluid_solidifier",
    name: "流体固化器",
    nameEn: "Fluid Solidifier",
    tex: { front: T.fluidSolidifierFront, frontActive: T.fluidSolidifierFrontActive },
    meta: { tiers: "LV–UV", role: "流体成型", note: "无 SIDE/TOP 覆盖层" },
  },
  {
    id: "ore_washer",
    name: "洗矿机",
    nameEn: "Ore Washer",
    tex: {
      front: T.oreWasherFront,
      frontActive: T.oreWasherFrontActive,
      side: T.oreWasherSide,
      sideActive: T.oreWasherSideActive,
    },
    meta: { tiers: "LV–UV", role: "洗矿", note: "无 TOP 覆盖层" },
  },
];

// ---- ULV (tier 00) infrastructure -----------------------------------------
// These are the only machines GT5U actually registers at tier 00.

export function tierCasing(tier, name, nameEn, meta) {
  return block({ tex: CASINGS[tier], name, nameEn, meta: { tier, ...meta } });
}

export function ulvHull() {
  return block({
    tex: tex6({
      e: T.hullUlvSide,
      w: T.hullUlvSide,
      up: T.hullUlvTop,
      down: T.hullUlvBottom,
      south: T.hullUlvSide,
      north: T.hullUlvSide,
    }),
    name: "ULV 机器外壳",
    nameEn: "Hull (ULV)",
    meta: { id: "gt.blockmachines:hull.ulv", tier: "ulv", voltage: "ULV · 8 EU/t", role: "机器框架" },
  });
}

export function energyHatch(direction) {
  const ov = direction === "in" ? T.overlayEnergyIn : T.overlayEnergyOut;
  const b = BASES.ulv;
  return block({
    tex: tex6({ e: b.side, w: b.side, up: b.top, down: b.bottom, south: ov, north: b.side }),
    name: direction === "in" ? "能源仓 (ULV)" : "动力仓 (ULV)",
    nameEn: direction === "in" ? "Energy Hatch (ULV)" : "Dynamo Hatch (ULV)",
    meta: {
      id: direction === "in" ? "gt.blockmachines:hatch.energy.ulv" : "gt.blockmachines:hatch.dynamo.ulv",
      tier: "ulv",
      voltage: "ULV · 8 EU/t",
      role: direction === "in" ? "输入 EU" : "输出 EU",
    },
  });
}

/** A GT5U "1x1" battery buffer / transformer style infrastructure block. */
export function ulvInfra(kind, name, nameEn, meta) {
  const b = BASES.ulv;
  const ov = {
    buffer: T.overlayEnergyIn,
    transformer: T.overlayEnergyOut,
    charger: T.overlayEnergyIn,
    locker: T.overlayVoid,
    washers: T.waterStill,
    contamination: T.overlayContamination,
  }[kind] || null;
  return block({
    tex: tex6({ e: b.side, w: b.side, up: b.top, down: b.bottom, south: ov || b.side, north: b.side }),
    name,
    nameEn,
    meta: { tier: "ulv", voltage: "ULV · 8 EU/t", ...meta },
  });
}

export function waterBlock() {
  return block({
    tex: T.waterStill,
    pass: PASS.WATER,
    solid: false,
    opacity: 0.72,
    name: "水",
    nameEn: "Water",
    meta: { id: "minecraft:water", role: "多方块冷却" },
  });
}

export function heatproofCasing() {
  return block({
    tex: T.heatproofCasing,
    name: "耐热外壳",
    nameEn: "Heat Proof Casing",
    meta: { id: "gt.blockcasings:machine_heatproof", role: "隔热外壳" },
  });
}
