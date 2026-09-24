import { describe, expect, it } from 'vitest';
import {
  generatorFuelEfficiency,
  generatorFuelRate,
  generatorOutputEU,
} from '../src/numeric/generator';

describe('发电机', () => {
  it('输出 = 4^(tier-1) × 8 EU/t，与 GTNH 的 LV 32 / MV 128 / HV 512 对齐', () => {
    expect(generatorOutputEU(1).toString()).toBe('8');
    expect(generatorOutputEU(2).toString()).toBe('32');
    expect(generatorOutputEU(3).toString()).toBe('128');
    expect(generatorOutputEU(4).toString()).toBe('512');
    expect(generatorOutputEU(14).toString()).toBe('536870912');
  });

  it('燃料效率按 GTNH 的表递减，EV 及以后取 65%', () => {
    expect(generatorFuelEfficiency(2).toString()).toBe('0.85');
    expect(generatorFuelEfficiency(3).toString()).toBe('0.75');
    expect(generatorFuelEfficiency(4).toString()).toBe('0.66');
    expect(generatorFuelEfficiency(5).toString()).toBe('0.65');
    expect(generatorFuelEfficiency(14).toString()).toBe('0.65');
  });

  it('燃料消耗速率 = 输出 ÷ (矿石能量值 × 效率)', () => {
    // LV 机：32 EU/t，单枚矿石 100 EU，效率 85% -> 32 / 85 = 0.376...枚/秒
    const rate = generatorFuelRate(2, '100');
    expect(rate.toSignificantDigits(6).toString()).toBe('0.376471');
  });

  it('越界等级直接报错', () => {
    expect(() => generatorOutputEU(0)).toThrow(RangeError);
    expect(() => generatorOutputEU(15)).toThrow(RangeError);
    expect(() => generatorFuelEfficiency(99)).toThrow(RangeError);
  });
});
