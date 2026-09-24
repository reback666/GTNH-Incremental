import { Decimal, ONE, decInt } from './decimal';
import { assertTier } from './voltage';

// 电压等级低于配方等级时，机器根本跑不了该配方。
export function canRunRecipe(voltageTier: number, recipeTier: number): boolean {
  assertTier(voltageTier, 'voltageTier');
  assertTier(recipeTier, 'recipeTier');
  return voltageTier >= recipeTier;
}

// 并行倍率 = 电压等级 - 配方等级 + 1，仅当电压 ≥ 配方等级时生效。
// 电压不足时返回 1（配方本身也跑不起来）。
// maxParallel 为可选上限（对应自定义机器定义里的 maxParallel 字段）。
export function parallelMultiplier(
  voltageTier: number,
  recipeTier: number,
  maxParallel?: number,
): Decimal {
  assertTier(voltageTier, 'voltageTier');
  assertTier(recipeTier, 'recipeTier');
  if (maxParallel !== undefined && (!Number.isInteger(maxParallel) || maxParallel < 1)) {
    throw new RangeError(`并行上限必须是正整数，收到 ${maxParallel}`);
  }
  if (!canRunRecipe(voltageTier, recipeTier)) {
    return ONE;
  }
  const full = decInt(voltageTier - recipeTier + 1, '并行倍率');
  return maxParallel === undefined ? full : Decimal.min(full, decInt(maxParallel, '并行上限'));
}
