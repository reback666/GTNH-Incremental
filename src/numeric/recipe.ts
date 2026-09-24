import { assertTier } from './voltage';

// 计划书第八章：机器只能跑电压等级不高于自己的配方。
// 高级机器跑低级配方时不额外加速，也不额外耗电——产出与能耗只由机器自身等级和超频档位决定。
// 升压机制（第五章，转生解锁）可以绕过这个限制。
export function canRunRecipe(voltageTier: number, recipeTier: number): boolean {
  assertTier(voltageTier, 'voltageTier');
  assertTier(recipeTier, 'recipeTier');
  return voltageTier >= recipeTier;
}
