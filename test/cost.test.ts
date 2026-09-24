import { describe, expect, it } from 'vitest';
import {
  LATE_GAME_LOG_DISABLED,
  MARGINAL_COST_GROWTH,
  bulkMachineCost,
  lateGameLogFactor,
  machineCost,
  marginalCostMultiplier,
  tierCostMultiplier,
} from '../src/numeric/cost';
import { ZERO } from '../src/numeric/decimal';

describe('成本公式', () => {
  it('默认边际系数就是计划书第八章的 1.07', () => {
    expect(MARGINAL_COST_GROWTH).toBe('1.07');
    expect(marginalCostMultiplier(0).toString()).toBe('1');
    expect(marginalCostMultiplier(100).toSignificantDigits(4).toString()).toBe('867.7');
  });

  it('单价向下取整，保证 GT 币余额永远是整数', () => {
    expect(machineCost({ baseCost: '1000', tier: 1, purchased: 1 }).toString()).toBe('1070');
    // 1000 × 1.07^2 = 1144.9 → 1144
    expect(machineCost({ baseCost: '1000', tier: 1, purchased: 2 }).toString()).toBe('1144');
  });

  it('电压等级带来的倍数是 4^(tier-1)', () => {
    expect(tierCostMultiplier(1).toString()).toBe('1');
    expect(tierCostMultiplier(5).toString()).toBe('256');
    expect(tierCostMultiplier(14).toString()).toBe('67108864');
  });

  it('批量购买总价等于逐台单价之和', () => {
    const input = { baseCost: '1000', tier: 1, purchased: 0 };
    let manual = ZERO;
    for (let index = 0; index < 5; index += 1) {
      manual = manual.plus(machineCost({ ...input, purchased: index }));
    }
    expect(bulkMachineCost({ ...input, count: 5 }).eq(manual)).toBe(true);
    expect(bulkMachineCost({ ...input, count: 5 }).toString()).toBe('5749');
    expect(bulkMachineCost({ ...input, count: 0 }).toString()).toBe('0');
  });

  it('已购数量或购买数量不合法时直接报错', () => {
    expect(() => marginalCostMultiplier(-1)).toThrow(RangeError);
    expect(() => marginalCostMultiplier(2.5)).toThrow(RangeError);
    expect(() => bulkMachineCost({ baseCost: '1000', tier: 1, purchased: 0, count: 1.5 })).toThrow(
      RangeError,
    );
  });
});

describe('第八章「后期 4^n × log(n)」的可配置实现', () => {
  it('默认关闭，不影响成本曲线', () => {
    expect(LATE_GAME_LOG_DISABLED.fromTier).toBeNull();
    expect(lateGameLogFactor(14).toString()).toBe('1');
    expect(tierCostMultiplier(14, LATE_GAME_LOG_DISABLED).toString()).toBe('67108864');
  });

  it('指定起点后，起点之前的 tier 不受影响，起点之后乘以 log(n)', () => {
    const options = { fromTier: 10, logBase: 'e' as const };
    expect(lateGameLogFactor(9, options).toString()).toBe('1');
    expect(lateGameLogFactor(10, options).toSignificantDigits(7).toString()).toBe('2.302585');
    expect(lateGameLogFactor(14, options).toSignificantDigits(7).toString()).toBe('2.639057');
    expect(tierCostMultiplier(9, options).toString()).toBe('65536');
    expect(
      tierCostMultiplier(14, options).div(tierCostMultiplier(14)).toSignificantDigits(7).toString(),
    ).toBe('2.639057');
  });

  it('支持换底：log10 且起点 tier=10 时，tier=10 的修正为 1，tier=14 为 1.146128', () => {
    expect(lateGameLogFactor(10, { fromTier: 10, logBase: '10' }).toString()).toBe('1');
    expect(
      lateGameLogFactor(14, { fromTier: 10, logBase: '10' }).toSignificantDigits(7).toString(),
    ).toBe('1.146128');
  });
});
