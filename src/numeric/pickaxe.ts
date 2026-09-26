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

// 三条线各自能拿到的总机会数（随最高电压等级增长）。
// 金刚杵从 LV 才开始给：开局本来就能挖 T0 矿脉，第一次升级对应的是 LV（挖 T1）。
// 所以它在 ULV 时是 0 次，到 MAX 正好 13 次，和第 13 级矿脉的封顶严丝合缝。
export function vajraChances(maxTier: number): number {
  return Math.max(0, maxTier - 1) * VAJRA_CHANCES_PER_TIER;
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

// 这条线一共能升多少次（分母用满级时的机会总数，不跟着当前电压变）
export function pickaxeTotalChances(line: PickaxeLine): number {
  if (line === 'vajra') return vajraMaxLevel();
  if (line === 'collect') return collectChances(MAX_TIER);
  return blastChances(MAX_TIER);
}

// 图标配色按「这条线升了多少次 ÷ 一共能升多少次」取，每升一级都往前挪：
//   金刚杵 13 次走完 14 档（一级一档）、连锁采集 7 次走完 14 档（一级约两档）、
//   连锁爆破 28 次走完 14 档（两左右一档）。
// 分母必须用总次数，不能用「当前电压给的机会数」—— 后者在前期很小
// （ULV 时金刚杵只有 1 次），升一次就是 100%，会直接跳成 MAX 的彩虹色。
export function pickaxeIconTier(line: PickaxeLine, level: number): number {
  const total = pickaxeTotalChances(line);
  if (total <= 0 || level <= 0) return 1;
  const ratio = Math.min(1, level / total);
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
