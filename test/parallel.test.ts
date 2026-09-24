import { describe, expect, it } from 'vitest';
import { canRunRecipe, parallelMultiplier } from '../src/numeric/parallel';

describe('并行', () => {
  it('并行倍率 = 电压等级 - 配方等级 + 1', () => {
    expect(parallelMultiplier(5, 5).toString()).toBe('1');
    expect(parallelMultiplier(6, 2).toString()).toBe('5');
    expect(parallelMultiplier(14, 1).toString()).toBe('14');
  });

  it('只有电压 ≥ 配方等级时配方才跑得起来', () => {
    expect(canRunRecipe(5, 5)).toBe(true);
    expect(canRunRecipe(5, 6)).toBe(false);
    expect(parallelMultiplier(2, 6).toString()).toBe('1');
  });

  it('maxParallel 可以压低并行倍率（对应自定义机器的 maxParallel）', () => {
    expect(parallelMultiplier(14, 1, 4).toString()).toBe('4');
    expect(parallelMultiplier(6, 2, 64).toString()).toBe('5');
  });

  it('越界参数直接报错', () => {
    expect(() => parallelMultiplier(15, 1)).toThrow(RangeError);
    expect(() => parallelMultiplier(5, 0)).toThrow(RangeError);
    expect(() => parallelMultiplier(5, 1, 0)).toThrow(RangeError);
  });
});
