import { dec, fromSaveString, toSaveString } from '../numeric/decimal';
import { MAX_TIER } from '../numeric/voltage';
import { DEFAULT_GRID } from '../numeric/grid';
import { RESEARCH_GATE_FROM_TIER } from '../numeric/research';
import { GameCore, RIFT_FROM_TIER, type MachineKind } from './core';
import { baseModelOf } from './models';
import { SAVE_KEY, SAVE_VERSION } from './constants';

// 计划书第十四章：存档 = 状态序列化成 JSON，带版本号；
// 大数值一律以字符串存储 —— JSON.parse 只有 double 一种数字类型，超过 2^53 会在解析阶段丢精度。
export interface SaveData {
  version: number;
  ores: string[];
  coins: string[];
  // v2：机型 id → 数量
  counts?: Record<string, number>;
  // v3：机型 id → 超频档位 / 故障台数，以及存电装置的存量
  overclock?: Record<string, number>;
  faults?: Record<string, number>;
  storedEU?: string;
  // v4：污染值、污染开关、电网模式、被黑市薅走的累计
  pollution?: string;
  pollutionEnabled?: boolean;
  grid?: string;
  siphoned?: string;
  // v5：已解锁的电网（解锁要花对应等级的 GT 币）
  grids?: string[];
  // v6：研究进度与已研究出来的电压等级（ZPM 及以后要先研究）
  researchProgress?: string;
  researched?: number[];
  // v7：转生：时空线缆、永久加成节点、转生次数、本周目累计 EU
  cables?: string;
  rebirthCount?: number;
  rebirthNodes?: string[];
  runEU?: string;
  totalEU?: string;
  riftOffered?: boolean;
  // v8：开发者模式开关
  devMode?: boolean;
  // v9：累计统计与成就
  peakTier?: number;
  manualMines?: number;
  builtMachines?: number;
  overclockUsed?: boolean;
  repairs?: number;
  maxPollution?: string;
  totalCables?: string;
  achieved?: Record<string, number>;
  // v10：已拥有的平行宇宙
  universes?: string[];
  // v11：奥术宇宙的源质存量
  essentia?: string;
  // v1 遗留字段：按电压等级存的数量，读到旧存档时用来迁移
  miners?: number[];
  generators?: number[];
  machines?: number[];
  maxTier: number;
  unlockedVeins: number[];
  playSeconds: number;
  totalOre: string;
  totalCoins: string;
  totalOreSpent: string;
}

export function serialize(core: GameCore): SaveData {
  return {
    version: SAVE_VERSION,
    ores: core.ores.map(toSaveString),
    coins: core.coins.map(toSaveString),
    counts: { ...core.counts },
    overclock: { ...core.overclock },
    faults: { ...core.faults },
    storedEU: toSaveString(core.storedEU),
    pollution: toSaveString(core.pollution),
    pollutionEnabled: core.pollutionEnabled,
    grid: core.grid,
    grids: [...core.grids],
    researchProgress: toSaveString(core.researchProgress),
    researched: [...core.researched],
    cables: toSaveString(core.cables),
    rebirthCount: core.rebirthCount,
    rebirthNodes: [...core.rebirthNodes],
    runEU: toSaveString(core.runEU),
    totalEU: toSaveString(core.totalEU),
    riftOffered: core.riftOffered,
    devMode: core.devMode,
    peakTier: core.peakTier,
    manualMines: core.manualMines,
    builtMachines: core.builtMachines,
    overclockUsed: core.overclockUsed,
    repairs: core.repairs,
    maxPollution: toSaveString(core.maxPollution),
    totalCables: toSaveString(core.totalCables),
    achieved: { ...core.achieved },
    universes: [...core.universes],
    essentia: toSaveString(core.essentia),
    siphoned: toSaveString(core.siphoned),
    maxTier: core.maxTier,
    unlockedVeins: [...core.unlockedVeins],
    playSeconds: core.playSeconds,
    totalOre: toSaveString(core.totalOre),
    totalCoins: toSaveString(core.totalCoins),
    totalOreSpent: toSaveString(core.totalOreSpent),
  };
}

export function deserialize(data: SaveData): GameCore {
  const core = new GameCore();
  core.ores = pad(data.ores, 14).map((text) => dec(text ?? '0'));
  core.coins = pad(data.coins, MAX_TIER).map((text) => dec(text ?? '0'));
  core.counts = data.counts ? { ...data.counts } : migrateFromV1(data);
  core.overclock = { ...(data.overclock ?? {}) };
  core.faults = { ...(data.faults ?? {}) };
  core.storedEU = fromSaveString(data.storedEU ?? '0');
  core.pollution = fromSaveString(data.pollution ?? '0');
  core.pollutionEnabled = data.pollutionEnabled ?? true;
  core.grid = (data.grid as GameCore['grid']) ?? 'stable';
  // v4 及以前没有「已解锁电网」的概念：把当前接的那一档当成已解锁，别让玩家白花钱
  core.grids = data.grids
    ? (data.grids as GameCore['grids'])
    : ([DEFAULT_GRID, ...(core.grid !== DEFAULT_GRID ? [core.grid] : [])] as GameCore['grids']);
  core.siphoned = fromSaveString(data.siphoned ?? '0');
  core.maxTier = data.maxTier;
  core.unlockedVeins = [...data.unlockedVeins];
  // v5 及以前没有研究概念：默认只有 LuV 及以前不用研究的那几级
  core.researchProgress = fromSaveString(data.researchProgress ?? '0');
  core.researched = data.researched
    ? [...data.researched]
    : Array.from({ length: RESEARCH_GATE_FROM_TIER - 1 }, (_, index) => index + 1);
  core.cables = fromSaveString(data.cables ?? '0');
  core.rebirthCount = data.rebirthCount ?? 0;
  core.rebirthNodes = [...(data.rebirthNodes ?? [])];
  core.runEU = fromSaveString(data.runEU ?? '0');
  core.totalEU = fromSaveString(data.totalEU ?? '0');
  // v6 及以前没有裂缝：已经在 LuV 以上存档说明这一趟早就过了这个点，
  // 默认按「已处理」算，免得读档就弹窗；下一周目会正常弹。
  core.riftOffered = data.riftOffered ?? core.maxTier >= RIFT_FROM_TIER;
  core.devMode = data.devMode ?? false;
  core.peakTier = data.peakTier ?? core.maxTier;
  core.manualMines = data.manualMines ?? 0;
  core.builtMachines = data.builtMachines ?? 0;
  core.overclockUsed = data.overclockUsed ?? false;
  core.repairs = data.repairs ?? 0;
  core.maxPollution = fromSaveString(data.maxPollution ?? '0');
  core.totalCables = fromSaveString(data.totalCables ?? '0');
  core.achieved = { ...(data.achieved ?? {}) };
  core.universes = [...((data.universes ?? []) as GameCore['universes'])];
  core.essentia = fromSaveString(data.essentia ?? '0');
  core.playSeconds = data.playSeconds;
  core.totalOre = dec(data.totalOre ?? '0');
  core.totalCoins = dec(data.totalCoins ?? '0');
  core.totalOreSpent = dec(data.totalOreSpent ?? '0');
  return core;
}

// v1 存档只记了「第几级有多少台」，没有机型概念。
// 迁移时把数量挂到该等级的第一个机型上 —— 也就是当时的那种通用机器。
function migrateFromV1(data: SaveData): Record<string, number> {
  const counts: Record<string, number> = {};
  const legacy: [MachineKind, number[] | undefined][] = [
    ['miner', data.miners],
    ['generator', data.generators],
    ['machine', data.machines],
  ];
  for (const [category, list] of legacy) {
    (list ?? []).forEach((count, index) => {
      if (!count) return;
      const tier = index + 1;
      if (tier > MAX_TIER) return;
      counts[baseModelOf(category, tier).id] = count;
    });
  }
  return counts;
}

export function saveToStorage(core: GameCore): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(core)));
}

export function loadFromStorage(): GameCore | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION) {
      throw new Error(`存档版本 ${data.version} 无法识别`);
    }
    return deserialize(data);
  } catch (error) {
    console.warn('存档读取失败，已忽略：', error);
    return null;
  }
}

export function clearStorage(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SAVE_KEY);
}

function pad(list: string[] | undefined, length: number): (string | undefined)[] {
  const out = new Array(length).fill('0') as (string | undefined)[];
  (list ?? []).forEach((value, index) => {
    if (index < length) out[index] = value;
  });
  return out;
}
