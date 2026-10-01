import { describe, expect, it } from 'vitest';
import { MAX_TIER, MIN_TIER, VOLTAGE_TIERS, voltageMultiplier } from '../src/numeric/voltage';

describe('电压体系', () => {
  it('共 14 级，顺序为 ULV→…→MAX', () => {
    expect(VOLTAGE_TIERS.length).toBe(14);
    expect(MIN_TIER).toBe(1);
    expect(MAX_TIER).toBe(14);
    expect(VOLTAGE_TIERS).toEqual([
      'ULV',
      'LV',
      'MV',
      'HV',
      'EV',
      'IV',
      'LuV',
      'ZPM',
      'UV',
      'UHV',
      'UEV',
      'UIV',
      'UXV',
      'MAX',
    ]);
  });

  it('倍数为 4^(tier-1)', () => {
    expect(voltageMultiplier(1).toString()).toBe('1');
    expect(voltageMultiplier(2).toString()).toBe('4');
    expect(voltageMultiplier(5).toString()).toBe('256');
    expect(voltageMultiplier(14).toString()).toBe('67108864');
  });

  it('每一级恰好是前一级的 4 倍', () => {
    for (let tier = 2; tier <= MAX_TIER; tier += 1) {
      expect(voltageMultiplier(tier).div(voltageMultiplier(tier - 1)).toString()).toBe('4');
    }
  });

  it('越界 tier 直接报错', () => {
    expect(() => voltageMultiplier(0)).toThrow(RangeError);
    expect(() => voltageMultiplier(15)).toThrow(RangeError);
  });
});
