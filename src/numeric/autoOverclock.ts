import { Decimal, pow } from './decimal';
import { assertTier } from './voltage';

// 计划书第二章 / 第八章：电压高于配方等级的机器会自动超频到自身电压等级。
// 自动超频与手动超频用同一条换算规则——超频一次，耗电 ×4、速度 ×2。

// 电压等级低于配方等级时机器跑不了该配方。
// 升压机制（第五章，转生解锁）可以绕过这个限制。
export function canRunRecipe(voltageTier: number, recipeTier: number): boolean {
  assertTier(voltageTier, 'voltageTier');
  assertTier(recipeTier, 'recipeTier');
  return voltageTier >= recipeTier;
}

// 自动超频次数 = 电压等级 - 配方等级；电压不足时为 0。
export function autoOverclockSteps(voltageTier: number, recipeTier: number): number {
  assertTier(voltageTier, 'voltageTier');
  assertTier(recipeTier, 'recipeTier');
  return Math.max(0, voltageTier - recipeTier);
}

// 自动超频速度倍率 = 2^超频次数。
export function autoOverclockSpeedMultiplier(voltageTier: number, recipeTier: number): Decimal {
  return pow('2', autoOverclockSteps(voltageTier, recipeTier));
}

// 自动超频能耗倍率 = 4^超频次数。
export function autoOverclockEnergyMultiplier(voltageTier: number, recipeTier: number): Decimal {
  return pow('4', autoOverclockSteps(voltageTier, recipeTier));
}
