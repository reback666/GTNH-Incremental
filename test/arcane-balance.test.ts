import { afterEach, describe, expect, it, vi } from 'vitest';
import { runArcaneBalanceScenario } from '../scripts/arcane-balance';
import { GameCore } from '../src/game/core';
import { baseModelOf, MACHINE_MODELS } from '../src/game/models';
import { coinValueInTier1 } from '../src/numeric/credit';
import { dec, ZERO } from '../src/numeric/decimal';

afterEach(() => vi.restoreAllMocks());

describe('奥术 P5.5 真实结算对照', () => {
  it('相同工业资产和可用预算，节点、研究、支架及队列真实从原钱包逐笔付款', () => {
    const result = runArcaneBalanceScenario('nodes', { seconds: 2 });
    const reference = result.arms[0]!;
    for (const arm of result.arms) {
      expect(arm.start).toEqual(reference.start);
      expect(arm.costs.incrementalBudgetULV).toBe('4000');
      expect(dec(arm.costs.incrementalSpentULV).plus(arm.costs.incrementalUnspentULV).toString()).toBe('4000');
      expect(arm.payments.every(payment => payment.second === 0 || payment.second === 1200)).toBe(true);
      for (let tier = 0; tier < arm.start.coinsByTier.length; tier++) {
        const nonIndustrial = arm.payments.filter(payment => payment.phase !== 'industry')
          .reduce((sum, payment) => sum.plus(payment.coinsByTier[tier]!), ZERO);
        const expected = dec(arm.start.coinsByTier[tier]!).minus(nonIndustrial).plus(arm.totals.walletIncomeByTier[tier]!);
        expect(expected.minus(arm.end.coinsByTier[tier]!).abs().lt('1e-28')).toBe(true);
        expect(dec(arm.totals.walletReconciliationByTier[tier]!).abs().lt('1e-28')).toBe(true);
        expect(dec(arm.totals.oreReconciliationByTier[tier]!).abs().lt('1e-28')).toBe(true);
      }
    }
    const expand = result.arms.find(arm => arm.id === 'expand')!;
    const cultivate = result.arms.find(arm => arm.id === 'cultivate')!;
    expect(expand.costs.prerequisiteByTier.slice(0, 2)).toEqual(['10900', '16000']);
    expect(expand.costs.incrementalSpentULV).toBe('3930');
    expect(expand.costs.incrementalUnspentULV).toBe('70');
    expect(cultivate.costs.incrementalSpentULV).toBe('1159');
    expect(cultivate.payments.find(payment => payment.item.includes('enqueue'))!.coinsByTier[0]).toBe('159');
    expect(cultivate.investmentStart).toEqual(expand.investmentStart);
    expect(cultivate.investmentStart.research).toBe(1);
    expect(cultivate.end.nodes[0]!.cultivations).toBe(0);
    expect(cultivate.end.nodes[0]!.size).toBe(80);
    const comparison = result.comparisons.find(row => row.arm === 'cultivate' && row.reference === 'hold')!;
    expect(dec(comparison.netWalletDifferenceULV).lt('-1159')).toBe(true);
    expect(dec(comparison.cultivationWindowIncomeGapULV).gt(0)).toBe(true);
    expect(comparison.firstValuePaybackSecond).toBeNull();
    expect(comparison.tailLinearValuePaybackSecond).toBeNull();
  }, 15000);

  it('实际调用 tick(1)，耗矿、供电和产币使用真实 GameCore 报告并保留魔法机原参数', () => {
    const tick = vi.spyOn(GameCore.prototype, 'tick');
    const result = runArcaneBalanceScenario('machines', { seconds: 3 });
    expect(tick).toHaveBeenCalledTimes(9);
    expect(tick.mock.calls.every(call => call.length === 1 && call[0] === 1)).toBe(true);
    const plain = result.arms.find(arm => arm.id === 'ordinary')!;
    const magic = result.arms.find(arm => arm.id === 'magic')!;
    expect(plain.end.counts[baseModelOf('machine', 2).id]).toBe(3);
    const model = MACHINE_MODELS.find(row => row.visPowered && row.category === 'machine' && row.tier === 2)!;
    expect(magic.end.counts[model.id]).toBe(1);
    expect(model.outputFactor).toBe('2.5');
    expect(magic.costs.incrementalSpentULV).toBe('10900');
    expect(plain.costs.incrementalSpentULV).toBe('7234');
    for (const arm of result.arms) {
      expect(dec(arm.totals.euConsumed).gt(0)).toBe(true);
      expect(dec(arm.totals.euGenerated).eq(arm.totals.euConsumed)).toBe(true);
      expect(dec(arm.totals.oreGainedByTier[1]!).gt(0)).toBe(true);
      expect(dec(arm.totals.oreSpentByTier[1]!).gt(0)).toBe(true);
      expect(arm.totals.tickCalls).toBe(3);
      expect(arm.start.grid).toBe('normal');
      expect(arm.start.essentia).toBe('0');
      expect(arm.start.storedEU).toBe('0');
    }
    expect(magic.totals.magicLimitedSeconds).toBe(3);
    expect(dec(magic.totals.euConsumed).lt(plain.totals.euConsumed)).toBe(true);
  });

  it('固定种子复现真实结算，估值回本不等于付款币种回本或主线通关', () => {
    const first = runArcaneBalanceScenario('machines', { seconds: 600, seed: 20261024 });
    const second = runArcaneBalanceScenario('machines', { seconds: 600, seed: 20261024 });
    expect(first).toEqual(second);
    const ordinary = first.comparisons.find(row => row.arm === 'ordinary' && row.reference === 'industry')!;
    expect(ordinary.firstValuePaybackSecond).not.toBeNull();
    expect(ordinary.paymentWalletPaybackSecond).toBeNull();
    const magic = first.comparisons.find(row => row.arm === 'magic' && row.reference === 'ordinary')!;
    expect(dec(magic.netWalletDifferenceULV).lt(0)).toBe(true);
    for (const arm of first.arms) {
      const payments = arm.payments.filter(payment => payment.phase === 'investment');
      for (const payment of payments) {
        const value = payment.coinsByTier.reduce((sum, amount, i) => sum.plus(dec(amount).times(coinValueInTier1(i + 1))), ZERO);
        expect(value.toString()).toBe(payment.coinValueULV);
      }
      expect(arm.end.maxTier).toBe(3);
      expect(arm.end.arcaneSeed).toBe(arm.start.arcaneSeed);
      expect(arm.costs.incrementalBudgetULV).toBe('12000');
    }
  }, 15000);

  it('拒绝非有限、非整数时长和随机种子，不吞掉未支持场景', () => {
    for (const seconds of [0, -1, 0.5, Infinity, NaN, 86401]) expect(() => runArcaneBalanceScenario('machines', { seconds })).toThrow(RangeError);
    for (const seed of [0, -1, 0.5, Infinity, NaN, 0x100000000]) expect(() => runArcaneBalanceScenario('machines', { seed })).toThrow(RangeError);
    expect(() => runArcaneBalanceScenario('missing' as 'nodes')).toThrow(RangeError);
  });
});
