import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { dec } from '../src/numeric/decimal';

// 从实际使用入口验证：开局手动挖矿 → 造机器 → 循环转起来 → 解锁 LV。
describe('游戏核心：ULV → LV 完整循环', () => {
  it('开局靠手动挖矿攒够第一台机器', () => {
    const core = new GameCore();
    expect(core.coinPriceOf('machine', 1).toString()).toBe('500');
    expect(core.orePriceOf('machine', 1).toString()).toBe('5'); // 500 币 ÷ 100
    for (let i = 0; i < 5; i += 1) core.manualMine();
    expect(core.ores[0]!.toString()).toBe('5');
    expect(core.buy('machine', 1, 1, 'ore')).toBe(1);
    expect(core.countOf('machine', 1)).toBe(1);
    expect(core.ores[0]!.toString()).toBe('0');
  });

  it('ULV 制造机每秒产出 1 枚币', () => {
    const core = new GameCore();
    core.ores[0] = dec('1000');
    core.generators[0] = 1;
    core.machines[0] = 1;
    core.tick(1);
    expect(core.coins[0]!.toString()).toBe('1');
  });

  it('机器建齐之后矿石与币都增长', () => {
    const core = new GameCore();
    core.ores[0] = dec('1000');
    core.miners[0] = 3;
    core.generators[0] = 3;
    core.machines[0] = 1;
    const before = core.ores[0]!.toString();
    const report = core.tick(1);

    // 3 台发电 24 EU，3 台采矿 + 1 台制造耗电 3×2 + 8 = 14 EU，供电充足
    expect(report.powerRatio).toBe(1);
    expect(report.euGenerated.toString()).toBe('24');
    // 制造机每秒产 1 枚币（基础产出 1 × 4^0）
    expect(core.coins[0]!.toString()).toBe('1');
    // 采矿机 3 台 × 0.0625 枚/秒 = 0.1875 枚入账
    expect(report.oreGained[0]!.toString()).toBe('0.1875');
    expect(core.ores[0]!.lt(before)).toBe(true);
  });

  it('电力不足时整体降载', () => {
    const core = new GameCore();
    core.ores[0] = dec('100'); // 有矿才能发电
    core.miners[0] = 3;
    core.generators[0] = 1;
    core.machines[0] = 1;
    const report = core.tick(1);
    // 发电 8 EU，需求 3×2 + 8 = 14 EU
    expect(report.powerRatio).toBeLessThan(1);
    expect(report.powerRatio).toBeGreaterThan(0.5);
    // 制造机按降载比例产出，明显少于满负荷的 1 枚
    expect(Number(core.coins[0]!.toString())).toBeLessThan(1);
    expect(Number(core.coins[0]!.toString())).toBeGreaterThan(0.5);
  });

  it('攒够币可以解锁 LV，并开放 T1 矿脉', () => {
    const core = new GameCore();
    expect(core.unlockCostOf(2).toString()).toBe('20000'); // 500 × 4 × 10
    expect(core.canUnlock(2)).toBe(false);
    core.coins[0] = core.coins[0]!.plus('20000');
    expect(core.canUnlock(2)).toBe(true);
    expect(core.unlock(2)).toBe(true);
    expect(core.maxTier).toBe(2);
    expect(core.unlockedVeins).toEqual([0, 1]);
    // 解锁花掉了那笔币
    expect(core.coins[0]!.toString()).toBe('0');
    // 解锁之后 T1 矿石开始出现
    core.ores[0] = dec('100');
    core.miners[0] = 1;
    core.generators[0] = 2;
    core.tick(1);
    expect(core.ores[1]!.gt(0)).toBe(true);
  });

  it('没有矿石当燃料时，发电机发不出电，整个工厂停摆', () => {
    const core = new GameCore();
    core.miners[0] = 2;
    core.generators[0] = 2;
    core.machines[0] = 1;
    const report = core.tick(1);
    expect(report.powerRatio).toBe(0);
    expect(core.coins[0]!.toString()).toBe('0');
  });

  it('存档往返不丢精度，状态完整还原', () => {
    const core = new GameCore();
    core.manualMine();
    core.miners[0] = 7;
    core.generators[1] = 3;
    core.machines[0] = 2;
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    core.ores[1] = core.ores[1]!.plus('12345678901234567890');

    const restored = deserialize(serialize(core));
    expect(restored.miners[0]).toBe(7);
    expect(restored.generators[1]).toBe(3);
    expect(restored.maxTier).toBe(2);
    expect(restored.unlockedVeins).toEqual([0, 1]);
    // 超过 2^53 的大数原样保留
    expect(restored.ores[1]!.toString()).toBe('12345678901234567890');
    expect(serialize(restored)).toEqual(serialize(core));
  });
});
