import { describe, expect, it, vi } from 'vitest';
import { estimateManufacturing, renderBalance } from '../scripts/balance';
import { GameCore } from '../src/game/core';
import { tierOreBudget, verifyProgression, type ProgressionProgress } from '../scripts/progression';

describe('真实资源循环推进', () => {
  it('按实际首次自动产矿记录点击和用时，不注资、不跳级推进到 LV', () => {
    const grant = vi.spyOn(GameCore.prototype, 'devGrantResources');
    const unlockDev = vi.spyOn(GameCore.prototype, 'devUnlockTo');
    const unlock = vi.spyOn(GameCore.prototype, 'unlock');
    const tick = vi.spyOn(GameCore.prototype, 'tick');
    try {
      const events: ProgressionProgress[] = [];
      const result = verifyProgression(2, { maxWallMs: 15000, onProgress: event => events.push(event) });
      expect(result.status).toBe('complete');
      expect(result.maxTier).toBe(2);
      expect(result.firstAutomationClicks).toBeGreaterThan(0);
      expect(result.firstAutomationClicks).toBeLessThanOrEqual(result.starterClicks);
      expect(result.firstAutomationClicks).toBeLessThan(16);
      expect(result.firstAutomationSeconds).toBeGreaterThan(0);
      expect(result.firstAutomationClicks).toBe(result.firstAutomationSeconds! * 2);
      expect(result.starterClicks).toBeLessThanOrEqual(16);
      expect(result.stages.map(stage => stage.voltage)).toEqual(['ULV', 'LV']);
      expect(result.stages[0]!.reachedSeconds).toBe(0);
      expect(result.stages[0]!.readySeconds).toBeLessThan(result.stages[1]!.reachedSeconds);
      expect(result.stages[1]!.machines).toBeGreaterThan(result.stages[0]!.machines);
      expect(result.stages[1]!.readySeconds).not.toBeNull();
      expect(result.seconds).toBeGreaterThan(0);
      expect(result.seconds).toBeLessThan(24 * 3600);
      expect(Number(result.ores[1])).toBeGreaterThanOrEqual(0);
      expect(result.canMaxRebirth).toBe(false);
      expect(grant).not.toHaveBeenCalled();
      expect(unlockDev).not.toHaveBeenCalled();
      expect(unlock.mock.calls).toEqual([[2]]);
      expect(tick.mock.calls.every(([seconds]) => seconds === 1)).toBe(true);
      expect(events.some(event => event.phase === '首次自动采矿')).toBe(true);
      expect(events.some(event => event.phase === '电压突破' && event.voltage === 'LV')).toBe(true);
    } finally { vi.restoreAllMocks(); }
  }, 20000);

  it('预算到期保留已验证阶段和瓶颈，不抛异常也不虚报完成', () => {
    const result = verifyProgression(15, { maxSeconds: 100, maxWallMs: 5000 });
    expect(result.status).toBe('simulation-limit');
    expect(result.seconds).toBe(100);
    expect(result.maxTier).toBe(1);
    expect(result.blocker?.action).toContain('LV');
    expect(result.stages).toHaveLength(1);
    expect(result.firstAutomationSeconds).toBeLessThan(100);
  });

  it('零秒预算不会凭空给出自动化或就绪阶段', () => {
    const result = verifyProgression(2, { maxSeconds: 0 });
    expect(result.status).toBe('simulation-limit');
    expect(result.firstAutomationClicks).toBeNull();
    expect(result.firstAutomationSeconds).toBeNull();
    expect(result.stages[0]!.readySeconds).toBeNull();
    expect(result.purchases).toBe(0);
  });

  it('固定种子和模拟预算可复现，不依赖禁止事件发生的常数随机数', () => {
    const options = { maxSeconds: 500, maxWallMs: 5000, seed: 42 };
    const first = verifyProgression(2, options);
    const second = verifyProgression(2, options);
    expect(first.coins).toEqual(second.coins);
    expect(first.ores).toEqual(second.ores);
    expect(first.stages).toEqual(second.stages);
  });

  it('诊断同时计入矿脉均分、制造直接耗矿和燃料，而不是只比采矿与燃料', () => {
    const ev = tierOreBudget(5);
    expect(ev.oreShare).toBe('1.6');
    expect(ev.manufacturingPerMachine).toBe('2.56');
    expect(Number(ev.netForTwoMinersTwoMachines)).toBeLessThan(0);
    expect(tierOreBudget(15).minersForOneMachineIgnoringFuel).toBeGreaterThan(4000);
  });

  it('真实存档续跑保留累计时间、随机状态和首次采矿，不重新注入起步', () => {
    const first = verifyProgression(2, { maxSeconds: 500, seed: 42 });
    const resumed = verifyProgression(2, { maxSeconds: 1000, resume: JSON.parse(JSON.stringify(first.checkpoint)) });
    const direct = verifyProgression(2, { maxSeconds: 1000, seed: 42 });
    expect(resumed.seconds).toBe(1000);
    expect(resumed.purchases).toBe(direct.purchases);
    expect(resumed.coins).toEqual(direct.coins);
    expect(resumed.ores).toEqual(direct.ores);
    expect(resumed.checkpoint.randomState).toBe(direct.checkpoint.randomState);
    expect(resumed.firstAutomationClicks).toBe(first.firstAutomationClicks);
    expect(resumed.starterClicks).toBe(first.starterClicks);
  });

  it('将简化估算与真实核验分开，未执行的电压不标完成', () => {
    const estimate = renderBalance();
    expect(estimate).toContain('不是玩家可执行的流程');
    expect(estimate).toContain('本次仅生成估算，未运行真实推进');
    expect(estimateManufacturing(5).total.gt(0)).toBe(true);
    const actual = renderBalance(verifyProgression(15, { maxSeconds: 100 }));
    expect(actual).toContain('simulation-limit');
    expect(actual).toContain('| MAX | 未核验 | 未核验 |');
    expect(actual).toContain('无法给出可靠全程耗时');
    expect(actual).toContain('累计 12 次点击');
  });

  it('拒绝非法电压与无界预算', () => {
    expect(() => verifyProgression(0)).toThrow(RangeError);
    expect(() => verifyProgression(16)).toThrow(RangeError);
    expect(() => verifyProgression(2, { maxSeconds: Infinity })).toThrow(RangeError);
    expect(() => verifyProgression(2, { maxWallMs: 0 })).toThrow(RangeError);
  });
});
