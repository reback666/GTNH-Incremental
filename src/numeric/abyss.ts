// 深渊宇宙：污染即燃料（计划书第五章）。
//
// 规则：
//   污染把**全厂产出往上推** —— 30% 中性，每低 1 点 -1%、每高 1 点 +1%
//     （0% → 0.7 倍、70% → 1.4 倍、100% → 1.7 倍）。这条是深渊宇宙独有的，
//     奥术宇宙里污染仍然按普通规则惩罚产出；
//   代价是污染会腐蚀机器：污染越高，机器越容易坏（停机、要手动维护）；
//   「腐蚀抑制器」按等级抵消一部分污染点数，把损坏速率压回去。

import { Decimal, ONE, ZERO, dec, decInt, type DecimalInput } from './decimal';
import { assertTier } from './voltage';

// 污染的中性点：正好是「清洁 / 中度污染」的分界
export const POLLUTION_DRIVE_NEUTRAL = '30';
// 每偏离中性点 1 点，产出 ±1%
export const POLLUTION_DRIVE_PER_POINT = '0.01';

// 污染对全厂产出的倍率（只在深渊宇宙生效，替代普通宇宙那套 -20% / -40% 惩罚）
export function pollutionDriveFactor(pollution: DecimalInput): Decimal {
  const factor = ONE.plus(
    dec(pollution)
      .minus(POLLUTION_DRIVE_NEUTRAL)
      .times(POLLUTION_DRIVE_PER_POINT),
  );
  return Decimal.max(dec('0.01'), factor);
}

// 每台机器每秒因为「超出的污染点数」坏掉的概率
export const DAMAGE_PER_POINT_PER_SECOND = '0.000005';

// 一台抑制器每级抵消多少点污染（tier 3 的抑制器抵消 15 点）
export const SUPPRESSION_PER_TIER = '5';

// 抑制器抵消的污染点数
export function suppressionPoints(running: { tier: number; count: number }[]): Decimal {
  let points = ZERO;
  for (const item of running) {
    if (item.count <= 0) continue;
    points = points.plus(decInt(item.tier, 'tier').times(SUPPRESSION_PER_TIER).times(item.count));
  }
  return points;
}

// 这一拍每台机器坏掉的概率：只算「超出中性点、又没被抑制器抵消掉」的那部分污染
export function corrosionPerSecond(pollution: DecimalInput, suppression: DecimalInput): Decimal {
  const effective = Decimal.max(ZERO, dec(pollution).minus(30).minus(dec(suppression)));
  return effective.times(DAMAGE_PER_POINT_PER_SECOND);
}

export function suppressionOfTier(tier: number): Decimal {
  assertTier(tier);
  return decInt(tier, 'tier').times(SUPPRESSION_PER_TIER);
}
