import { describe, expect, it } from 'vitest';
import {
  MAX_TIER,
  MIN_TIER,
  VOLTAGE_TIERS,
  tierGapMultiplier,
  tierOf,
  voltageMultiplier,
  voltageName,
  voltageTable,
} from '../src/numeric/voltage';

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

  it('tier 索引与名称互相对应', () => {
    expect(voltageName(1)).toBe('ULV');
    expect(voltageName(5)).toBe('EV');
    expect(voltageName(14)).toBe('MAX');
    expect(tierOf('ULV')).toBe(1);
    expect(tierOf('MAX')).toBe(14);
    expect(() => tierOf('XXX')).toThrow(RangeError);
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

  it('跨级倍数等价于 4^(跨度)', () => {
    expect(tierGapMultiplier(1, 14).toString()).toBe('67108864');
    expect(tierGapMultiplier(5, 13).toString()).toBe('65536');
    expect(tierGapMultiplier(6, 6).toString()).toBe('1');
  });

  it('越界 tier 直接报错', () => {
    expect(() => voltageMultiplier(0)).toThrow(RangeError);
    expect(() => voltageMultiplier(15)).toThrow(RangeError);
    expect(() => voltageName(2.5)).toThrow(RangeError);
  });

  it('voltageTable 与逐个换算一致', () => {
    const table = voltageTable();
    expect(table.map((row) => row.name)).toEqual([...VOLTAGE_TIERS]);
    table.forEach((row) => {
      expect(row.multiplier.eq(voltageMultiplier(row.tier))).toBe(true);
    });
  });
});
