import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import {
  LAYER_COST,
  REBIRTH_NODES,
  canBuyNode,
  minerSpeedMultiplier,
} from '../src/game/rebirth';
import { modelById } from './helpers';
import { arcaneOutputBonus } from '../src/numeric/arcane';
import { pollutionDriveFactor } from '../src/numeric/abyss';
import { dec } from '../src/numeric/decimal';

// 时空星图（加成树二期，docs/转生拓展大纲.md M1）：
// 六条支线 33 个节点，放射布局；宇宙支线要拥有对应宇宙才能买。

describe('时空星图：树数据', () => {
  it('六条支线共 33 个节点，id 唯一、前置都存在', () => {
    expect(REBIRTH_NODES.length).toBe(33);
    const ids = new Set(REBIRTH_NODES.map((node) => node.id));
    expect(ids.size).toBe(33);
    for (const node of REBIRTH_NODES) {
      for (const parentId of node.requires) {
        expect(ids.has(parentId), `${node.id} 的前置 ${parentId} 应存在`).toBe(true);
      }
    }
  });

  it('层价格是 1 / 2 / 6 / 12；全树毕业价 186 条', () => {
    expect(LAYER_COST).toEqual({ 1: '1', 2: '2', 3: '6', 4: '12' });
    const total = REBIRTH_NODES.reduce((sum, node) => sum.plus(dec(node.cost)), dec('0'));
    expect(total.toString()).toBe('186');
  });

  it('宇宙支线四个节点都挂着对应的宇宙门控，其他支线没有', () => {
    const universeNodes = REBIRTH_NODES.filter((node) => node.branch === 'universe');
    expect(universeNodes.map((node) => node.requireUniverse)).toEqual([
      'industry',
      'arcane',
      'abyss',
      'silicon',
    ]);
    for (const node of REBIRTH_NODES) {
      if (node.branch !== 'universe') expect(node.requireUniverse).toBeUndefined();
    }
  });

  it('画布上的坐标都在 960×960 之内，根在正中心', () => {
    for (const node of REBIRTH_NODES) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(960);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(960);
    }
  });
});

describe('时空星图：宇宙门控', () => {
  it('没有对应宇宙时宇宙节点买不了，有了就能买（线缆与前置都够的前提下）', () => {
    const node = REBIRTH_NODES.find((n) => n.id === 'universe-1')!;
    expect(canBuyNode([], node, dec('100'), [])).toBe(false);
    expect(canBuyNode([], node, dec('100'), ['industry'])).toBe(true);
    // 老节点不受门控影响
    const plain = REBIRTH_NODES.find((n) => n.id === 'speed-1')!;
    expect(canBuyNode([], plain, dec('1'), [])).toBe(true);
  });

  it('core.canBuyRebirthNode 走同一套门控', () => {
    const core = new GameCore();
    core.cables = dec('100');
    expect(core.canBuyRebirthNode('universe-1')).toBe(false);
    core.universes = ['industry'];
    expect(core.canBuyRebirthNode('universe-1')).toBe(true);
  });
});

describe('时空星图：加成生效', () => {
  function coreWithNodes(ids: string[]): GameCore {
    const core = new GameCore();
    core.rebirthNodes = ids;
    return core;
  }

  it('发电能力 +5% 乘在额定出力上', () => {
    const model = modelById('g-ulv');
    const base = coreWithNodes([]);
    const boosted = coreWithNodes(['power-1']);
    base.counts['g-ulv'] = 2;
    boosted.counts['g-ulv'] = 2;
    expect(boosted.generatorOutputRated(model).div(base.generatorOutputRated(model)).toString()).toBe(
      '1.05',
    );
  });

  it('全厂耗电 -4% 乘在机器耗电上', () => {
    const model = modelById('m-1');
    const base = coreWithNodes([]);
    const boosted = coreWithNodes(['power-2']);
    base.counts['m-1'] = 3;
    boosted.counts['m-1'] = 3;
    expect(boosted.minerEnergyDrain(model).div(base.minerEnergyDrain(model)).toString()).toBe(
      '0.96',
    );
  });

  it('存电容量 +20% 乘在总容量上', () => {
    const base = coreWithNodes([]);
    const boosted = coreWithNodes(['power-3']);
    base.counts['b-3'] = 1;
    boosted.counts['b-3'] = 1;
    expect(boosted.batteryCapacity().div(base.batteryCapacity()).toString()).toBe('1.2');
  });

  it('降载缓冲：缺电缺口减半，但停电整厂停摆不变、供电率读数不变', () => {
    // 污染产生速率 = 额定速率 × 这一拍的负载比例，用它旁证产出侧的缓冲：
    // 满载 = 全额，缺电 = 0，缺电 + 缓冲 = 50%，停电 + 缓冲 = 0。
    function rig(nodes: string[], withSupply = false, outage = false): GameCore {
      const core = coreWithNodes(nodes);
      core.maxTier = 1;
      core.counts['m-1'] = 1; // 只有耗电：缺电
      if (withSupply) {
        core.counts['g-ulv'] = 1;
        core.ores[0] = dec('1000'); // 发电机要有矿可烧才发得出电
      }
      if (outage) core.outageSeconds = 5;
      core.tick(1);
      return core;
    }
    // 采矿机（1 级 × 1 台）的额定污染 = 1 × 0.0008 = 0.0008 %/秒；
    // 缓冲把产出比例从 0 抬到 0.5，所以污染速率是 0.0004。
    expect(rig([], true).pollutionPerSecond().gt(0)).toBe(true); // 有电时确实在干活
    expect(rig([]).pollutionPerSecond().toString()).toBe('0'); // 缺电无缓冲：不干活
    expect(rig(['power-4']).pollutionPerSecond().toString()).toBe('0.0004'); // 缓冲后按 50% 负载干活
    expect(rig(['power-4'], false, true).pollutionPerSecond().toString()).toBe('0'); // 停电不受缓冲
    expect(rig(['power-4']).lastReport.powerRatio).toBe(0); // 供电率读数保持真实
  });

  it('污染产生 -8%、净化效果 +10%、腐蚀损伤 -25%', () => {
    const base = coreWithNodes([]);
    const boosted = coreWithNodes(['stable-1']);
    base.counts['m-1'] = 1;
    boosted.counts['m-1'] = 1;
    expect(boosted.pollutionPerSecond().div(base.pollutionPerSecond()).toString()).toBe('0.92');

    const purifierBase = coreWithNodes([]);
    const purifierBoosted = coreWithNodes(['stable-2']);
    purifierBase.maxTier = 2;
    purifierBoosted.maxTier = 2;
    purifierBase.counts['p-2'] = 1;
    purifierBoosted.counts['p-2'] = 1;
    expect(
      purifierBoosted.purifyPerSecond().div(purifierBase.purifyPerSecond()).toString(),
    ).toBe('1.1');

    const corroded = coreWithNodes([]);
    const shielded = coreWithNodes(['stable-4']);
    for (const core of [corroded, shielded]) {
      core.pollutionEnabled = true;
      core.pollution = dec('80');
    }
    expect(shielded.corrosionPerSecond().div(corroded.corrosionPerSecond()).toString()).toBe(
      '0.75',
    );
  });

  it('故障率 -10%：界面读数 faultFactor = 0.9', () => {
    const core = coreWithNodes(['stable-3']);
    expect(core.faultFactor().toString()).toBe('0.9');
    expect(coreWithNodes([]).faultFactor().toString()).toBe('1');
  });

  it('工业·并联加深：边际增长 1.05 → 1.04；没有工业宇宙时不生效', () => {
    const core = coreWithNodes(['universe-1']);
    expect(core.marginalGrowth()).toBe('1.07'); // 没带工业宇宙，加深无从谈起
    core.universes = ['industry'];
    expect(core.marginalGrowth()).toBe('1.04');
    const plain = coreWithNodes([]);
    plain.universes = ['industry'];
    expect(plain.marginalGrowth()).toBe('1.05');
  });

  it('奥术·充裕上限：加成上限 +10 个百分点', () => {
    expect(arcaneOutputBonus('1', false).toString()).toBe('1.1');
    expect(arcaneOutputBonus('1', false, '0.1').toString()).toBe('1.2');
    expect(arcaneOutputBonus('1', true).toString()).toBe('1.3');
    expect(arcaneOutputBonus('1', true, '0.1').toString()).toBe('1.4');
  });

  it('深渊·中性点：30% 移到 25%，倍率曲线整体上移', () => {
    expect(pollutionDriveFactor('30').toString()).toBe('1');
    expect(pollutionDriveFactor('30', '5').toString()).toBe('1.05');
    expect(pollutionDriveFactor('0', '5').toString()).toBe('0.75');
  });

  it('硅基·误判率：5% → 2%', () => {
    expect(coreWithNodes([]).siliconMisjudgeChance()).toBe(0.05);
    expect(coreWithNodes(['universe-4']).siliconMisjudgeChance()).toBe(0.02);
  });

  it('同支线多层叠加：采矿机速度 = 全厂 4% + 三格 12% = +16%', () => {
    const core = coreWithNodes(['speed-1', 'speed-2a', 'speed-3a', 'speed-4a']);
    expect(minerSpeedMultiplier(core.rebirthNodes).toString()).toBe('1.16');
  });
});
