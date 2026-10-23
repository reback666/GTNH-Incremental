import { Decimal, ONE, dec, pow, type DecimalInput } from './decimal';
import { assertTier } from './voltage';
import { CONTENT, VOLTAGES } from '../content';

// 计划书第七章：GT 币与电压等级一一对应，4 合 1 向上合成。
export const COIN_FACTOR = CONTENT.rules.coinStep;

// 币种名称。前 8 种沿用既有体系；UV 及以后沿用矿脉材料的名字，
// MAX 用「普朗克币」呼应计划书里的普朗克电路。
export const COIN_NAMES = VOLTAGES.map((voltage) => voltage.coin);

// 币值：1 枚 tier 级币 = 4^(tier-1) 枚 tier-1 币。
export function coinValueInTier1(tier: number): Decimal {
  assertTier(tier);
  return pow(String(COIN_FACTOR), tier - 1);
}

// 换算：把 amount 枚 fromTier 币折成 toTier 币的价值。
// 向高等级换是除法（4 合 1），向低等级换是乘法。
export function convertCoins(amount: DecimalInput, fromTier: number, toTier: number): Decimal {
  assertTier(fromTier, 'fromTier');
  assertTier(toTier, 'toTier');
  const value = dec(amount).times(coinValueInTier1(fromTier));
  return value.div(coinValueInTier1(toTier));
}

// 买 X 级机器消耗 X-1 级的币；ULV（tier 1）没有上一级，用自己那一级结算。
export function paymentTier(machineTier: number): number {
  assertTier(machineTier, 'machineTier');
  return Math.max(1, machineTier - 1);
}

// 该等级币的显示名。
export function coinName(tier: number): string {
  assertTier(tier, 'tier');
  return COIN_NAMES[tier - 1] ?? `T${tier - 1} 币`;
}

export { ONE };
