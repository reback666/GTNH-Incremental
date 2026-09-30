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

export type VoltageName = (typeof VOLTAGE_TIERS)[number];

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

// tier（1..14）→ 名称，例如 1 → 'ULV'，14 → 'MAX'。
export function voltageName(tier: number): VoltageName {
  assertTier(tier);
  return VOLTAGE_TIERS[tier - 1];
}

// 名称 → tier（1..14），未收录的名称抛错。
export function tierOf(name: string): number {
  const index = VOLTAGE_TIERS.indexOf(name as VoltageName);
  if (index < 0) {
    throw new RangeError(`未知电压等级：${name}`);
  }
  return index + 1;
}

// 该电压等级的倍数：4^(tier-1)，ULV 为 1。
export function voltageMultiplier(tier: number): Decimal {
  assertTier(tier);
  return pow(String(VOLTAGE_STEP), tier - 1);
}

// 相邻两级之间的倍数，等价于 4^(tierTo - tierFrom)。
export function tierGapMultiplier(tierFrom: number, tierTo: number): Decimal {
  assertTier(tierFrom, 'tierFrom');
  assertTier(tierTo, 'tierTo');
  return pow(String(VOLTAGE_STEP), tierTo - tierFrom);
}

// 供 UI / 日志使用的只读视图，避免调用方再次手写 4^(tier-1)。
export function voltageTable(): Array<{ tier: number; name: VoltageName; multiplier: Decimal }> {
  return VOLTAGE_TIERS.map((name, index) => ({
    tier: index + 1,
    name,
    multiplier: voltageMultiplier(index + 1),
  }));
}

