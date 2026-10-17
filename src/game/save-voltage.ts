import { VOLTAGES } from '../content';
import type { SaveData } from './save';

// 旧存档没有内容标识；这个历史顺序必须固定，不能改成当前配置的列表。
const V25_VOLTAGES = ['ULV', 'LV', 'MV', 'HV', 'EV', 'IV', 'LuV', 'ZPM', 'UV', 'UHV', 'UEV', 'UIV', 'UMV', 'UXV', 'MAX'];

export function remapVoltageSave(data: SaveData, targetIds = VOLTAGES.map((voltage) => voltage.id)): SaveData {
  const sourceIds = data.voltageIds ?? (data.version <= 25 ? V25_VOLTAGES : targetIds);
  if (!Array.isArray(sourceIds) || sourceIds.length === 0 || sourceIds.some((id) => typeof id !== 'string') || new Set(sourceIds).size !== sourceIds.length) {
    throw new Error('存档的电压标识列表无效');
  }
  if (sourceIds.length === targetIds.length && sourceIds.every((id, index) => id === targetIds[index])) return data;
  const targetIndex = new Map(targetIds.map((id, index) => [id, index]));
  const sourceIndex = new Map(sourceIds.map((id, index) => [id, index]));
  const tier = (value: number): number => {
    if (!Number.isInteger(value) || value < 1 || value > sourceIds.length) return value;
    const index = targetIndex.get(sourceIds[value - 1]);
    if (index === undefined) throw new Error(`存档使用的电压已移除：${sourceIds[value - 1]}`);
    return index + 1;
  };
  const amounts = <T>(values: T[] | undefined, empty: T): T[] => targetIds.map((id) => {
    const index = sourceIndex.get(id);
    return index === undefined || !Array.isArray(values) ? empty : values[index] ?? empty;
  });
  const maxTier = tier(data.maxTier);
  const veins = (Array.isArray(data.unlockedVeins) ? data.unlockedVeins : [])
    .filter((index) => Number.isInteger(index) && index >= 0 && index < sourceIds.length)
    .map((index) => tier(index + 1) - 1);
  targetIds.forEach((id, index) => {
    if (index < maxTier && !sourceIndex.has(id)) veins.push(index);
  });
  const result: SaveData = {
    ...data,
    voltageIds: [...targetIds],
    maxTier,
    ores: amounts(data.ores, '0'),
    coins: amounts(data.coins, '0'),
    unlockedVeins: [...new Set(veins)].sort((a, b) => a - b),
  };
  if (data.peakTier !== undefined) result.peakTier = tier(data.peakTier);
  if (data.pickaxeVajra !== undefined) result.pickaxeVajra = tier(data.pickaxeVajra + 1) - 1;
  if (Array.isArray(data.miners)) result.miners = amounts(data.miners, 0);
  if (Array.isArray(data.generators)) result.generators = amounts(data.generators, 0);
  if (Array.isArray(data.machines)) result.machines = amounts(data.machines, 0);
  if (Array.isArray(data.researched)) result.researched = data.researched.map(tier);
  if (typeof data.researchTarget === 'number') result.researchTarget = tier(data.researchTarget);
  if (data.researchProgressByTier) {
    result.researchProgressByTier = Object.fromEntries(Object.entries(data.researchProgressByTier).map(([key, value]) => [tier(Number(key)), value]));
  }
  if (Array.isArray(data.runHistory)) {
    result.runHistory = data.runHistory.map((entry) => {
      if (typeof entry !== 'object' || entry === null || !('maxTier' in entry) || typeof entry.maxTier !== 'number') return entry;
      return { ...entry, maxTier: tier(entry.maxTier) };
    });
  }
  return result;
}
