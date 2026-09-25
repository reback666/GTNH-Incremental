import { Decimal, ONE, ZERO, dec, pow, type DecimalInput } from './decimal';
import { assertTier } from './voltage';

// 奥术宇宙：灵气与源质（计划书第五章）。
//
// 规则：
//   灵气节点从矿脉抽灵气 —— 灵气是**流量**，不能囤积，存电装置对它无效；
//   机器改吃灵气而不是电，所以这一轮的电力系统整体让位给灵气；
//   代价：全厂产量 -50%；好处：超频不再引发故障；
//   源质：净化器把污染压下去的同时凝出源质，源质喂给灵气节点能把它喂满 ——
//         没有源质时节点只出 50%，所以「先攒净化器」是这个宇宙的起手式。

// 机器产量在奥术宇宙里的倍率
export const ARCANE_OUTPUT_FACTOR = '0.5';

// 一台灵气节点的灵气产量：与同级发电机同强度（8 × 4^(tier-1) 灵气/秒）
export const NODE_VIS_AT_ULV = '8';
export const VIS_TIER_FACTOR = 4;

// 一台节点满负荷每秒吃多少源质
export const NODE_ESSENTIA_PER_SECOND = '1';

// 净化器每压下去 1% 污染（每秒），凝出这么多源质
export const ESSENTIA_PER_PURIFY_PERCENT = '1000';

// 没有源质时节点仍有 50% 出力，剩下的 50% 靠源质喂满
export const NODE_OUTPUT_WITHOUT_ESSENTIA = '0.5';

// 灵气节点产量（灵气/秒）
export function nodeVisPerSecond(tier: number): Decimal {
  assertTier(tier);
  return dec(NODE_VIS_AT_ULV).times(pow(String(VIS_TIER_FACTOR), tier - 1));
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
