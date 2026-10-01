import { Decimal, pow } from './decimal';

// 计划书第二章：14 个电压等级，每一级电压为前一级的 4 倍。
export const VOLTAGE_TIERS = [
  'ULV',
  'LV',
  'MV',
  'HV',
  'EV',
  'IV',
  'LuV',
  'ZPM',
  'UV',
  'UHV',
  'UEV',
  'UIV',
  'UXV',
  'MAX',
] as const;

// tier 索引为 1..14（ULV=1，MAX=14），对外统一使用该索引。
export const MIN_TIER = 1;
export const MAX_TIER = VOLTAGE_TIERS.length;

// 相邻电压等级的倍数。
export const VOLTAGE_STEP = 4;

export function isValidTier(tier: number): boolean {
  return Number.isInteger(tier) && tier >= MIN_TIER && tier <= MAX_TIER;
}

export function assertTier(tier: number, label = 'tier'): void {
  if (!isValidTier(tier)) {
    throw new RangeError(`${label} 必须是 ${MIN_TIER}..${MAX_TIER} 的整数，收到 ${tier}`);
  }
}

// 该电压等级的倍数：4^(tier-1)，ULV 为 1。
export function voltageMultiplier(tier: number): Decimal {
  assertTier(tier);
  return pow(String(VOLTAGE_STEP), tier - 1);
}

