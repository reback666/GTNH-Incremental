import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { modelById } from './helpers';
import { dec } from '../src/numeric/decimal';
import { deserialize, serialize } from '../src/game/save';

// 硅基宇宙（计划书第五章）：AI 接管维护、超频与停机调度，三件事各带一个开关。
// 三个功能都有 5% 误判率 —— 测试里用固定的 random 把它钉住。
const AI_OK = () => 0.5; // ≥ 0.05，这一拍不误判
const AI_MISFIRE = () => 0.01; // < 0.05，这一拍误判

describe('硅基宇宙：AI 自动维护', () => {
  it('故障机器当拍就修好，并记进维护次数', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.maxTier = 3;
    core.ores[0] = dec('1e6');
    core.counts['m-2'] = 10;
    core.faults['m-2'] = 4;
    core.random = AI_OK;

    const report = core.tick(1);
    expect(report.autoRepairs).toBe(4);
    expect(core.faultyCountOf('m-2')).toBe(0);
    expect(core.repairs).toBe(4);
  });

  it('AI 误判那一拍不修，下一拍补上；关掉开关就完全不管', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.maxTier = 3;
    core.ores[0] = dec('1e6');
    core.counts['m-2'] = 10;

    core.faults['m-2'] = 3;
    core.random = AI_MISFIRE;
    core.tick(1);
    expect(core.faultyCountOf('m-2')).toBe(3); // 这一拍没修

    core.random = AI_OK;
    core.tick(1);
    expect(core.faultyCountOf('m-2')).toBe(0); // 下一拍补上

    core.siliconAutoRepair = false;
    core.faults['m-2'] = 2;
    core.tick(1);
    expect(core.faultyCountOf('m-2')).toBe(2); // 开关关掉就不动手
  });
});

describe('硅基宇宙：AI 自动超频', () => {
  it('电力扛得住翻倍时升档，明显缺电时降档', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.maxTier = 3;
    core.ores = core.ores.map(() => dec('1e9'));
    core.counts['g-mv-comb'] = 200; // 电多得很
    core.counts['m-3'] = 1;
    core.random = AI_OK;

    expect(core.overclockOf('m-3')).toBe(0);
    core.tick(1);
    expect(core.overclockOf('m-3')).toBe(1);
    core.tick(1);
    expect(core.overclockOf('m-3')).toBe(2);

    // 把发电机拆掉，电力掉下来 → AI 降档
    core.counts['g-mv-comb'] = 0;
    core.tick(1);
    expect(core.overclockOf('m-3')).toBeLessThan(2);
  });

  it('关掉开关就不动档位', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.siliconAutoOverclock = false;
    core.maxTier = 3;
    core.ores = core.ores.map(() => dec('1e9'));
    core.counts['g-mv-comb'] = 200;
    core.counts['m-3'] = 1;
    core.random = AI_OK;
    core.tick(3);
    expect(core.overclockOf('m-3')).toBe(0);
  });
});

describe('硅基宇宙：按优先级停机', () => {
  it('缺电时整组停掉优先级最低的机器，而不是全厂降载', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.pollutionEnabled = false;
    core.maxTier = 1;
    core.ores[0] = dec('1e9');
    core.counts['g-ulv'] = 1; // 只发 8 EU/t
    core.counts['m-1'] = 1; // 采矿机要 8
    core.counts['c-1'] = 1; // 制造机要 8，加起来 16 > 8
    core.random = AI_OK;

    const report = core.tick(1);
    // 制造机的优先级比采矿机低，被整组停掉
    expect(report.sheddedKinds).toEqual(['machine']);
    expect(core.coins[0]!.toString()).toBe('0');
    // 采矿机满速继续跑，而不是两边都减半
    expect(report.oreGained[0]!.toString()).toBe('0.5');
    expect(report.powerRatio).toBe(1);
  });

  it('关掉开关就退回全厂等比降载', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.siliconShedding = false;
    core.pollutionEnabled = false;
    core.maxTier = 1;
    core.ores[0] = dec('1e9');
    core.counts['g-ulv'] = 1;
    core.counts['m-1'] = 1;
    core.counts['c-1'] = 1;
    core.random = AI_OK;

    const report = core.tick(1);
    expect(report.sheddedKinds).toEqual([]);
    // 需求 10（采矿机 2 + 制造机 8），只发 8 → 0.8
    expect(report.powerRatio).toBeCloseTo(0.8, 6);
  });

  it('AI 误判时停错组，下一拍自己纠正', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.pollutionEnabled = false;
    core.maxTier = 1;
    core.ores[0] = dec('1e9');
    core.counts['g-ulv'] = 1;
    core.counts['m-1'] = 1;
    core.counts['c-1'] = 1;

    core.random = AI_MISFIRE;
    const misjudged = core.tick(1).sheddedKinds;
    // 误判那次不保证停的是制造机；至少不该什么都停，而且一定停了一组
    expect(misjudged.length).toBeGreaterThan(0);

    core.random = AI_OK;
    expect(core.tick(1).sheddedKinds).toEqual(['machine']);
  });
});

describe('硅基宇宙：开关与存档', () => {
  it('没有硅基宇宙时三个功能都不生效', () => {
    const core = new GameCore();
    core.maxTier = 1;
    core.ores[0] = dec('1e9');
    core.counts['g-ulv'] = 1;
    core.counts['m-1'] = 1;
    core.counts['c-1'] = 1;
    core.faults['m-1'] = 1;
    core.random = AI_OK;

    const report = core.tick(1);
    expect(report.sheddedKinds).toEqual([]);
    expect(report.autoRepairs).toBe(0);
    expect(core.faultyCountOf('m-1')).toBe(1);
  });

  it('三个开关跟着存档走', () => {
    const core = new GameCore();
    core.universes = ['silicon'];
    core.siliconAutoRepair = false;
    core.siliconAutoOverclock = true;
    core.siliconShedding = false;
    const restored = deserialize(serialize(core));
    expect(restored.siliconAutoRepair).toBe(false);
    expect(restored.siliconAutoOverclock).toBe(true);
    expect(restored.siliconShedding).toBe(false);
  });

  it('硅基宇宙本身可以建起来：转生选它之后 hasUniverse 为真', () => {
    const core = new GameCore();
    core.addUniverse('silicon');
    expect(core.hasUniverse('silicon')).toBe(true);
    // 灵气节点、腐蚀抑制器这类别的宇宙专属机型不受影响
    core.maxTier = 1;
    core.coins[0] = dec('1e9');
    expect(core.buy(modelById('n-1'), 1)).toBe(0);
  });
});
