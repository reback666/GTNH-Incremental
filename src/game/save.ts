import { dec, toSaveString } from '../numeric/decimal';
import { MAX_TIER } from '../numeric/voltage';
import { GameCore, type MachineKind } from './core';
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
  core.maxTier = data.maxTier;
  core.unlockedVeins = [...data.unlockedVeins];
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
    if (data.version !== 1 && data.version !== SAVE_VERSION) {
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
