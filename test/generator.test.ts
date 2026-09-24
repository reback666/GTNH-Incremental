import { describe, expect, it } from 'vitest';
import {
  generatorFuelEfficiency,
  generatorFuelRate,
  generatorOutputEU,
  oreEnergyValue,
} from '../src/numeric/generator';
import { minerOrePerSecond } from '../src/numeric/miner';

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
    // LV 机：32 EU/t，T1 矿石 256 EU，效率 85% -> 32 / 217.6 枚/秒
    expect(generatorFuelRate(2).toSignificantDigits(6).toString()).toBe('0.147059');
  });

  it('矿石能量值每级 ×2', () => {
    expect(oreEnergyValue(1).toString()).toBe('128');
    expect(oreEnergyValue(2).toString()).toBe('256');
    expect(oreEnergyValue(3).toString()).toBe('512');
  });

  it('矿石能量 ×2 与采矿机提速 ×2 相乘为 4，采矿机与发电机的供需之比恒等于燃料效率', () => {
    // 烧矿速率随等级 ×2：输出 ×4，但矿石能量只 ×2
    expect(generatorFuelRate(2).div(generatorFuelRate(1)).toSignificantDigits(6).toString()).toBe('2');
    // 采矿机产矿也随等级 ×2，两者抵消，比例只剩燃料效率
    for (const tier of [1, 2, 3, 5, 9, 14]) {
      expect(minerOrePerSecond(tier).div(generatorFuelRate(tier)).toSignificantDigits(10).toString()).toBe(
        generatorFuelEfficiency(tier).toSignificantDigits(10).toString(),
      );
    }
  });

  it('越界等级直接报错', () => {
    expect(() => generatorOutputEU(0)).toThrow(RangeError);
    expect(() => generatorOutputEU(15)).toThrow(RangeError);
    expect(() => generatorFuelEfficiency(99)).toThrow(RangeError);
    expect(() => oreEnergyValue(0)).toThrow(RangeError);
  });
});
