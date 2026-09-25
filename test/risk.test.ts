import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { modelById } from '../src/game/models';
import { dec } from '../src/numeric/decimal';
import {
  pollutionBand,
  pollutionOutputMultiplier,
  pollutionPerSecond,
  purifyPerSecond,
} from '../src/numeric/pollution';
import { gridEnergyMultiplier } from '../src/numeric/grid';

// 第二阶段收尾：风险杠杆（计划书第六章）——污染与电网。
const ULV_MINER = 'm-1';
const ULV_GENERATOR = 'g-ulv';
const ULV_MACHINE = 'c-1';

function factory(pollution = '0'): GameCore {
  const core = new GameCore();
  core.maxTier = 3;
  core.unlockedVeins = [0, 1, 2];
  core.ores = core.ores.map(() => dec('100000'));
  core.counts['g-mv-comb'] = 40; // MV 内燃机 90% 效率
  core.counts['c-3'] = 20;
  core.counts['m-3'] = 20;
  core.pollution = dec(pollution);
  return core;
}

describe('污染数值', () => {
  it('三档：<30 无影响、30-70 中度、>70 重度', () => {
    expect(pollutionBand(dec('0'))).toBe('clean');
    expect(pollutionBand(dec('29.9'))).toBe('clean');
    expect(pollutionBand(dec('30'))).toBe('mutating');
    expect(pollutionBand(dec('70'))).toBe('critical');
    expect(pollutionOutputMultiplier(dec('10')).toString()).toBe('1');
    expect(pollutionOutputMultiplier(dec('50')).toString()).toBe('0.8');
    expect(pollutionOutputMultiplier(dec('90')).toString()).toBe('0.6');
  });

  it('污染与净化都按「台数 × 电压等级」算', () => {
    // 50 台 MV（3 级）：污染 50×3×0.0008 = 0.12 %/秒
    expect(pollutionPerSecond([{ tier: 3, count: 50 }]).toString()).toBe('0.12');
    // 50 台 MV 净化器：50×3×0.0012 = 0.18 %/秒，压得住
    expect(purifyPerSecond([{ tier: 3, count: 50 }]).toString()).toBe('0.18');
  });

  it('电网耗电倍率：稳定 1.2、波动 0.7、黑市 0.5', () => {
    expect(gridEnergyMultiplier('stable').toString()).toBe('1.2');
    expect(gridEnergyMultiplier('volatile').toString()).toBe('0.7');
    expect(gridEnergyMultiplier('black').toString()).toBe('0.5');
  });
});

describe('污染在模拟里的效果', () => {
  it('机器一多污染自己会涨', () => {
    const core = factory();
    expect(core.pollution.toString()).toBe('0');
    core.tick(1);
    // 40 台 MV 发电机 + 20 台 MV 制造机 + 20 台 MV 采矿机 = 80 台 × 3 级 × 0.0008
    expect(core.pollution.toNumber()).toBeCloseTo(80 * 3 * 0.0008, 6);
  });

  it('重度污染把产出打到 6 折', () => {
    const clean = factory('0');
    clean.tick(1);
    const dirty = factory('80');
    dirty.tick(1);
    expect(dirty.lastReport.coinsGained[2]!.toNumber()).toBeCloseTo(
      clean.lastReport.coinsGained[2]!.toNumber() * 0.6,
      6,
    );
  });

  it('设置里关掉污染：不涨、也不打折', () => {
    const core = factory('80');
    core.setPollutionEnabled(false);
    core.tick(1);
    expect(core.pollution.toString()).toBe('80'); // 不涨
    expect(core.lastReport.outputMultiplier.toString()).toBe('1'); // 不打折
  });

  it('净化器能把污染压下去', () => {
    const core = factory('50');
    core.counts['p-3'] = 60; // 60 台 MV 净化器
    core.tick(1);
    expect(core.pollution.lt(50)).toBe(true);
    expect(core.purifyPerSecond().gt(core.pollutionPerSecond())).toBe(true);
  });

  it('重度污染会工厂崩溃：随机摧毁一台机器', () => {
    const core = factory('80');
    core.random = () => 0; // 判定必中
    const before = core.counts['c-3']!;
    core.tick(600);
    expect(core.lastReport.collapses).toBe(1);
    const totalAfter = Object.values(core.counts).reduce((sum, n) => sum + n, 0);
    const totalBefore = 40 + 20 + 20;
    expect(totalAfter).toBe(totalBefore - 1);
    expect(core.counts['c-3'] ?? 0).toBeLessThanOrEqual(before);
  });

  it('中度污染会变异：给一笔额外奖励', () => {
    const core = factory('50');
    core.random = () => 0;
    core.tick(60);
    expect(core.lastReport.mutations).toBe(1);
  });
});

describe('电网模式在模拟里的效果', () => {
  it('稳定电网耗电最高、黑市最低', () => {
    const used = (mode: 'stable' | 'volatile' | 'black'): number => {
      const core = factory();
      core.setGrid(mode);
      core.tick(1);
      return core.lastReport.euConsumed.toNumber();
    };
    expect(used('stable')).toBeGreaterThan(used('volatile'));
    expect(used('volatile')).toBeGreaterThan(used('black'));
  });

  it('波动电网断电：机器全停', () => {
    const core = factory();
    core.setGrid('volatile');
    core.random = () => 0; // 5 分钟判定必中
    core.tick(300);
    expect(core.lastReport.outage).toBe(true);
    expect(core.lastReport.powerRatio).toBe(0);
    expect(core.outageSeconds).toBeGreaterThan(0);
  });

  it('黑市电网每分钟薅走一种币的 1%', () => {
    // 用一台机器都没有的干净存档，避免产出干扰判断
    const core = new GameCore();
    core.setGrid('black');
    core.coins[2] = dec('1000');
    core.random = () => 0;
    core.tick(60);
    expect(core.siphoned.toString()).toBe('10'); // 1000 的 1%
    expect(core.coins[2]!.toString()).toBe('990');
  });

  it('切换电网会立刻结束断电', () => {
    const core = factory();
    core.setGrid('volatile');
    core.outageSeconds = 8;
    core.setGrid('stable');
    expect(core.outageSeconds).toBe(0);
  });
});

describe('设施机型', () => {
  it('净化器从 MV 起，越高级净化越快', () => {
    expect(modelById('p-3').name).toBe('MV 净化器');
    expect(modelById('p-14').tier).toBe(14);
  });

  it('净化器不参与超频（没有配方）', () => {
    const core = new GameCore();
    expect(core.setOverclock('p-3', 2)).toBe(false);
    expect(core.setOverclock(ULV_MINER, 2)).toBe(true);
    expect(core.setOverclock(ULV_GENERATOR, 1)).toBe(false);
    expect(core.setOverclock(ULV_MACHINE, 1)).toBe(true);
  });
});
