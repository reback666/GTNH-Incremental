import { Decimal, ONE, dec, decInt, pow } from './decimal';

// 计划书第二章 / 第六章：超频分 4 个档位，0-3 档。
export const MIN_OVERCLOCK_LEVEL = 0;
export const MAX_OVERCLOCK_LEVEL = 3;

// 每提升一档：速度 +60%，耗电翻倍。
export const OVERCLOCK_SPEED_PER_LEVEL = '0.6';
export const OVERCLOCK_ENERGY_FACTOR = 2;

export function isValidOverclockLevel(level: number): boolean {
  return Number.isInteger(level) && level >= MIN_OVERCLOCK_LEVEL && level <= MAX_OVERCLOCK_LEVEL;
}

export function assertOverclockLevel(level: number): void {
  if (!isValidOverclockLevel(level)) {
    throw new RangeError(
      `超频档位必须是 ${MIN_OVERCLOCK_LEVEL}..${MAX_OVERCLOCK_LEVEL} 的整数，收到 ${level}`,
    );
  }
}

// 超频倍率 = 1 + 0.6 × 档位：0-3 档对应 100% / 160% / 220% / 280%。
export function overclockSpeedMultiplier(level: number): Decimal {
  assertOverclockLevel(level);
  return ONE.plus(dec(OVERCLOCK_SPEED_PER_LEVEL).times(decInt(level, '超频档位')));
}

// 能耗倍率 = 2^档位：0-3 档对应耗电 1 / 2 / 4 / 8 倍。
export function overclockEnergyMultiplier(level: number): Decimal {
  assertOverclockLevel(level);
  return pow(String(OVERCLOCK_ENERGY_FACTOR), level);
}
