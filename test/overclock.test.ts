import { describe, expect, it } from 'vitest';
import {
  MAX_OVERCLOCK_LEVEL,
  MIN_OVERCLOCK_LEVEL,
  overclockEnergyMultiplier,
  overclockEnergyPerOutput,
  overclockLevels,
  overclockSpeedMultiplier,
} from '../src/numeric/overclock';

describe('超频', () => {
  it('档位范围 0-3', () => {
    expect(MIN_OVERCLOCK_LEVEL).toBe(0);
    expect(MAX_OVERCLOCK_LEVEL).toBe(3);
    expect(overclockLevels()).toEqual([0, 1, 2, 3]);
  });

  it('速度倍率 = 2^档位，对应 1 / 2 / 4 / 8 倍', () => {
    expect(overclockSpeedMultiplier(0).toString()).toBe('1');
    expect(overclockSpeedMultiplier(1).toString()).toBe('2');
    expect(overclockSpeedMultiplier(2).toString()).toBe('4');
    expect(overclockSpeedMultiplier(3).toString()).toBe('8');
  });

  it('能耗倍率 = 4^档位，对应 1 / 4 / 16 / 64 倍', () => {
    expect(overclockEnergyMultiplier(0).toString()).toBe('1');
    expect(overclockEnergyMultiplier(1).toString()).toBe('4');
    expect(overclockEnergyMultiplier(2).toString()).toBe('16');
    expect(overclockEnergyMultiplier(3).toString()).toBe('64');
  });

  it('每单位产出的能耗 = 2^档位，每提一档效率减半', () => {
    expect(overclockEnergyPerOutput(0).toString()).toBe('1');
    expect(overclockEnergyPerOutput(1).toString()).toBe('2');
    expect(overclockEnergyPerOutput(2).toString()).toBe('4');
    expect(overclockEnergyPerOutput(3).toString()).toBe('8');
  });

  it('越界档位直接报错', () => {
    expect(() => overclockSpeedMultiplier(-1)).toThrow(RangeError);
    expect(() => overclockSpeedMultiplier(4)).toThrow(RangeError);
    expect(() => overclockEnergyMultiplier(1.5)).toThrow(RangeError);
  });
});
