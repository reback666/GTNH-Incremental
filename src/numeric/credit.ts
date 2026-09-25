import { Decimal, ONE, ZERO, dec, pow, type DecimalInput } from './decimal';
import { assertTier } from './voltage';

// 计划书第七章：GT 币共 14 种，与电压等级一一对应，4 合 1 向上合成。
export const COIN_FACTOR = 4;

// 币种名称。前 8 种沿用既有体系；后 6 种（UV 及以后）沿用矿脉材料的名字，
// MAX 用「普朗克币」呼应计划书里的普朗克电路。
export const COIN_NAMES = [
  '铜币',
  '白铜币',
  '银币',
  '金币',
  '铂币',
  '锇币',
  '硅岩币',
  '中子素币',
  '宇宙中子素币',
  '无尽币',
  '龙芯币',
  '海珀珍币',
  '时空币',
  '普朗克币',
] as const;

// 矿石名称。计划书只定义了等级，没有命名。
export const ORE_NAMES = Array.from({ length: 14 }, (_, index) => `T${index} 矿石`);

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

// 把一堆 4 合 1 的币按最高等级规整，返回每一级的枚数（低位一律不足 4 枚）。
// 计划书第七章要求「4 合 1 自动向上合成」，这里给出规整结果供界面展示。
export function normalizeCoins(totalValueInTier1: DecimalInput, maxTier: number): Decimal[] {
  assertTier(maxTier, 'maxTier');
  let remaining = dec(totalValueInTier1).floor();
  const stacks: Decimal[] = new Array(maxTier).fill(null).map(() => ZERO);
  for (let tier = maxTier; tier >= 1; tier -= 1) {
    const unit = coinValueInTier1(tier);
    const count = remaining.div(unit).floor();
    stacks[tier - 1] = count;
    remaining = remaining.minus(count.times(unit));
  }
  return stacks;
}

// 该等级币的显示名。
export function coinName(tier: number): string {
  assertTier(tier, 'tier');
  return COIN_NAMES[tier - 1] ?? `T${tier - 1} 币`;
}

// 该等级矿石的显示名。
export function oreName(oreTier: number): string {
  return ORE_NAMES[oreTier] ?? `T${oreTier} 矿石`;
}

export { ONE };
