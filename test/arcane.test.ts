import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { modelById } from '../src/game/models';
import {
  arcaneOutputBonus,
  essentiaFromPurify,
  nodeEssentiaDemand,
  nodeOutputFactor,
  nodeVisPerSecond,
  visPerMachine,
} from '../src/numeric/arcane';
import { ARCANE_MACHINE_FACTOR, ARCANE_TO_TIER, modelsOf } from '../src/game/models';
import { dec } from '../src/numeric/decimal';

// 奥术宇宙：多一条灵气路线（魔法机器），灵气越充裕全厂产量越高；
// 源质由净化器副产，用来把灵气节点喂满。
describe('奥术宇宙', () => {
  it('灵气产量与发电机同级同强度，节点每秒吃 1 源质', () => {
    expect(nodeVisPerSecond(1).toString()).toBe('8');
    expect(nodeVisPerSecond(8).toString()).toBe('131072'); // 8 × 4^7
    expect(nodeEssentiaDemand('3').toString()).toBe('3');
    // 净化 1%/秒 → 1000 源质/秒
    expect(essentiaFromPurify('0.0072').toString()).toBe('7.2');
  });

  it('魔法机器的灵气需求按「本级 1A」算，采矿机吃 1/4', () => {
    expect(visPerMachine(1).toString()).toBe('8');
    expect(visPerMachine(2).toString()).toBe('32');
    expect(visPerMachine(5).toString()).toBe('2048');
    // 节点产量就是该等级的 1A
    expect(nodeVisPerSecond(5).toString()).toBe(visPerMachine(5).toString());
  });

  it('源质喂满出力翻倍，没有源质只出一半', () => {
    expect(nodeOutputFactor('10', '10').toString()).toBe('1');
    expect(nodeOutputFactor('5', '10').toString()).toBe('0.75');
    expect(nodeOutputFactor('0', '10').toString()).toBe('0.5');
    expect(nodeOutputFactor('0', '0').toString()).toBe('1');
  });

  it('灵气充裕度的产量加成：普通机器最多 +10%，魔法机器最多 +30%', () => {
    expect(arcaneOutputBonus('0', false).toString()).toBe('1');
    expect(arcaneOutputBonus('1', false).toString()).toBe('1.1');
    expect(arcaneOutputBonus('0.5', false).toString()).toBe('1.05');
    expect(arcaneOutputBonus('0', true).toString()).toBe('1');
    expect(arcaneOutputBonus('1', true).toString()).toBe('1.3');
    expect(arcaneOutputBonus('0.5', true).toString()).toBe('1.15');
    // 超出 1 按 1 算
    expect(arcaneOutputBonus('3', true).toString()).toBe('1.3');
  });

  it('魔法机器只在奥术宇宙、只在 LV~LuV 里有', () => {
    const tiers = new Set(modelsOf('miner').filter((m) => m.visPowered).map((m) => m.tier));
    expect([...tiers].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(ARCANE_TO_TIER).toBe(7);
    // ZPM（tier 8）及以后没有魔法机器
    expect(modelsOf('miner').some((m) => m.visPowered && m.tier >= 8)).toBe(false);
    // 三类里各有一台 LV 魔法机器，且同价（成本系数与电力版一致）
    for (const kind of ['miner', 'generator', 'machine'] as const) {
      const magic = modelsOf(kind).find((m) => m.tier === 2 && m.visPowered);
      expect(magic, `${kind} 缺魔法机型`).toBeTruthy();
      expect(magic!.outputFactor).toBe(ARCANE_MACHINE_FACTOR);
      expect(magic!.costFactor).toBe('1');
    }
  });

  it('魔法机器是奥术宇宙专属：没有宇宙时买不到', () => {
    const core = new GameCore();
    core.maxTier = 3;
    core.coins[0] = dec('1e9'); // 买 LV 机型用 ULV 币
    core.ores[0] = dec('1e9');
    expect(core.buy(modelById('mc-2'), 1, 'coin')).toBe(0);
    core.universes = ['arcane'];
    expect(core.buy(modelById('mc-2'), 1, 'coin')).toBe(1);
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

  it('收回宇宙之后，已经建好的魔法机器停摆', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.pollutionEnabled = false;
    core.maxTier = 2;
    core.ores[1] = dec('1e6');
    core.counts['mc-2'] = 1;
    core.counts['n-2'] = 1;
    core.essentia = dec('1000');

    core.tick(1);
    expect(core.coins[1]!.gt(0)).toBe(true); // 有宇宙时正常产币

    core.universes = [];
    core.coins[1] = dec('0');
    core.tick(1);
    expect(core.coins[1]!.toString()).toBe('0'); // 没宇宙就不干了
  });

  it('魔法机器吃灵气：没节点就停摆，节点喂满就按 2.5 倍产出', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.pollutionEnabled = false; // 这条只测灵气结算，先把污染倍率关掉
    core.maxTier = 2;
    core.ores[1] = dec('1e6');
    core.counts['mc-2'] = 1; // LV 魔法制造机

    // 要 32 灵气/秒（本级 1A），没节点 → 全停
    let report = core.tick(1);
    expect(report.arcanePlenty.toString()).toBe('0');
    expect(core.coins[1]!.toString()).toBe('0');

    // 建一台 LV 灵气节点（32 灵气/秒）：没有源质只出一半 → 半速跑
    core.counts['n-2'] = 1;
    report = core.tick(1);
    expect(report.visProduced.toString()).toBe('16');
    expect(report.arcanePlenty.toString()).toBe('0.5');
    // 基础 4 × 2.5（魔法机器）× 0.5（只喂到一半）× 1.15（+30% 的一半）
    expect(core.coins[1]!.toSignificantDigits(4).toString()).toBe('5.75');

    // 补上源质 → 节点满出力，满速跑
    core.essentia = dec('100');
    core.coins[1] = dec('0');
    report = core.tick(1);
    expect(report.visProduced.toString()).toBe('32');
    expect(report.arcanePlenty.toString()).toBe('1');
    // 4 × 2.5 × 1 × 1.3（灵气喂满 +30%）
    expect(core.coins[1]!.toSignificantDigits(4).toString()).toBe('13');
  });

  it('奥术宇宙里普通机器照常吃电工作，不再被扣 50%', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.pollutionEnabled = false;
    core.ores[0] = dec('1e6');
    core.counts['g-ulv'] = 1;
    core.counts['c-1'] = 1;
    core.tick(1);
    expect(core.coins[0]!.toString()).toBe('1');
  });

  it('同样的电压下，魔法机器产出是电力机器的 2.5 倍（再叠加灵气加成）', () => {
    const power = new GameCore();
    power.maxTier = 2;
    power.ores[1] = dec('1e6');
    power.coins[0] = dec('1e6');
    power.counts['g-lv-steam'] = 1;
    power.counts['c-2'] = 1;
    power.pollutionEnabled = false;
    power.tick(1);
    expect(power.coins[1]!.toString()).toBe('4'); // LV 制造机的基础产出

    const magic = new GameCore();
    magic.universes = ['arcane'];
    magic.maxTier = 2;
    magic.ores[1] = dec('1e6');
    magic.counts['mc-2'] = 1;
    magic.counts['n-2'] = 1;
    magic.essentia = dec('1000');
    magic.pollutionEnabled = false;
    magic.tick(1);

    // 产能倍率记在机型上：魔法版 2.5 倍，成本系数和电力版一样
    expect(modelById('mc-2').outputFactor).toBe(ARCANE_MACHINE_FACTOR);
    expect(modelById('mc-2').costFactor).toBe(modelById('c-2').costFactor);
    // 4 × 2.5（魔法机器）× 1.3（灵气喂满 +30%）
    expect(magic.coins[1]!.toSignificantDigits(4).toString()).toBe('13');
  });

  it('净化器副产源质，够喂自己的同时还多出来', () => {
    const core = new GameCore();
    core.universes = ['arcane'];
    core.maxTier = 3; // 净化器从 LV 起就有，这里用 MV 那台
    core.counts['p-3'] = 1; // MV 净化器：净化 3×0.0064 = 0.0192 %/秒
    expect(core.purifyPerSecond().toString()).toBe('0.0192');

    core.essentia = dec('0');
    const report = core.tick(1);
    // 每秒凝出 19.2 源质，节点需求 0 → 全部存起来
    expect(report.essentiaProduced.toString()).toBe('19.2');
    expect(core.essentia.toString()).toBe('19.2');
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
