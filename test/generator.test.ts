import { describe, expect, it } from 'vitest';
import {
  generatorFuelEfficiency,
  generatorFuelRate,
  generatorOutputEU,
  oreEnergyValue,
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
    // LV 机：32 EU/t，T1 矿石 512 EU，效率 85% -> 32 / 435.2 枚/秒
    expect(generatorFuelRate(2).toSignificantDigits(6).toString()).toBe('0.0735294');
  });

  it('矿石能量值与输出同比递增，烧矿速率只由燃料效率决定', () => {
    expect(oreEnergyValue(1).toString()).toBe('128');
    expect(oreEnergyValue(2).toString()).toBe('512');
    expect(oreEnergyValue(3).toString()).toBe('2048');
    // ULV 与 LV 同为 85% 效率，速率一致
    expect(generatorFuelRate(1).toSignificantDigits(6).toString()).toBe(
      generatorFuelRate(2).toSignificantDigits(6).toString(),
    );
    // 效率更低的等级烧得更快
    expect(generatorFuelRate(5).gt(generatorFuelRate(2))).toBe(true);
    expect(generatorFuelRate(5).toSignificantDigits(6).toString()).toBe('0.0961538');
  });

  it('越界等级直接报错', () => {
    expect(() => generatorOutputEU(0)).toThrow(RangeError);
    expect(() => generatorOutputEU(15)).toThrow(RangeError);
    expect(() => generatorFuelEfficiency(99)).toThrow(RangeError);
    expect(() => oreEnergyValue(0)).toThrow(RangeError);
  });
});
