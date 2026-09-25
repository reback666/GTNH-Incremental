import { describe, expect, it } from 'vitest';
import {
  MINER_OUTPUT_FACTOR,
  minerEnergyEU,
  minerOrePerSecond,
  minerSecondsPerOre,
} from '../src/numeric/miner';

describe('采矿机', () => {
  it('耗电照搬 GTNH：LV 8 EU/t、MV 32 EU/t、HV 128 EU/t', () => {
    expect(minerEnergyEU(2).toString()).toBe('8');
    expect(minerEnergyEU(3).toString()).toBe('32');
    expect(minerEnergyEU(4).toString()).toBe('128');
  });

  it('耗时 = GTNH 基准耗时 ÷ 全局产矿倍率（8 倍）：LV 1s、MV 0.5s、HV 0.25s', () => {
    expect(MINER_OUTPUT_FACTOR).toBe('8');
    expect(minerSecondsPerOre(2).toString()).toBe('1');
    expect(minerSecondsPerOre(3).toString()).toBe('0.5');
    expect(minerSecondsPerOre(4).toString()).toBe('0.25');
    // 去掉全局倍率后仍是 GTNH 实测的 8 / 4 / 2 秒
    expect(minerSecondsPerOre(2).times(MINER_OUTPUT_FACTOR).toString()).toBe('8');
    expect(minerSecondsPerOre(3).times(MINER_OUTPUT_FACTOR).toString()).toBe('4');
    expect(minerSecondsPerOre(4).times(MINER_OUTPUT_FACTOR).toString()).toBe('2');
  });

  it('每一级耗电 ×4、耗时 ÷2', () => {
    expect(minerEnergyEU(4).div(minerEnergyEU(3)).toString()).toBe('4');
    expect(minerSecondsPerOre(3).div(minerSecondsPerOre(4)).toString()).toBe('2');
  });

  it('产矿速率 = 1 ÷ 耗时', () => {
    expect(minerOrePerSecond(1).toString()).toBe('0.5'); // ULV 采矿机
    expect(minerOrePerSecond(2).toString()).toBe('1');
    expect(minerOrePerSecond(3).toString()).toBe('2');
    expect(minerOrePerSecond(4).toString()).toBe('4');
  });

  it('越界等级直接报错', () => {
    expect(() => minerEnergyEU(0)).toThrow(RangeError);
    expect(() => minerSecondsPerOre(15)).toThrow(RangeError);
  });
});
