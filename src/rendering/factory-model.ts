// 工厂基地的「纯投影」：把快照里的机器数据压成有界、稳定的渲染清单。
// 这里不碰 Three.js，也不碰 Vue 响应式：输入只读快照（结构类型，Snapshot 可直接传入），
// 输出普通对象。渲染层只认这份清单，单测也只测这一层。

export type FactoryBlock = 'single' | 'multiblock';

/** 单个代表方块的显示状态 */
export type UnitStatus = 'running' | 'idle' | 'stopped' | 'faulty' | 'unpowered' | 'storage';

export interface FactoryInputModel {
  id: string;
  name: string;
  block: FactoryBlock;
  count: number;
  running: number;
  idle: number;
  stopped: boolean;
  stoppable: boolean;
  faulty: number;
  visPowered?: boolean;
}

export interface FactoryInputTier {
  tier: number;
  voltage: string;
  unlocked: boolean;
  models: readonly FactoryInputModel[];
}

export interface FactoryInputColumn {
  kind: string;
  title: string;
  count: number;
  tiers: readonly FactoryInputTier[];
}

export interface FactoryInput {
  columns: readonly FactoryInputColumn[];
  maxTier: number;
  power: { ratio: string; ratioShort: boolean };
  risk: { outage: boolean; bandName: string };
  currentVein: { tier: number; name: string };
}

export interface FactoryBudget {
  /** 每个单方块机型最多几个代表 */
  perSingle: number;
  /** 每个多方块机型最多几个代表 */
  perMulti: number;
  /** 全局代表上限 */
  total: number;
}

export const DEFAULT_BUDGET: FactoryBudget = { perSingle: 12, perMulti: 4, total: 192 };

/** 分区固定顺序：北岸（矿坑一侧）与南岸各自从左向右排 */
export const KIND_ORDER = [
  'miner',
  'machine',
  'research',
  'arcane',
  'generator',
  'storage',
  'purifier',
  'abyss',
] as const;
const NORTH_KINDS = new Set<string>(['miner', 'machine', 'research', 'arcane']);
/** 基地基座：新存档也有矿区、生产、供电三块地台 */
const BASE_KINDS = new Set<string>(['miner', 'machine', 'generator']);

// 布局尺寸（世界单位 = 1 个 Minecraft 方块）
export const SINGLE_SIZE = 1;
export const MULTI_SIZE = 2.6;
const SINGLE_STEP = 1.2;
const MULTI_STEP = 3.1;
const PAD_MARGIN = 0.7;
/** 机位之间、分区之间的空隙与分区内边距 */
const CELL_GAP = 0.6;
const ZONE_MARGIN = 0.8;
const ZONE_GAP = 1.6;
/** 中央大道半宽：矿坑与主母线在这里 */
export const AVENUE_HALF = 6;
/** 两岸分区的起点（矿坑左缘），分区向 +x 依次排开 */
const ROW_START_X = -6;
/** 矿坑及龙门占的 x 范围（基地最小宽度） */
const PIT_MAX_X = 7;

export interface FactoryUnit {
  /** 稳定 key：机型 id + 代表序号；状态变化不改 key */
  key: string;
  modelId: string;
  kind: string;
  tier: number;
  block: FactoryBlock;
  status: UnitStatus;
  /** 方块中心（地面高度为 0） */
  x: number;
  z: number;
  size: number;
}

export interface StatusCounts {
  running: number;
  idle: number;
  unpowered: number;
  stopped: number;
  faulty: number;
  storage: number;
}

export interface FactoryGroup {
  key: string;
  modelId: string;
  name: string;
  kind: string;
  kindTitle: string;
  tier: number;
  voltage: string;
  block: FactoryBlock;
  /** 真实台数与状态 */
  count: number;
  running: number;
  idle: number;
  faulty: number;
  manualStopped: boolean;
  stoppable: boolean;
  /** 真实台数按状态拆分（各项之和 = count） */
  statusCounts: StatusCounts;
  /** 场景里画出的代表数量；聚合了多少台 */
  shown: number;
  aggregated: number;
  /** 机位（地台）矩形中心与尺寸 */
  padX: number;
  padZ: number;
  padW: number;
  padD: number;
}

export interface FactoryZone {
  kind: string;
  title: string;
  count: number;
  north: boolean;
  /** 已激活（画出地台）的矩形 */
  x: number;
  z: number;
  w: number;
  d: number;
  activeTiers: number;
}

export interface FactoryPlan {
  zones: FactoryZone[];
  /** 仅已拥有机型（count > 0） */
  groups: FactoryGroup[];
  units: FactoryUnit[];
  totalMachines: number;
  shownUnits: number;
  ownedModels: number;
  /** 预算不够、一个代表也没分到的已拥有机型数 */
  hiddenModels: number;
  maxTier: number;
  outage: boolean;
  powerShort: boolean;
  powerRatio: string;
  pollutionBand: string;
  veinTier: number;
  veinName: string;
  /** 静态环境（地台、矿坑）是否需要重建的签名 */
  layoutKey: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

interface PadSlot {
  model: FactoryInputModel;
  tier: number;
  voltage: string;
  kind: string;
  kindTitle: string;
  padX: number;
  padZ: number;
  padW: number;
  padD: number;
}

/** 机位内代表的列数：随代表数增长，尽量接近方形 */
function padCols(block: FactoryBlock, shown: number): number {
  if (block === 'multiblock') return shown <= 1 ? 1 : 2;
  if (shown <= 1) return 1;
  if (shown <= 4) return 2;
  if (shown <= 9) return 3;
  return 4;
}

function padSize(block: FactoryBlock, shown: number): { w: number; d: number } {
  const n = Math.max(1, shown);
  const cols = padCols(block, n);
  const rows = Math.ceil(n / cols);
  const step = block === 'multiblock' ? MULTI_STEP : SINGLE_STEP;
  return { w: cols * step + PAD_MARGIN, d: rows * step + PAD_MARGIN };
}

/** 代表 i 在机位内的偏移（相对机位中心）；dir 让第 0 排靠近大道 */
function unitOffset(block: FactoryBlock, index: number, shown: number, padW: number, padD: number, dir: number): [number, number] {
  const cols = padCols(block, Math.max(1, shown));
  const step = block === 'multiblock' ? MULTI_STEP : SINGLE_STEP;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = -padW / 2 + PAD_MARGIN / 2 + step / 2 + col * step;
  const z = -dir * (padD / 2 - PAD_MARGIN / 2 - step / 2 - row * step);
  return [x, z];
}

function sortedColumns(columns: readonly FactoryInputColumn[]): FactoryInputColumn[] {
  const rank = (kind: string) => {
    const index = (KIND_ORDER as readonly string[]).indexOf(kind);
    return index < 0 ? KIND_ORDER.length : index;
  };
  return [...columns].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** 按真实台数拆状态，各项之和 = count */
export function splitStatus(
  model: FactoryInputModel,
  kind: string,
  unpowered: boolean,
): StatusCounts {
  const count = Math.max(0, Math.floor(model.count));
  const result: StatusCounts = { running: 0, idle: 0, unpowered: 0, stopped: 0, faulty: 0, storage: 0 };
  if (count === 0) return result;
  if (!model.stoppable || kind === 'storage') {
    result.storage = count;
    return result;
  }
  result.faulty = Math.min(count, Math.max(0, Math.floor(model.faulty)));
  const healthy = count - result.faulty;
  if (model.stopped) {
    result.stopped = healthy;
    return result;
  }
  result.running = Math.min(healthy, Math.max(0, Math.floor(model.running)));
  const rest = healthy - result.running;
  if (unpowered && !model.visPowered) result.unpowered = rest;
  else result.idle = rest;
  return result;
}

const STATUS_SEQUENCE: (keyof StatusCounts)[] = ['running', 'storage', 'idle', 'unpowered', 'stopped', 'faulty'];

/**
 * 把真实状态按比例分到 shown 个代表上（最大余数法）。
 * 只要代表数允许，每个非零状态至少占 1 个，少量故障也能看见。
 */
export function apportionStatus(counts: StatusCounts, shown: number): UnitStatus[] {
  const total = STATUS_SEQUENCE.reduce((sum, key) => sum + counts[key], 0);
  if (shown <= 0 || total <= 0) return [];
  const present = STATUS_SEQUENCE.filter((key) => counts[key] > 0);
  const slots = new Map<keyof StatusCounts, number>();
  const guaranteed = shown >= present.length;
  let left = shown;
  if (guaranteed) {
    for (const key of present) slots.set(key, 1);
    left -= present.length;
  }
  const base = guaranteed ? 1 : 0;
  const pool = total - (guaranteed ? present.length : 0);
  const remainders: { key: keyof StatusCounts; rem: number }[] = [];
  let assigned = 0;
  for (const key of present) {
    const weight = counts[key] - base;
    const exact = pool > 0 ? (weight / pool) * left : 0;
    const whole = Math.floor(exact);
    slots.set(key, (slots.get(key) ?? 0) + whole);
    assigned += whole;
    remainders.push({ key, rem: exact - whole });
  }
  // 余数大者优先；并列时按固定状态顺序
  remainders.sort((a, b) => b.rem - a.rem || STATUS_SEQUENCE.indexOf(a.key) - STATUS_SEQUENCE.indexOf(b.key));
  for (let i = 0; assigned < left && remainders.length > 0; i += 1) {
    const key = remainders[i % remainders.length]!.key;
    slots.set(key, (slots.get(key) ?? 0) + 1);
    assigned += 1;
  }
  const out: UnitStatus[] = [];
  for (const key of STATUS_SEQUENCE) {
    for (let i = 0; i < (slots.get(key) ?? 0); i += 1) out.push(key);
  }
  return out.slice(0, shown);
}

/**
 * 公平分配代表数：先按「分区轮转」顺序每个机型给 1 个，再逐层加 1，
 * 直到机型上限或全局预算用完。任意两个机型的代表数差距不超过 1（除非被台数/上限卡住）。
 * 返回与 order 同序的代表数。
 */
export function allocateBudget(
  order: readonly { count: number; cap: number }[],
  total: number,
): number[] {
  const shown = order.map(() => 0);
  let left = Math.max(0, Math.floor(total));
  const ceiling = order.reduce((max, item) => Math.max(max, Math.min(item.count, item.cap)), 0);
  for (let level = 1; level <= ceiling && left > 0; level += 1) {
    for (let i = 0; i < order.length && left > 0; i += 1) {
      const item = order[i]!;
      if (Math.min(item.count, item.cap) >= level) {
        shown[i] = level;
        left -= 1;
      }
    }
  }
  return shown;
}

/** 多个分区的机型交错排序：每个分区轮流出一个，避免前面的分区吃光预算 */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) {
      const item = list[i];
      if (item !== undefined) out.push(item);
    }
  }
  return out;
}

interface OwnedEntry {
  model: FactoryInputModel;
  tier: number;
  voltage: string;
}

/** 空基座分区的占地 */
const EMPTY_ZONE = 4;

/**
 * 分区内机位按「货架」排布：从靠大道的一角开始，一排排向外铺，排宽取近方形。
 * 每个机位锚定在格子左上角（靠大道一侧），所以前面的机位不会因后面机位变大而移动。
 */
function shelfRowLimit(sizes: { w: number; d: number }[]): number {
  const area = sizes.reduce((sum, s) => sum + (s.w + CELL_GAP) * (s.d + CELL_GAP), 0);
  const widest = sizes.reduce((max, s) => Math.max(max, s.w), 0);
  // 排宽按 6 格取整：机型数小幅增减时排宽不变，已有机位不挪
  const target = Math.ceil((Math.sqrt(area) * 1.15) / 6) * 6;
  return Math.max(widest, target);
}

export function buildFactoryPlan(input: FactoryInput, budget: FactoryBudget = DEFAULT_BUDGET): FactoryPlan {
  const columns = sortedColumns(input.columns);
  const unpowered = input.risk.outage || input.power.ratioShort;

  // 1) 只取已拥有机型；先公平分配代表数，再按代表数决定机位大小
  const ownedByKind: OwnedEntry[][] = columns.map((column) => {
    const out: OwnedEntry[] = [];
    for (const tier of [...column.tiers].sort((a, b) => a.tier - b.tier)) {
      for (const model of tier.models) if (model.count > 0) out.push({ model, tier: tier.tier, voltage: tier.voltage });
    }
    return out;
  });
  const ordered = interleave(ownedByKind);
  const shownList = allocateBudget(
    ordered.map((entry) => ({
      count: entry.model.count,
      cap: entry.model.block === 'multiblock' ? budget.perMulti : budget.perSingle,
    })),
    budget.total,
  );
  const shownById = new Map<string, number>();
  ordered.forEach((entry, index) => shownById.set(entry.model.id, shownList[index] ?? 0));

  // 2) 分区：基座分区与有机器的分区占地，其余不占地
  const zones: FactoryZone[] = [];
  const slotsByKind: PadSlot[][] = [];
  const cursor = { north: ROW_START_X, south: ROW_START_X };
  columns.forEach((column, columnIndex) => {
    const north = NORTH_KINDS.has(column.kind);
    const dir = north ? -1 : 1;
    const owned = ownedByKind[columnIndex]!;
    const active = owned.length > 0 || BASE_KINDS.has(column.kind);
    const slots: PadSlot[] = [];
    let w = 0;
    let d = 0;
    const x0 = north ? cursor.north : cursor.south;
    if (active) {
      const sizes = owned.map((entry) => padSize(entry.model.block, shownById.get(entry.model.id) ?? 0));
      const rowLimit = shelfRowLimit(sizes);
      let x = 0;
      let z = 0;
      let rowDepth = 0;
      owned.forEach((entry, index) => {
        const size = sizes[index]!;
        if (x > 0 && x + size.w > rowLimit + 1e-6) {
          z += rowDepth + CELL_GAP;
          x = 0;
          rowDepth = 0;
        }
        slots.push({
          model: entry.model,
          tier: entry.tier,
          voltage: entry.voltage,
          kind: column.kind,
          kindTitle: column.title,
          padX: x0 + ZONE_MARGIN + x + size.w / 2,
          padZ: dir * (AVENUE_HALF + ZONE_MARGIN + z + size.d / 2),
          padW: size.w,
          padD: size.d,
        });
        x += size.w + CELL_GAP;
        w = Math.max(w, x - CELL_GAP);
        rowDepth = Math.max(rowDepth, size.d);
      });
      d = z + rowDepth;
      w = Math.max(EMPTY_ZONE, w) + ZONE_MARGIN * 2;
      d = Math.max(EMPTY_ZONE, d) + ZONE_MARGIN * 2;
      if (north) cursor.north += w + ZONE_GAP;
      else cursor.south += w + ZONE_GAP;
    }
    zones.push({
      kind: column.kind,
      title: column.title,
      count: column.count,
      north,
      x: x0 + w / 2,
      z: dir * (AVENUE_HALF + d / 2),
      w,
      d,
      activeTiers: new Set(owned.map((entry) => entry.tier)).size,
    });
    slotsByKind.push(slots);
  });

  const groups: FactoryGroup[] = [];
  const units: FactoryUnit[] = [];
  let totalMachines = 0;
  // 按分区固定顺序输出（不是交错顺序），代表 key 只取决于机型 id 与序号
  for (const slots of slotsByKind) {
    for (const slot of slots) {
      const model = slot.model;
      const statusCounts = splitStatus(model, slot.kind, unpowered);
      const shown = shownById.get(model.id) ?? 0;
      totalMachines += model.count;
      groups.push({
        key: model.id,
        modelId: model.id,
        name: model.name,
        kind: slot.kind,
        kindTitle: slot.kindTitle,
        tier: slot.tier,
        voltage: slot.voltage,
        block: model.block,
        count: model.count,
        running: statusCounts.running,
        idle: model.count - statusCounts.running,
        faulty: statusCounts.faulty,
        manualStopped: model.stopped,
        stoppable: model.stoppable,
        statusCounts,
        shown,
        aggregated: model.count - shown,
        padX: slot.padX,
        padZ: slot.padZ,
        padW: slot.padW,
        padD: slot.padD,
      });
      const dir = NORTH_KINDS.has(slot.kind) ? -1 : 1;
      const statuses = apportionStatus(statusCounts, shown);
      statuses.forEach((status, index) => {
        const [dx, dz] = unitOffset(model.block, index, shown, slot.padW, slot.padD, dir);
        units.push({
          key: `${model.id}#${index}`,
          modelId: model.id,
          kind: slot.kind,
          tier: slot.tier,
          block: model.block,
          status,
          x: slot.padX + dx,
          z: slot.padZ + dz,
          size: model.block === 'multiblock' ? MULTI_SIZE : SINGLE_SIZE,
        });
      });
    }
  }

  // 基地边界：至少包住矿坑与大道
  let minX = -PIT_MAX_X;
  let maxX = PIT_MAX_X;
  let minZ = -AVENUE_HALF;
  let maxZ = AVENUE_HALF;
  const layoutParts: string[] = [`t${input.maxTier}`, `v${input.currentVein.tier}`];
  for (const zone of zones) {
    if (zone.d <= 0) continue;
    minX = Math.min(minX, zone.x - zone.w / 2);
    maxX = Math.max(maxX, zone.x + zone.w / 2);
    minZ = Math.min(minZ, zone.z - zone.d / 2);
    maxZ = Math.max(maxZ, zone.z + zone.d / 2);
    layoutParts.push(`${zone.kind}:${zone.x.toFixed(2)},${zone.w.toFixed(2)},${zone.d.toFixed(2)}`);
  }

  return {
    zones,
    groups,
    units,
    totalMachines,
    shownUnits: units.length,
    ownedModels: groups.length,
    hiddenModels: groups.filter((group) => group.shown === 0).length,
    maxTier: input.maxTier,
    outage: input.risk.outage,
    powerShort: input.power.ratioShort,
    powerRatio: input.power.ratio,
    pollutionBand: input.risk.bandName,
    veinTier: input.currentVein.tier,
    veinName: input.currentVein.name,
    layoutKey: layoutParts.join('|'),
    bounds: { minX, maxX, minZ, maxZ },
  };
}

/** 机型 → 分组的查找（选中面板用） */
export function findGroup(plan: FactoryPlan, modelId: string | null): FactoryGroup | null {
  if (!modelId) return null;
  return plan.groups.find((group) => group.modelId === modelId) ?? null;
}
