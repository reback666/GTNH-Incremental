import { Decimal, ZERO, dec, decInt, type DecimalInput } from './decimal';
import { assertTier } from './voltage';

// 深渊宇宙：污染即燃料（计划书第五章）。
//
// 规则：
//   污染把产出**往上**推 —— 和奥术宇宙共用同一条倍率（30% 中性，每 1 点污染 ±1%），
//     两个宇宙同时拥有时只算一次，不叠加；
//   代价是污染会腐蚀机器：污染越高，机器越容易坏（停机、要手动维护）；
//   「腐蚀抑制器」按等级抵消一部分污染点数，把损坏速率压回去。

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
