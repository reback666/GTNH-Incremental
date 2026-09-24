import { describe, expect, it } from 'vitest';
import { dec } from '../src/numeric/decimal';
import { machineCost, marginalCostMultiplier } from '../src/numeric/cost';
import { formatNumber } from '../src/numeric/format';
import { overclockEnergyMultiplier, overclockSpeedMultiplier } from '../src/numeric/overclock';
import { rebirthCables } from '../src/numeric/rebirth';

// 成本两组校验值来自 plan.txt 的 1.12 时代版本：
//   b4d000b「机器成本 = 基础成本 × 4^(电压等级 - 1) × 1.12^(已购买数量)」
// 之后的 c0ba1a4 把底数改成 1.07，并写上「第 100 台约为第 1 台的 868 倍」。
// 也就是说这两组数字是旧公式的产物，只有 g = 1.12 时才能逐位复现。
// 当前实现以现行规范 1.07 为默认值，这里显式传入 1.12 让两组数字继续被测试守住，
// 冲突与影响见 docs/balance.md。
const VERIFIED_GROWTH = '1.12';

describe('用户提供的校验值', () => {
  it('成本：基础 1000、tier=5、已购 37 → 16955351', () => {
    const cost = machineCost({
      baseCost: '1000',
      tier: 5,
      purchased: 37,
      growth: VERIFIED_GROWTH,
    });
    expect(cost.toString()).toBe('16955351');
  });

  it('成本：基础 1000、tier=13、已购 100 → 1401271092903474', () => {
    const cost = machineCost({
      baseCost: '1000',
      tier: 13,
      purchased: 100,
      growth: VERIFIED_GROWTH,
    });
    expect(cost.toString()).toBe('1401271092903474');
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

  it('超频 3 档 → 倍率 2.8、能耗 8', () => {
    expect(overclockSpeedMultiplier(3).toString()).toBe('2.8');
    expect(overclockEnergyMultiplier(3).toString()).toBe('8');
  });

  it('1e1000 量级的数值能正常运算与格式化', () => {
    const big = dec('1e1000');
    expect(big.times(big).eq(dec('1e2000'))).toBe(true);
    expect(big.plus(dec('1e999')).eq(dec('1.1e1000'))).toBe(true);
    expect(big.div('1e999').eq(dec('10'))).toBe(true);
    expect(formatNumber(big)).toBe('1.00e1000');
  });
});
