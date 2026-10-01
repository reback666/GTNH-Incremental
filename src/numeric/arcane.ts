import { Decimal, ONE, ZERO, dec, pow, type DecimalInput } from './decimal';
import { assertTier } from './voltage';

// 奥术宇宙：灵气与源质（计划书第五章）。
//
// 规则：
//   灵气节点从矿脉抽灵气 —— 灵气是**流量**，不能囤积，存电装置对它无效；
//   魔法机器（LV~LuV 的采矿机 / 发电机 / 制造机）不吃电、改吃灵气，产能是同价电力版的 2.5 倍；
//   灵气喂得越满，全厂产量越高：普通机器最多 +10%，魔法机器最多 +30%；
//   源质：净化器把污染压下去的同时凝出源质，源质喂给灵气节点能把它喂满 ——
//         没有源质时节点只出 50%，所以「先攒净化器」是这个宇宙的起手式。

// 该等级的「本级 1A」：4^(tier-1) × 8。节点的产量与魔法机器的需求都按它算。
export const NODE_VIS_AT_ULV = '8';
export const VIS_TIER_FACTOR = 4;

// 一台节点满负荷每秒吃多少源质
export const NODE_ESSENTIA_PER_SECOND = '1';

// 净化器每压下去 1% 污染（每秒），凝出这么多源质
export const ESSENTIA_PER_PURIFY_PERCENT = '1000';

// 没有源质时节点仍有 50% 出力，剩下的 50% 靠源质喂满
export const NODE_OUTPUT_WITHOUT_ESSENTIA = '0.5';

// 灵气充裕度带来的产量加成上限：普通机器 +10%，魔法机器 +30%
export const ARCANE_BONUS_NORMAL = '0.1';
export const ARCANE_BONUS_MAGIC = '0.3';

// 该等级 1A 的灵气量（灵气/秒）
export function visPerMachine(tier: number): Decimal {
  assertTier(tier);
  return dec(NODE_VIS_AT_ULV).times(pow(String(VIS_TIER_FACTOR), tier - 1));
}

// 灵气节点产量（灵气/秒）：与同级发电机同强度，也就是该等级的 1A。
// 魔法制造机与魔法发电机各吃 1A，魔法采矿机只吃 1A 的 1/4（和它们的耗电关系一致）。
export function nodeVisPerSecond(tier: number): Decimal {
  return visPerMachine(tier);
}

// 灵气充裕度（0~1，= 喂得上的灵气 ÷ 魔法机器需要的灵气）→ 产量倍率。
// 没有魔法机器时不加成：奥术宇宙的收益得靠魔法机器自己挣。
// bonusUp：永久加成「奥术·充裕上限」把上限再抬高几个百分点。
export function arcaneOutputBonus(
  plenty: DecimalInput,
  magic: boolean,
  bonusUp: DecimalInput = ZERO,
): Decimal {
  const rate = dec(magic ? ARCANE_BONUS_MAGIC : ARCANE_BONUS_NORMAL).plus(dec(bonusUp));
  const ratio = Decimal.min(ONE, Decimal.max(ZERO, dec(plenty)));
  return ONE.plus(rate.times(ratio));
}

// 一批节点每秒需要的源质
export function nodeEssentiaDemand(nodes: DecimalInput): Decimal {
  return dec(nodes).times(NODE_ESSENTIA_PER_SECOND);
}

// 净化器每秒凝出的源质（净化速率单位是 %/秒）
export function essentiaFromPurify(purifyPercentPerSecond: DecimalInput): Decimal {
  return dec(purifyPercentPerSecond).times(ESSENTIA_PER_PURIFY_PERCENT);
}

// 节点出力倍率：源质够 = 1，完全没有 = 0.5，中间按比例
export function nodeOutputFactor(
  essentiaUsed: DecimalInput,
  essentiaDemand: DecimalInput,
): Decimal {
  const need = dec(essentiaDemand);
  if (need.lte(0)) return ONE;
  const ratio = Decimal.min(ONE, Decimal.max(ZERO, dec(essentiaUsed).div(need)));
  return dec(NODE_OUTPUT_WITHOUT_ESSENTIA).plus(
    ONE.minus(NODE_OUTPUT_WITHOUT_ESSENTIA).times(ratio),
  );
}
