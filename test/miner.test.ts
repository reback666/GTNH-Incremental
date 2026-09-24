import { describe, expect, it } from 'vitest';
import { minerEnergyEU, minerOrePerSecond, minerSecondsPerOre } from '../src/numeric/miner';

describe('采矿机', () => {
  it('耗电照搬 GTNH（LV 8、MV 32、HV 128 EU/t），耗时按作者定的每级 ÷4', () => {
    expect(minerEnergyEU(2).toString()).toBe('8');
    expect(minerEnergyEU(3).toString()).toBe('32');
    expect(minerEnergyEU(4).toString()).toBe('128');
    expect(minerSecondsPerOre(2).toString()).toBe('8');
    expect(minerSecondsPerOre(3).toString()).toBe('2');
    expect(minerSecondsPerOre(4).toString()).toBe('0.5');
  });

  it('每一级耗电 ×4、耗时 ÷4', () => {
    expect(minerEnergyEU(4).div(minerEnergyEU(3)).toString()).toBe('4');
    expect(minerSecondsPerOre(3).div(minerSecondsPerOre(4)).toString()).toBe('4');
  });

  it('产矿速率 = 1 ÷ 耗时', () => {
    expect(minerOrePerSecond(2).toString()).toBe('0.125');
    expect(minerOrePerSecond(3).toString()).toBe('0.5');
    expect(minerOrePerSecond(4).toString()).toBe('2');
  });

  it('越界等级直接报错', () => {
    expect(() => minerEnergyEU(0)).toThrow(RangeError);
    expect(() => minerSecondsPerOre(15)).toThrow(RangeError);
  });
});
