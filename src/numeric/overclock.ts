import { Decimal, ONE, dec, decInt, pow } from './decimal';

// 计划书第二章 / 第六章：超频分 4 个档位，0-3 档。
export const MIN_OVERCLOCK_LEVEL = 0;
export const MAX_OVERCLOCK_LEVEL = 3;

// 每档额外 60% 速度：0-3 档对应 100% / 160% / 220% / 280%。
export const OVERCLOCK_SPEED_PER_LEVEL = '0.6';

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

// 超频倍率 = 1 + 0.6 × 档位。
export function overclockSpeedMultiplier(level: number): Decimal {
  assertOverclockLevel(level);
  return ONE.plus(dec(OVERCLOCK_SPEED_PER_LEVEL).times(decInt(level, '超频档位')));
}

// 能耗 = 2^档位。
export function overclockEnergyMultiplier(level: number): Decimal {
  assertOverclockLevel(level);
  return pow('2', level);
}

// 该档位下每单位产出的相对能耗，便于比较「加速是否划算」。
export function overclockEnergyPerOutput(level: number): Decimal {
  return overclockEnergyMultiplier(level).div(overclockSpeedMultiplier(level));
}

export function overclockLevels(): number[] {
  return Array.from(
    { length: MAX_OVERCLOCK_LEVEL - MIN_OVERCLOCK_LEVEL + 1 },
    (_, index) => MIN_OVERCLOCK_LEVEL + index,
  );
}
