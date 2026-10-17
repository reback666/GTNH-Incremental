import { Decimal, ZERO, dec, pow, type DecimalInput } from './decimal';
import { assertTier } from './voltage';
import { CONTENT, tierOf } from '../content';

// 算力与研究进度（计划书第七章资源四、第十一章「研究解锁」）。
//
// 这条链是「电 → 算力 → 研究进度」：
//   计算机消耗 EU 产出算力；
//   研究站吃掉算力推进研究进度；
//   进度满才解锁 ZPM 及以后的机型。
//
// 算力是**流量**，和 EU 一样不能囤积：产出来当拍不用掉就浪费掉。
// 算力不占存档里的存量，只需要记研究进度和已经研究出来的等级。

// 计算机与研究站从 LuV（tier 7）起开放。
export const RESEARCH_FROM_TIER = tierOf(CONTENT.rules.researchVoltage);
// ZPM（tier 8）及以后的机型要先研究出来。
export const RESEARCH_GATE_FROM_TIER = tierOf(CONTENT.rules.researchGateVoltage);

// 每级 ×4，与其他资源同倍率。
export const COMPUTE_STEP = CONTENT.rules.computeStep;

// 一台 LuV 计算机每秒产出 1 算力（暂定值）。
export const COMPUTE_PER_SECOND_AT_LUV = '1';
// 一台 LuV 计算机的耗电 = 本级 1A，与制造机同口径（暂定值）。
export const COMPUTER_ENERGY_AT_LUV = '8';

// 解锁 ZPM 需要 1000 点研究进度，每级 ×4（暂定值）。
// 同级一台计算机 + 一台研究站是 1 进度/秒 ≈ 16.7 分钟，
// 多建几组按台数线性加速，不会变成硬等。
export const RESEARCH_REQUIRED_AT_ZPM = '1000';

// 计算机的算力产量（算力/秒）：LuV 1，每级 ×4。
export function computerComputePerSecond(tier: number): Decimal {
  assertTier(tier, 'tier');
  if (tier < RESEARCH_FROM_TIER) return ZERO;
  return dec(COMPUTE_PER_SECOND_AT_LUV).times(pow(String(COMPUTE_STEP), tier - RESEARCH_FROM_TIER));
}

// 计算机的耗电（EU/t）：与制造机同口径，即本级 1A。
export function computerEnergyEU(tier: number): Decimal {
  assertTier(tier, 'tier');
  if (tier < RESEARCH_FROM_TIER) return ZERO;
  return dec(COMPUTER_ENERGY_AT_LUV).times(pow(String(COMPUTE_STEP), tier - 1));
}

// 研究站能吃掉的算力上限（算力/秒）。与同级的计算机产量相同 ——
// 一台同级研究站刚好吃掉一台同级计算机的算力，想研究快就再配一组。
export function labComputeThroughput(tier: number): Decimal {
  return computerComputePerSecond(tier);
}

// 解锁某一级机型需要的研究进度。
export function researchRequired(tier: number): Decimal {
  assertTier(tier, 'tier');
  if (tier < RESEARCH_GATE_FROM_TIER) return ZERO;
  return dec(RESEARCH_REQUIRED_AT_ZPM).times(pow(String(COMPUTE_STEP), tier - RESEARCH_GATE_FROM_TIER));
}

// 这一级的机型要不要先研究（ZPM 及以后要）。
export function needsResearch(tier: number): boolean {
  assertTier(tier, 'tier');
  return tier >= RESEARCH_GATE_FROM_TIER;
}

export interface ComputeSettlement {
  // 实际被研究站吃掉的算力
  used: Decimal;
  // 没用掉、直接浪费的算力
  wasted: Decimal;
  // 算力不够、研究站空等的那部分吞吐
  shortfall: Decimal;
}

// 算力不存储：当拍产多少就用多少，用不掉即浪费。
export function settleCompute(produced: DecimalInput, demand: DecimalInput): ComputeSettlement {
  const supply = Decimal.max(ZERO, dec(produced));
  const need = Decimal.max(ZERO, dec(demand));
  const used = Decimal.min(supply, need);
  return {
    used,
    wasted: supply.minus(used),
    shortfall: need.minus(used),
  };
}

// 研究进度增量：1 算力/秒 = 1 进度/秒。
export function researchGain(computeUsed: DecimalInput, dtSeconds: number): Decimal {
  return dec(computeUsed).times(dec(String(dtSeconds)));
}

// 进度还差多少、大概还要多久（按当前算力供给估）。
export function researchRemaining(progress: DecimalInput, required: DecimalInput): Decimal {
  return Decimal.max(ZERO, dec(required).minus(dec(progress)));
}
