import { describe, expect, it } from 'vitest';
import { dec } from '../src/numeric/decimal';
import { formatNumber } from '../src/numeric/format';
import { baseOutputAtTier, lineOutput, machineEnergy, machineOutput } from '../src/numeric/output';

describe('产出与能耗', () => {
  it('基础产出 = 基础值 × 4^(tier-1)', () => {
    expect(baseOutputAtTier('10', 3).toString()).toBe('160');
  });

  it('产出 = 基础值 × 4^(tier-1) × 超频倍率 × 并行倍率', () => {
    expect(machineOutput({ baseOutput: '10', tier: 3 }).toString()).toBe('160');
    expect(machineOutput({ baseOutput: '10', tier: 3, overclockLevel: 2 }).toString()).toBe('352');
    expect(
      machineOutput({ baseOutput: '10', tier: 5, recipeTier: 1, overclockLevel: 3 }).toString(),
    ).toBe('35840');
  });

  it('配方等级高于机器电压时并行不生效，需由调用方先用 canRunRecipe 拦截', () => {
    expect(machineOutput({ baseOutput: '10', tier: 2, recipeTier: 5 }).toString()).toBe('40');
  });

  it('能耗 = 基础能耗 × 4^(tier-1) × 并行倍率 × 2^超频档位', () => {
    expect(machineEnergy({ baseEnergy: '32', tier: 3 }).toString()).toBe('512');
    expect(machineEnergy({ baseEnergy: '32', tier: 3, overclockLevel: 3 }).toString()).toBe('4096');
    expect(machineEnergy({ baseEnergy: '32', tier: 5, recipeTier: 1 }).toString()).toBe('40960');
  });

  it('整条产线按台数累加', () => {
    const total = lineOutput(
      [
        { baseOutput: '10', tier: 1 },
        { baseOutput: '10', tier: 2, overclockLevel: 1 },
      ],
      [3, 2],
    );
    expect(total.toString()).toBe('158');
  });

  it('1e900 量级的产出照常计算并格式化', () => {
    const total = lineOutput([{ baseOutput: '1e900', tier: 14 }], [1]);
    expect(total.eq(dec('1e900').times('67108864'))).toBe(true);
    expect(formatNumber(total)).toBe('6.71e907');
  });
});
