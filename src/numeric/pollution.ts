// 污染（计划书第六章）：0-100% 的环境风险。
//
// 污染是玩家自己扩产带来的：机器越多、电压越高，涨得越快。
// 三档效果：<30% 无影响；30-70% 产出 -20% 但可能"变异"爆一笔；>70% 产出 -40%
// 且每 10 分钟有 10% 概率"工厂崩溃"，随机摧毁一台机器。
// 净化器可以往下压；设置里可以整套关掉（关掉后不涨、也不产生任何影响）。
import { Decimal, ZERO, dec, decInt } from './decimal';

export const POLLUTION_MAX = '100';
export const POLLUTION_LOW = '30'; // 低于它无影响
export const POLLUTION_HIGH = '70'; // 高于它进崩溃区

// 每台运行中的机器每秒贡献：电压等级 × 这个系数（百分点）
// 50 台 MV（3 级）= 0.12 %/秒 ≈ 7%/分钟；50 台 MAX（14 级）≈ 34%/分钟
export const POLLUTION_PER_TIER_PER_SECOND = '0.0008';

// 净化器每台每秒压下去的百分点：电压等级 × 这个系数。
// 取 0.0024 是污染增长（0.0008）的 3 倍 —— 一台净化器刚好压得住 3 台同级机器，
// 也就是「每 3 台机器配 1 台净化器」。
export const PURIFY_PER_TIER_PER_SECOND = '0.0024';

// 30-70% 区间：每 60 秒判定一次，这个概率爆一笔"变异"奖励
export const MUTATION_CHANCE_PER_MINUTE = 0.2;
// 变异奖励 = 当前每秒产币 × 这个秒数
export const MUTATION_REWARD_SECONDS = '30';

// >70% 区间：每 600 秒判定一次，这个概率工厂崩溃
export const COLLAPSE_CHANCE_PER_10_MINUTES = 0.1;

export type PollutionBand = 'clean' | 'mutating' | 'critical';

export function clampPollution(value: Decimal): Decimal {
  return Decimal.max(ZERO, Decimal.min(dec(POLLUTION_MAX), value));
}

export function pollutionBand(value: Decimal): PollutionBand {
  if (value.gte(POLLUTION_HIGH)) return 'critical';
  if (value.gte(POLLUTION_LOW)) return 'mutating';
  return 'clean';
}

// 产出惩罚：无影响 / -20% / -40%
export function pollutionOutputMultiplier(value: Decimal): Decimal {
  const band = pollutionBand(value);
  if (band === 'critical') return dec('0.6');
  if (band === 'mutating') return dec('0.8');
  return dec('1');
}

export function pollutionBandName(value: Decimal): string {
  const band = pollutionBand(value);
  if (band === 'critical') return '重度污染：产出 -40%，随时可能工厂崩溃';
  if (band === 'mutating') return '中度污染：产出 -20%，偶发变异奖励';
  return '清洁：无影响';
}

// 一串机器每秒产生的污染（百分点/秒）
export function pollutionPerSecond(running: { tier: number; count: number }[]): Decimal {
  let units = ZERO;
  for (const item of running) {
    if (item.count <= 0) continue;
    units = units.plus(decInt(item.tier, 'tier').times(item.count));
  }
  return units.times(POLLUTION_PER_TIER_PER_SECOND);
}

// 净化器每秒压下去的污染（百分点/秒）
export function purifyPerSecond(running: { tier: number; count: number }[]): Decimal {
  let units = ZERO;
  for (const item of running) {
    if (item.count <= 0) continue;
    units = units.plus(decInt(item.tier, 'tier').times(item.count));
  }
  return units.times(PURIFY_PER_TIER_PER_SECOND);
}

// 一台净化器能压住几台同级机器的污染 —— 污染与净化都按「等级 × 台数」线性算，
// 所以这个比值与等级无关，界面上用它来说明净化器的效果更直观。
export function purifierMachineCoverage(): Decimal {
  return dec(PURIFY_PER_TIER_PER_SECOND).div(POLLUTION_PER_TIER_PER_SECOND);
}
