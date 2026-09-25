import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { modelById } from '../src/game/models';
import {
  corrosionPerSecond,
  pollutionDriveFactor,
  suppressionOfTier,
  suppressionPoints,
} from '../src/numeric/abyss';
import { dec } from '../src/numeric/decimal';

// 深渊宇宙：污染把产出往上推，代价是腐蚀机器；腐蚀抑制器按等级抵消污染点数。
describe('深渊宇宙', () => {
  it('腐蚀只算「超出 30 点、又没被抑制器抵消」的那部分', () => {
    // 污染 70、没有抑制 → 40 点有效 → 每台每秒 40 × 0.000005 = 0.0002
    expect(corrosionPerSecond('70', '0').toString()).toBe('0.0002');
    // 抑制器抵消 15 点 → 25 点有效
    expect(corrosionPerSecond('70', '15').toString()).toBe('0.000125');
    // 抵消够多就没有腐蚀
    expect(corrosionPerSecond('55', '30').toString()).toBe('0');
    // 没超过中性点也不腐蚀
    expect(corrosionPerSecond('30', '0').toString()).toBe('0');
  });

  it('污染驱动产出：30% 中性，每 1 点污染 ±1%（只属于深渊）', () => {
    expect(pollutionDriveFactor('30').toString()).toBe('1');
    expect(pollutionDriveFactor('0').toString()).toBe('0.7');
    expect(pollutionDriveFactor('70').toString()).toBe('1.4');
    expect(pollutionDriveFactor('100').toString()).toBe('1.7');
  });

  it('抑制器按等级抵消污染点数', () => {
    expect(suppressionOfTier(3).toString()).toBe('15');
    expect(suppressionOfTier(14).toString()).toBe('70');
    expect(suppressionPoints([{ tier: 3, count: 2 }]).toString()).toBe('30');
    expect(suppressionPoints([]).toString()).toBe('0');
  });

  it('抑制器是深渊宇宙专属：没有宇宙时买不到', () => {
    const core = new GameCore();
    core.coins[0] = dec('1e9');
    core.ores[0] = dec('1e9');
    expect(core.buy(modelById('s-1'), 1, 'coin')).toBe(0);

    core.universes = ['abyss'];
    expect(core.buy(modelById('s-1'), 1, 'coin')).toBe(1);
  });

  it('污染推高产出，抑制器为 0 时污染点全部算腐蚀', () => {
    const core = new GameCore();
    core.universes = ['abyss'];
    core.ores[0] = dec('1e6');
    core.counts['c-1'] = 1;
    core.counts['g-ulv'] = 1;
    core.pollution = dec('70');

    const report = core.tick(1);
    // 产出倍率 ×1.4（污染 70），电照常在普通结算里走
    // 这一拍机器自己也会涨一点污染，所以倍率略高于 1.4
    expect(Number(report.outputMultiplier.toString())).toBeCloseTo(1.4, 4);
    expect(Number(core.coins[0]!.toString())).toBeCloseTo(1.4, 4);
    expect(report.suppression.toString()).toBe('0');
  });

  it('污染高到一定程度，成批的机器会被腐蚀坏', () => {
    const core = new GameCore();
    core.universes = ['abyss'];
    core.ores[0] = dec('1e6');
    core.counts['m-1'] = 4000; // 台数够多，才能看出概率
    core.counts['g-ulv'] = 200;
    core.pollution = dec('100'); // 有效 70 点 → 每台每秒 0.00035
    core.random = () => 0.5; // 固定随机源，抽样结果可复现

    const report = core.tick(1);
    expect(report.corrosionFaults).toBeGreaterThan(0);
    expect(core.faultyCountOf('m-1')).toBe(report.corrosionFaults);
  });

  it('建上抑制器之后机器就不再被啃', () => {
    const core = new GameCore();
    core.universes = ['abyss'];
    core.ores[0] = dec('1e6');
    core.counts['c-1'] = 1;
    core.counts['g-ulv'] = 40;
    core.counts['s-3'] = 1; // MV 抑制器抵消 15 点
    core.maxTier = 3;
    core.pollution = dec('40'); // 有效点数 40-30-15 = -5 → 不腐蚀
    core.random = () => 0;

    const report = core.tick(1);
    expect(report.suppression.toString()).toBe('15');
    expect(report.corrosionPerSecond.toString()).toBe('0');
    expect(report.corrosionFaults).toBe(0);
    expect(core.faults).toEqual({});
  });

  it('污染机制关掉时腐蚀也不生效', () => {
    const core = new GameCore();
    core.universes = ['abyss'];
    core.pollutionEnabled = false;
    core.ores[0] = dec('1e6');
    core.counts['c-1'] = 1;
    core.pollution = dec('90');
    core.random = () => 0;

    const report = core.tick(1);
    expect(report.corrosionFaults).toBe(0);
    expect(report.outputMultiplier.toString()).toBe('1');
  });

  it('只拥有奥术时不吃污染驱动，同时拥有时才由深渊这一条生效', () => {
    const arcaneOnly = new GameCore();
    arcaneOnly.universes = ['arcane'];
    arcaneOnly.ores[0] = dec('1e6');
    arcaneOnly.counts['c-1'] = 1;
    arcaneOnly.counts['n-1'] = 1;
    arcaneOnly.essentia = dec('100');
    arcaneOnly.pollution = dec('70');
    arcaneOnly.tick(1);
    // 只有奥术：0.5（减半）× 0.6（重度污染惩罚）= 0.3
    expect(Number(arcaneOnly.coins[0]!.toString())).toBeCloseTo(0.3, 3);

    const both = new GameCore();
    both.universes = ['arcane', 'abyss'];
    both.ores[0] = dec('1e6');
    both.counts['c-1'] = 1;
    both.counts['n-1'] = 1;
    both.essentia = dec('100');
    both.pollution = dec('70');
    both.tick(1);
    // 两个宇宙都有：0.5（减半）× 1.4（深渊的污染驱动）= 0.7，只算一次
    expect(Number(both.coins[0]!.toString())).toBeCloseTo(0.7, 3);
  });
});
