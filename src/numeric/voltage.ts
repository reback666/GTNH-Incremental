import { Decimal, pow } from './decimal';

import { CONTENT, VOLTAGES } from '../content';

export const VOLTAGE_TIERS = VOLTAGES.map((voltage) => voltage.name ?? voltage.id);
export const MIN_TIER = 1;
export const MAX_TIER = VOLTAGES.length;
export const VOLTAGE_STEP = CONTENT.rules.voltageStep;
export { tierOf } from '../content';

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

