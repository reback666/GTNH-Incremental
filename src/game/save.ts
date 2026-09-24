import { ZERO, dec, toSaveString } from '../numeric/decimal';
import { MAX_TIER } from '../numeric/voltage';
import { GameCore } from './core';
import { SAVE_KEY, SAVE_VERSION } from './constants';

// 计划书第十四章：存档 = Pinia store 序列化成 JSON，带版本号；
// 大数值一律以字符串存储 —— JSON.parse 只有 double 一种数字类型，超过 2^53 会在解析阶段丢精度。
export interface SaveData {
  version: number;
  ores: string[];
  coins: string[];
  miners: number[];
  generators: number[];
  machines: number[];
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
    miners: [...core.miners],
    generators: [...core.generators],
    machines: [...core.machines],
    maxTier: core.maxTier,
    unlockedVeins: [...core.unlockedVeins],
    playSeconds: core.playSeconds,
    totalOre: toSaveString(core.totalOre),
    totalCoins: toSaveString(core.totalCoins),
    totalOreSpent: toSaveString(core.totalOreSpent),
  };
}

export function deserialize(data: SaveData): GameCore {
  if (data.version !== SAVE_VERSION) {
    throw new Error(`存档版本 ${data.version} 与当前版本 ${SAVE_VERSION} 不一致`);
  }
  const core = new GameCore();
  core.ores = pad(data.ores, 14).map((text) => dec(text ?? '0'));
  core.coins = pad(data.coins, MAX_TIER).map((text) => dec(text ?? '0'));
  core.miners = padNumbers(data.miners, MAX_TIER);
  core.generators = padNumbers(data.generators, MAX_TIER);
  core.machines = padNumbers(data.machines, MAX_TIER);
  core.maxTier = data.maxTier;
  core.unlockedVeins = [...data.unlockedVeins];
  core.playSeconds = data.playSeconds;
  core.totalOre = dec(data.totalOre ?? '0');
  core.totalCoins = dec(data.totalCoins ?? '0');
  core.totalOreSpent = dec(data.totalOreSpent ?? '0');
  return core;
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
    return deserialize(JSON.parse(raw) as SaveData);
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

function padNumbers(list: number[] | undefined, length: number): number[] {
  const out = new Array(length).fill(0) as number[];
  (list ?? []).forEach((value, index) => {
    if (index < length) out[index] = value;
  });
  return out;
}

export { ZERO };
