import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { modelById } from '../src/game/models';
import { deserialize, serialize, type SaveData } from '../src/game/save';
import { dec } from '../src/numeric/decimal';

// 第二阶段：超频档位 + 故障维护 + 存电装置（计划书第六章、第七章）。
const ULV_MINER = 'm-1';
const ULV_GENERATOR = 'g-ulv';
const ULV_MACHINE = 'c-1';

function runningCore(): GameCore {
  const core = new GameCore();
  core.ores[0] = dec('10000');
  core.counts[ULV_MINER] = 4;
  core.counts[ULV_GENERATOR] = 8;
  core.counts[ULV_MACHINE] = 1;
  return core;
}

describe('超频档位', () => {
  it('只有采矿机与制造机能超频，发电机不能', () => {
    const core = new GameCore();
    expect(core.setOverclock(ULV_MINER, 2)).toBe(true);
    expect(core.overclockOf(ULV_MINER)).toBe(2);
    expect(core.setOverclock(ULV_GENERATOR, 1)).toBe(false);
    expect(core.overclockOf(ULV_GENERATOR)).toBe(0);
    expect(core.setOverclock('不存在', 1)).toBe(false);
  });

  it('档位越界或非整数一律拒绝', () => {
    const core = new GameCore();
    expect(core.setOverclock(ULV_MINER, 4)).toBe(false);
    expect(core.setOverclock(ULV_MINER, -1)).toBe(false);
    expect(core.setOverclock(ULV_MINER, 1.5)).toBe(false);
    expect(core.overclockOf(ULV_MINER)).toBe(0);
  });

  it('采矿机 1 档：产矿 ×1.6、耗电 ×2', () => {
    const base = runningCore();
    base.tick(1);
    const baseOre = base.lastReport.oreGained[0]!.toNumber();
    const baseDemand = base.lastReport.euConsumed.toNumber();

    const boosted = runningCore();
    boosted.setOverclock(ULV_MINER, 1);
    boosted.tick(1);
    const boostedOre = boosted.lastReport.oreGained[0]!.toNumber();

    expect(boostedOre).toBeCloseTo(baseOre * 1.6, 6);
    expect(boosted.lastReport.euConsumed.toNumber()).toBeGreaterThan(baseDemand);
  });

  it('制造机 1 档：产币 ×1.6，吃矿也 ×1.6', () => {
    const base = runningCore();
    base.tick(1);
    const boosted = runningCore();
    boosted.setOverclock(ULV_MACHINE, 1);
    boosted.tick(1);
    expect(boosted.lastReport.coinsGained[0]!.toNumber()).toBeCloseTo(
      base.lastReport.coinsGained[0]!.toNumber() * 1.6,
      6,
    );
    expect(boosted.lastReport.oreSpent[0]!.gt(base.lastReport.oreSpent[0]!)).toBe(true);
  });
});

describe('故障与手动维护', () => {
  it('3 档跑久了会坏，坏掉的机器不产也不耗', () => {
    const core = runningCore();
    core.counts[ULV_MINER] = 50;
    core.counts[ULV_GENERATOR] = 200;
    core.setOverclock(ULV_MINER, 3);
    // 固定随机源：0.999 会让泊松抽样直接给出一批故障
    core.random = () => 0.999;
    const report = core.tick(1);
    expect(report.faultsGained).toBeGreaterThan(0);
    expect(core.faultyCountOf(ULV_MINER)).toBe(report.faultsGained);
    expect(core.workingCountOf(ULV_MINER)).toBe(50 - report.faultsGained);
  });

  it('维护之后恢复生产', () => {
    const core = runningCore();
    core.setOverclock(ULV_MINER, 3);
    core.random = () => 0.999;
    core.tick(1);
    const broken = core.faultyCountOf(ULV_MINER);
    expect(broken).toBeGreaterThan(0);

    core.random = () => 0.5; // 之后不再新增故障
    const before = core.lastReport.oreGained[0]!.toNumber();
    core.tick(1);
    const whileBroken = core.lastReport.oreGained[0]!.toNumber();
    expect(whileBroken).toBeLessThan(before);

    expect(core.repair(ULV_MINER)).toBe(broken);
    expect(core.faultyCountOf(ULV_MINER)).toBe(0);
    core.tick(1);
    expect(core.lastReport.oreGained[0]!.toNumber()).toBeGreaterThan(whileBroken);
  });

  it('调档位相当于顺手检修，故障清零', () => {
    const core = runningCore();
    core.faults[ULV_MINER] = 3;
    expect(core.faultyCountOf(ULV_MINER)).toBe(3);
    core.setOverclock(ULV_MINER, 1);
    expect(core.faultyCountOf(ULV_MINER)).toBe(0);
  });
});

describe('存电装置', () => {
  it('富余电力存进电池，缺口先放存量再降载', () => {
    const core = new GameCore();
    core.maxTier = 3;
    core.unlockedVeins = [0, 1, 2];
    core.counts[ULV_MINER] = 1; // 耗电 2 EU/t
    core.counts[ULV_MACHINE] = 1; // 耗电 8 EU/t
    core.counts['g-mv-steam'] = 1; // 128 EU/t × 0.75 效率
    core.counts['b-3'] = 1; // MV 储电箱：16000 EU
    core.ores[2] = dec('1000');

    expect(core.batteryCapacity().toString()).toBe('16000');

    // 第一阶段：发电机富余，电池充起来
    core.tick(1);
    expect(core.storedEU.gt(0)).toBe(true);
    const charged = core.storedEU.toNumber();
    expect(core.lastReport.euCharged.toNumber()).toBeCloseTo(charged, 6);
    expect(core.lastReport.powerRatio).toBe(1);

    // 第二阶段：把燃料抽干，靠存量继续跑
    core.ores[2] = dec('0');
    core.tick(1);
    expect(core.storedEU.lt(charged)).toBe(true);
    expect(core.lastReport.euDischarged.gt(0)).toBe(true);
    expect(core.lastReport.powerRatio).toBe(1);

    // 第三阶段：存量用光，开始降载
    core.storedEU = dec('0');
    core.tick(1);
    expect(core.lastReport.powerRatio).toBe(0);
  });

  it('没有存电装置时，缺口只能降载（电网里没有缓冲）', () => {
    const core = new GameCore();
    core.counts[ULV_MINER] = 3;
    core.counts[ULV_GENERATOR] = 1;
    core.counts[ULV_MACHINE] = 1;
    core.ores[0] = dec('1000');
    core.tick(1);
    expect(core.batteryCapacity().toString()).toBe('0');
    expect(core.storedEU.toString()).toBe('0');
    expect(core.lastReport.powerRatio).toBeLessThan(1);
  });

  it('储电箱从 MV 起才有，容量随等级 ×4', () => {
    expect(modelById('b-3').tier).toBe(3);
    expect(modelById('b-3').name).toBe('MV 储电箱');
  });
});

describe('存档 v3', () => {
  it('超频档位、故障台数、存量都能存下来', () => {
    const core = new GameCore();
    core.counts[ULV_MINER] = 5;
    core.setOverclock(ULV_MINER, 2);
    core.faults[ULV_MINER] = 3;
    core.storedEU = dec('12345.5');
    const restored = deserialize(serialize(core));
    expect(restored.overclockOf(ULV_MINER)).toBe(2);
    expect(restored.faultyCountOf(ULV_MINER)).toBe(3);
    expect(restored.storedEU.toString()).toBe('12345.5');
  });

  it('v2 老存档照常读入，新字段走默认值', () => {
    const legacy = {
      version: 2,
      ores: ['100', ...Array(13).fill('0')],
      coins: ['0', ...Array(13).fill('0')],
      counts: { 'm-1': 2 },
      maxTier: 1,
      unlockedVeins: [0],
      playSeconds: 10,
      totalOre: '100',
      totalCoins: '0',
      totalOreSpent: '0',
    } as SaveData;
    const core = deserialize(legacy);
    expect(core.countOf(ULV_MINER)).toBe(2);
    expect(core.overclockOf(ULV_MINER)).toBe(0);
    expect(core.faultyCountOf(ULV_MINER)).toBe(0);
    expect(core.storedEU.toString()).toBe('0');
  });
});
