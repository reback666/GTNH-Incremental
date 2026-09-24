import { describe, expect, it } from 'vitest';
import { dec } from '../src/numeric/decimal';
import { machineCost, marginalCostMultiplier } from '../src/numeric/cost';
import { formatNumber } from '../src/numeric/format';
import { overclockEnergyMultiplier, overclockSpeedMultiplier } from '../src/numeric/overclock';
import { rebirthCables } from '../src/numeric/rebirth';

describe('用户提供的校验值', () => {
  it('成本：基础 1000、tier=5、已购 37 → 3129246（1.07^37 口径）', () => {
    expect(machineCost({ baseCost: '1000', tier: 5, purchased: 37 }).toString()).toBe('3129246');
  });

  it('成本：基础 1000、tier=13、已购 100 → 14557864220754（1.07^100 口径）', () => {
    expect(machineCost({ baseCost: '1000', tier: 13, purchased: 100 }).toString()).toBe(
      '14557864220754',
    );
  });

  it('第 100 台的成本倍率约 868 倍（1.07^100）', () => {
    const ratio = marginalCostMultiplier(100);
    expect(ratio.toSignificantDigits(4).toString()).toBe('867.7');
    expect(Number(ratio.toString())).toBeGreaterThan(860);
    expect(Number(ratio.toString())).toBeLessThan(875);
  });

  it('转生：累计EU=1e12、tier=4、x=0 → 1 条', () => {
    expect(rebirthCables({ totalEU: '1e12', maxTier: 4, rebirthCount: 0 }).toString()).toBe('1');
  });

  it('转生：累计EU=1e40、tier=13、x=0 → 214 条', () => {
    expect(rebirthCables({ totalEU: '1e40', maxTier: 13, rebirthCount: 0 }).toString()).toBe('214');
  });

  it('超频 3 档 → 速度 8 倍、耗电 64 倍', () => {
    expect(overclockSpeedMultiplier(3).toString()).toBe('8');
    expect(overclockEnergyMultiplier(3).toString()).toBe('64');
  });

  it('1e1000 量级的数值能正常运算与格式化', () => {
    const big = dec('1e1000');
    expect(big.times(big).eq(dec('1e2000'))).toBe(true);
    expect(big.plus(dec('1e999')).eq(dec('1.1e1000'))).toBe(true);
    expect(big.div('1e999').eq(dec('10'))).toBe(true);
    expect(formatNumber(big)).toBe('1.00e1000');
  });
});
