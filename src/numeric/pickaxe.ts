import { Decimal, dec, decInt, pow, powFraction } from './decimal';
import { MAX_TIER, assertTier } from './voltage';

// 镐子的三条升级线。升级机会全部由电压等级发放，不花币：
//
//   金刚杵   每解锁 1 个电压给 1 次 → 每次让镐子多挖一级矿脉
//   连锁采集 每 2 个电压给 1 次     → 每次让一次点击的产出 ×2（结算在连锁爆破之后）
//   连锁爆破 每个电压给 2 次        → 每次 +n^(n/2)，n = 当前最高电压等级
//
// 连锁爆破的加值按「当前最高电压」算，不按领取时的电压算：
// 后者会变成「攒着到 MAX 再点」的最优解，前期镐子等于没有成长。

// 一次点击的底数（枚）。所有升级效果都叠在它上面。
export const PICKAXE_BASE_OUTPUT = '1';

export const VAJRA_CHANCES_PER_TIER = 1;
export const COLLECT_TIERS_PER_CHANCE = 2;
export const COLLECT_MULTIPLIER = 2;
export const BLAST_CHANCES_PER_TIER = 2;

export type PickaxeLine = 'vajra' | 'collect' | 'blast';

// 金刚杵能挖到的矿脉等级上限：等级 n 的采矿机采 T(n-1) 矿脉，
// 所以最高一档采矿机采的是 T(MAX_TIER-1)，镐子最多也就挖到这里。
export function vajraMaxLevel(): number {
  return MAX_TIER - 1;
}

// 三条线各自能拿到的总机会数（随最高电压等级增长）
export function vajraChances(maxTier: number): number {
  return maxTier * VAJRA_CHANCES_PER_TIER;
}

export function collectChances(maxTier: number): number {
  return Math.floor(maxTier / COLLECT_TIERS_PER_CHANCE);
}

export function blastChances(maxTier: number): number {
  return maxTier * BLAST_CHANCES_PER_TIER;
}

// 连锁爆破每次机会的加值：n^(n/2)
export function blastBonusPerUpgrade(tier: number): Decimal {
  assertTier(tier);
  return powFraction(decInt(tier, 'tier'), tier, 2);
}

// 连锁爆破的总加值 = 已用机会数 × 当前等级的加值
export function blastBonus(tier: number, used: number): Decimal {
  if (used <= 0) return dec('0');
  return blastBonusPerUpgrade(tier).times(used);
}

export function collectMultiplier(level: number): Decimal {
  if (level <= 0) return dec('1');
  return pow(String(COLLECT_MULTIPLIER), level);
}

// 把「这条线走到第几级」映射成 14 档电压配色：0 级是全空时的 ULV 色，满级是 MAX 的彩虹。
// 三条线的机会数不同（13 / 7 / 28），所以各自按进度比例取色，界面上能直接看出哪条线走得更远。
export function pickaxeIconTier(level: number, cap: number): number {
  if (cap <= 0) return 1;
  const ratio = Math.min(1, Math.max(0, level / cap));
  return 1 + Math.floor(ratio * (MAX_TIER - 1));
}

// 一次点击的产出总量（枚），按矿脉规则分给各矿种。
// 先算连锁爆破的加法，再乘连锁采集的倍率。
export function pickaxeOutputPerClick(input: {
  tier: number;
  blastUsed: number;
  collectLevel: number;
}): Decimal {
  return dec(PICKAXE_BASE_OUTPUT)
    .plus(blastBonus(input.tier, input.blastUsed))
    .times(collectMultiplier(input.collectLevel));
}
