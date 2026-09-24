import { describe, expect, it } from 'vitest';
import {
  autoOverclockEnergyMultiplier,
  autoOverclockSpeedMultiplier,
  autoOverclockSteps,
  canRunRecipe,
} from '../src/numeric/autoOverclock';

describe('自动超频', () => {
  it('超频次数 = 电压等级 - 配方等级', () => {
    expect(autoOverclockSteps(5, 5)).toBe(0);
    expect(autoOverclockSteps(6, 2)).toBe(4);
    expect(autoOverclockSteps(14, 1)).toBe(13);
  });

  it('只有电压 ≥ 配方等级时配方才跑得起来', () => {
    expect(canRunRecipe(5, 5)).toBe(true);
    expect(canRunRecipe(5, 6)).toBe(false);
    expect(canRunRecipe(2, 6)).toBe(false);
  });

  it('速度倍率 = 2^超频次数', () => {
    expect(autoOverclockSpeedMultiplier(5, 5).toString()).toBe('1');
    expect(autoOverclockSpeedMultiplier(6, 5).toString()).toBe('2');
    expect(autoOverclockSpeedMultiplier(6, 2).toString()).toBe('16');
    expect(autoOverclockSpeedMultiplier(14, 1).toString()).toBe('8192');
  });

  it('能耗倍率 = 4^超频次数', () => {
    expect(autoOverclockEnergyMultiplier(5, 5).toString()).toBe('1');
    expect(autoOverclockEnergyMultiplier(6, 5).toString()).toBe('4');
    expect(autoOverclockEnergyMultiplier(6, 2).toString()).toBe('256');
    expect(autoOverclockEnergyMultiplier(14, 1).toString()).toBe('67108864');
  });

  it('电压不足时自动超频不生效，倍率退回 1', () => {
    expect(autoOverclockSteps(2, 6)).toBe(0);
    expect(autoOverclockSpeedMultiplier(2, 6).toString()).toBe('1');
    expect(autoOverclockEnergyMultiplier(2, 6).toString()).toBe('1');
  });

  it('越界参数直接报错', () => {
    expect(() => autoOverclockSteps(15, 1)).toThrow(RangeError);
    expect(() => autoOverclockSteps(5, 0)).toThrow(RangeError);
    expect(() => canRunRecipe(0, 1)).toThrow(RangeError);
  });
});
