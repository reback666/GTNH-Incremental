import { Decimal, pow } from './decimal';

// 计划书第二章 / 第六章：超频分 4 个档位，0-3 档。
export const MIN_OVERCLOCK_LEVEL = 0;
export const MAX_OVERCLOCK_LEVEL = 3;

// 每提升一档：耗电 ×4、速度 ×2。
export const OVERCLOCK_SPEED_FACTOR = 2;
export const OVERCLOCK_ENERGY_FACTOR = 4;

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

// 超频倍率 = 2^档位：0-3 档对应速度 1 / 2 / 4 / 8 倍。
export function overclockSpeedMultiplier(level: number): Decimal {
  assertOverclockLevel(level);
  return pow(String(OVERCLOCK_SPEED_FACTOR), level);
}

// 能耗倍率 = 4^档位：0-3 档对应耗电 1 / 4 / 16 / 64 倍。
export function overclockEnergyMultiplier(level: number): Decimal {
  assertOverclockLevel(level);
  return pow(String(OVERCLOCK_ENERGY_FACTOR), level);
}

// 该档位下每单位产出的相对能耗，便于比较「加速是否划算」。
// 4^档位 ÷ 2^档位 = 2^档位，即每提一档，单位产出的电力成本翻倍。
export function overclockEnergyPerOutput(level: number): Decimal {
  return overclockEnergyMultiplier(level).div(overclockSpeedMultiplier(level));
}

export function overclockLevels(): number[] {
  return Array.from(
    { length: MAX_OVERCLOCK_LEVEL - MIN_OVERCLOCK_LEVEL + 1 },
    (_, index) => MIN_OVERCLOCK_LEVEL + index,
  );
}
