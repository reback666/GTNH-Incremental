import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { modelById } from '../src/game/models';
import {
  arcanePollutionFactor,
  essentiaFromPurify,
  nodeEssentiaDemand,
  nodeOutputFactor,
  nodeVisPerSecond,
} from '../src/numeric/arcane';
import { dec } from '../src/numeric/decimal';

// 奥术宇宙：机器改吃灵气，产量减半、故障归零；源质由净化器副产，用来把灵气节点喂满。
describe('奥术宇宙', () => {
  it('灵气产量与发电机同级同强度，节点每秒吃 1 源质', () => {
    expect(nodeVisPerSecond(1).toString()).toBe('8');
    expect(nodeVisPerSecond(8).toString()).toBe('131072'); // 8 × 4^7
    expect(nodeEssentiaDemand('3').toString()).toBe('3');
    // 净化 1%/秒 → 1000 源质/秒
    expect(essentiaFromPurify('0.0072').toString()).toBe('7.2');
  });

  it('源质喂满出力翻倍，没有源质只出一半', () => {
    expect(nodeOutputFactor('10', '10').toString()).toBe('1');
    expect(nodeOutputFactor('5', '10').toString()).toBe('0.75');
    expect(nodeOutputFactor('0', '10').toString()).toBe('0.5');
    expect(nodeOutputFactor('0', '0').toString()).toBe('1');
  });

  it('灵气机器吃污染：30% 中性，每 1 点污染 ±1%', () => {
    expect(arcanePollutionFactor('30').toString()).toBe('1');
    expect(arcanePollutionFactor('0').toString()).toBe('0.7');
    expect(arcanePollutionFactor('70').toString()).toBe('1.4');
    expect(arcanePollutionFactor('100').toString()).toBe('1.7');
  });

  it('污染越高灵气机器产量越高，且不吃普通那套 -20% / -40% 惩罚', () => {
    const clean = new GameCore();
    clean.universes = ['arcane'];
    clean.ores[0] = dec('1000');
    clean.counts['c-1'] = 1;
    clean.counts['n-1'] = 1;
    clean.essentia = dec('100');
    clean.pollution = dec('30');
    clean.tick(1);
    // 减半后 0.5，污染刚好在中性点；这一拍机器自己也会涨一点污染，所以留一点误差
    expect(Number(clean.coins[0]!.toString())).toBeCloseTo(0.5, 4);

    const dirty = new GameCore();
    dirty.universes = ['arcane'];
    dirty.ores[0] = dec('1000');
    dirty.counts['c-1'] = 1;
    dirty.counts['n-1'] = 1;
    dirty.essentia = dec('100');
    dirty.pollution = dec('70'); // 普通宇宙这里会 -20%，奥术宇宙这里 +40%
    dirty.tick(1);
    expect(Number(dirty.coins[0]!.toString())).toBeCloseTo(0.7, 4);
  });

  it('灵气节点是奥术宇宙专属：没有宇宙时买不到', () => {
    const core = new GameCore();
    core.coins[0] = dec('1e9');
    core.ores[0] = dec('1e9');
    expect(core.buy(modelById('n-1'), 1, 'coin')).toBe(0);
    expect(core.canAfford(modelById('n-1'))).toBe(false);

    core.universes = ['arcane'];
    expect(core.buy(modelById('n-1'), 1, 'coin')).toBe(1);
  });

  it('没有节点时机器停摆；有节点时机器吃灵气、产量减半', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.pollutionEnabled = false; // 这条只测灵气结算，先把污染倍率关掉
    core.ores[0] = dec('1000');
    core.counts['c-1'] = 1;

    // 一台 ULV 制造机要 8 灵气/秒，没节点 → 全停
    let report = core.tick(1);
    expect(report.powerRatio).toBe(0);
    expect(core.coins[0]!.toString()).toBe('0');

    // 建一台 ULV 灵气节点（8 灵气/秒）：没有源质 → 只出 4 → 只能跑到一半
    core.counts['n-1'] = 1;
    report = core.tick(1);
    expect(report.visProduced.toString()).toBe('4');
    expect(report.powerRatio).toBeCloseTo(0.5, 6);
    // 产量 = 基础 1 × 降载 0.5 × 奥术系数 0.5
    expect(core.coins[0]!.toString()).toBe('0.25');

    // 补上源质库存 → 节点满出力，产量回到「减半后」的水平
    core.essentia = dec('100');
    core.coins[0] = dec('0');
    report = core.tick(1);
    expect(report.visProduced.toString()).toBe('8');
    expect(report.powerRatio).toBe(1);
    expect(core.coins[0]!.toString()).toBe('0.5');
  });

  it('净化器副产源质，够喂自己的同时还多出来', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.maxTier = 3; // 净化器从 MV 起才有
    core.counts['p-3'] = 1; // MV 净化器：净化 3×0.0024 = 0.0072 %/秒
    expect(core.purifyPerSecond().toString()).toBe('0.0072');

    core.essentia = dec('0');
    const report = core.tick(1);
    // 每秒凝出 7.2 源质，节点需求 0 → 全部存起来
    expect(report.essentiaProduced.toString()).toBe('7.2');
    expect(core.essentia.toString()).toBe('7.2');
  });

  it('奥术宇宙里超频不会故障', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.ores[0] = dec('1000');
    core.maxTier = 1;
    core.counts['m-1'] = 10;
    core.counts['n-1'] = 20;
    core.setOverclock('m-1', 3);
    core.random = () => 0; // 平时这一拍必坏

    core.tick(600);
    expect(core.faults).toEqual({});
  });

  it('存档往返保留源质', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.essentia = dec('123.5');
    const restored = deserialize(serialize(core));
    expect(restored.essentia.toString()).toBe('123.5');
    expect(restored.universes).toEqual(['arcane']);
    expect(serialize(restored)).toEqual(serialize(core));
  });
});
