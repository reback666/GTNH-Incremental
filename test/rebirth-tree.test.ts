import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import {
  LAYER_COST,
  REBIRTH_NODES,
  canBuyNode,
  minerSpeedMultiplier,
  REBIRTH_CANVAS_SIZE,
  effectTotal,
} from '../src/game/rebirth';
import { modelById } from './helpers';
import { arcaneOutputBonus } from '../src/numeric/arcane';
import { pollutionDriveFactor } from '../src/numeric/abyss';
import { dec } from '../src/numeric/decimal';

// 时空星图（加成树二期，docs/redesign-plan.md M1）：
// 九条支线 51 个节点，放射布局；宇宙支线要拥有对应宇宙才能买。

describe('时空星图：树数据', () => {
  it('九条支线共 51 个节点，id 唯一、前置都存在', () => {
    expect(REBIRTH_NODES.length).toBe(51);
    const ids = new Set(REBIRTH_NODES.map((node) => node.id));
    expect(ids.size).toBe(51);
    for (const node of REBIRTH_NODES) {
      for (const parentId of node.requires) {
        expect(ids.has(parentId), `${node.id} 的前置 ${parentId} 应存在`).toBe(true);
      }
    }
  });

  it('层价格是 1 / 2 / 6 / 12；全树毕业价 289 条', () => {
    expect(LAYER_COST).toEqual({ 1: '1', 2: '2', 3: '6', 4: '12' });
    const total = REBIRTH_NODES.reduce((sum, node) => sum.plus(dec(node.cost)), dec('0'));
    expect(total.toString()).toBe('289');
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

  it('每个节点的任务图标都指向存在的机型贴图（缺图界面会静默变空）', () => {
    for (const node of REBIRTH_NODES) {
      const icon = node.icon;
      if (icon.kind !== 'model') continue;
      const file = new URL(`../src/assets/machines/${icon.id}.png`, import.meta.url);
      expect(existsSync(file), ` -> ${icon.id}`).toBe(true);
    }
  });

  it('画布上的坐标都在画布之内', () => {
    for (const node of REBIRTH_NODES) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(REBIRTH_CANVAS_SIZE);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(REBIRTH_CANVAS_SIZE);
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
  it('加成缓存跟随原地购买、撤销与等长替换更新，重复节点不叠加', () => {
    const owned: string[] = [];
    expect(minerSpeedMultiplier(owned).toString()).toBe('1');
    owned.push('speed-1', 'speed-2a');
    expect(minerSpeedMultiplier(owned).toString()).toBe('1.08');
    owned[1] = 'speed-2b';
    expect(minerSpeedMultiplier(owned).toString()).toBe('1.04');
    expect(effectTotal(owned, 'machineSpeed').toString()).toBe('0.04');
    owned.push('speed-1');
    expect(effectTotal(owned, 'allMachineSpeed').toString()).toBe('0.04');
    owned.length = 0;
    expect(minerSpeedMultiplier(owned).toString()).toBe('1');
  });
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
    // 缓冲抬到 50% 负载，再乘 ULV 起步低排放系数 0.05。
    expect(rig([], true).pollutionPerSecond().gt(0)).toBe(true); // 有电时确实在干活
    expect(rig([]).pollutionPerSecond().toString()).toBe('0'); // 缺电无缓冲：不干活
    expect(rig(['power-4']).pollutionPerSecond().toString()).toBe('0.00002'); // 缓冲后按 50% 负载干活
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
  it('采掘·手动挖矿产量 +25%/层，镐子升级价格 -8%/层', () => {
    const base = coreWithNodes([]);
    const one = coreWithNodes(['mining-1']);
    const two = coreWithNodes(['mining-1', 'mining-2a', 'mining-3a']);
    base.maxTier = 3;
    one.maxTier = 3;
    two.maxTier = 3;
    for (const c of [base, one, two]) {
      c.pickaxeCollect = 5;
      c.pickaxeBlast = 5;
      c.pickaxeVajra = 3;
      c.unlockedVeins = [0, 1, 2, 3];
    }
    expect(one.pickaxeOutput().div(base.pickaxeOutput()).toString()).toBe('1.25');
    expect(two.pickaxeOutput().div(base.pickaxeOutput()).toString()).toBe('1.75');
    expect(one.pickaxeUpgradeCostOf('vajra').div(base.pickaxeUpgradeCostOf('vajra')).toString()).toBe('1');
    const costNode = coreWithNodes(['mining-1', 'mining-2b', 'mining-3b']);
    costNode.maxTier = 3;
    costNode.pickaxeVajra = 3;
    const full = base.pickaxeUpgradeCostOf('vajra');
    expect(costNode.pickaxeUpgradeCostOf('vajra').toString()).toBe(full.times('0.84').floor().toString());
  });

  it('电网·断电概率 -20%/层，黑市抽成 -20%/层', () => {
    const outageCore = coreWithNodes(['grid-1', 'grid-3']);
    expect(outageCore.outageFactor().toString()).toBe('0.6');
    const siphonCore = coreWithNodes(['grid-2', 'grid-4']);
    expect(siphonCore.siphonFactor().toString()).toBe('0.6');
  });

  it('时序·MAX 线缆结算 +5%/层，叠加后再乘普朗克锚', () => {
    const base = coreWithNodes([]);
    const one = coreWithNodes(['timeline-1']);
    const three = coreWithNodes(['timeline-1', 'timeline-2a', 'timeline-3a']);
    for (const c of [base, one, three]) {
      c.maxTier = 15;
      c.runEU = dec('1e40');
      c.rebirthCount = 0;
    }
    const baseC = base.maxRouteCables()!;
    expect(one.maxRouteCables()!.toString()).toBe(baseC.times('1.05').floor().toString());
    const settled = baseC.times('1.15').floor();
    expect(three.maxRouteCables()!.toString()).toBe(settled.toString());
    three.planckAnchor = true;
    expect(three.maxRouteCables()!.toString()).toBe(settled.times('1.5').floor().toString());
  });

  it('时序·离线补算上限 24h + 累计小时', () => {
    const base = coreWithNodes([]);
    const two = coreWithNodes(['timeline-1', 'timeline-2b', 'timeline-3b']);
    expect(base.offlineCapSeconds()).toBe(24 * 3600);
    expect(two.offlineCapSeconds()).toBe((24 + 12) * 3600);
  });
});
