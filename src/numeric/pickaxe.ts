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

// 连锁爆破每次机会的加值：2^(n/2)，n 是这次机会产生时的电压等级。
// 底数取 2 而不是 n：n^(n/2) 长得太猛（MAX 一笔就是上亿），手点会直接盖过整条自动化产线。
export const BLAST_BASE = '2';

export function blastBonusPerUpgrade(tier: number): Decimal {
  assertTier(tier);
  return powFraction(BLAST_BASE, tier, 2);
}

// 第 index 次机会（从 0 数）是哪一级电压给的：每个电压给 2 次，所以 0/1 来自 ULV、2/3 来自 LV……
export function blastChanceTier(index: number): number {
  return Math.floor(index / BLAST_CHANCES_PER_TIER) + 1;
}

// 连锁爆破的总加值：把已用掉的机会按「产生时的电压」逐批加上去。
// 加值在机会产生的那一刻就定死了，后来升到多高电压都不会变 ——
// 所以攒到 MAX 再一口气点完，拿到的和逐级点掉完全一样。
export function blastBonus(tier: number, used: number): Decimal {
  let sum = dec('0');
  let remaining = Math.max(0, Math.floor(used));
  for (let t = 1; t <= tier && remaining > 0; t += 1) {
    const take = Math.min(remaining, BLAST_CHANCES_PER_TIER);
    sum = sum.plus(blastBonusPerUpgrade(t).times(take));
    remaining -= take;
  }
  return sum;
}

// 下一次升级（第 used+1 次机会）会加多少
export function blastNextBonus(tier: number, used: number): Decimal {
  const index = Math.max(0, Math.floor(used));
  return blastBonusPerUpgrade(Math.min(tier, blastChanceTier(index)));
}

export function collectMultiplier(level: number): Decimal {
  if (level <= 0) return dec('1');
  return pow(String(COLLECT_MULTIPLIER), level);
}

// 图标配色按「这条线走到了哪个电压时代」取，一格一格往上走：
//   金刚杵   每次机会来自一个电压，所以升一级就跳一档
//   连锁采集 每 2 个电压才给一次机会，升一级跳两档
//   连锁爆破 每个电压给两次机会，所以两才一级
// 不能按「走完多少比例」算 —— 前期机会总数很少（ULV 时金刚杵只有 1 次），
// 升一次就是 100%，会直接跳成 MAX 的彩虹色。
export function pickaxeIconTier(line: PickaxeLine, level: number): number {
  if (level <= 0) return 1;
  if (line === 'vajra') return Math.min(MAX_TIER, level + 1);
  if (line === 'collect') return Math.min(MAX_TIER, level * 2);
  return Math.min(MAX_TIER, Math.ceil(level / 2));
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
