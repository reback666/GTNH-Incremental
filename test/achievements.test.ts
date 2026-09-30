import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { MACHINE_MODELS } from '../src/game/models';
import { dec } from '../src/numeric/decimal';

// 成就：条件成立那一拍记下达成时间，跨周目保留。
function unlocked(core: GameCore): string[] {
  return Object.keys(core.achieved);
}

describe('成就', () => {
  it('开局一条都没有，手动挖满 10 次后达成', () => {
    const core = new GameCore();
    expect(unlocked(core)).toEqual([]);

    for (let i = 0; i < 10; i += 1) core.manualMine();
    core.tick(1);
    // 达成时间记的是那一拍的游戏内秒数
    expect(core.achieved['first-swing']).toBe(1);
  });

  it('建机器 / 发电机 / 采矿机各自解锁一条', () => {
    const core = new GameCore();
    core.ores[0] = dec('1e9');
    core.coins[0] = dec('1e9');
    core.buy(modelOf('c-1'), 1, 'ore');
    core.buy(modelOf('g-ulv'), 1, 'ore');
    core.buy(modelOf('m-1'), 1, 'ore');
    core.tick(1);

    expect(core.achieved['first-machine']).toBeDefined();
    expect(core.achieved['first-power']).toBeDefined();
    expect(core.achieved['first-miner']).toBeDefined();
    expect(core.builtMachines).toBe(3);
  });

  it('解锁电压、超频、维护、换电网、研究、转生、加成节点都会记一笔', () => {
    const core = new GameCore();
    core.coins[0] = dec('1e30');
    core.unlock(2);
    core.tick(1);
    expect(core.achieved['leave-ulv']).toBeDefined();
    expect(core.peakTier).toBe(2);

    core.counts['m-1'] = 1;
    core.setOverclock('m-1', 1);
    expect(core.overclockUsed).toBe(true);

    core.faults['m-1'] = 1;
    expect(core.repair('m-1')).toBe(1);
    core.grids.push('stable');

    core.researchedModels.push('c-8');
    core.maxTier = 8;
    core.peakTier = 8;
    core.rebirthNodes.push('speed-1');
    core.cables = dec('1');
    core.tick(1);

    expect(core.achieved['first-overclock']).toBeDefined();
    expect(core.achieved['first-repair']).toBeDefined();
    expect(core.achieved['grid-upgrade']).toBeDefined();
    expect(core.achieved['first-research']).toBeDefined();
    expect(core.achieved['research-wall']).toBeDefined();
    expect(core.achieved['first-rebirth-node']).toBeDefined();
    expect(core.repairs).toBe(1);
  });

  it('存电过半、污染冒烟又治污、到达 MAX 都能达成', () => {
    const core = new GameCore();
    core.counts['b-3'] = 1; // 容量 16000
    core.storedEU = dec('8000');
    core.pollution = dec('55');
    core.maxTier = 14;
    core.peakTier = 14;
    core.tick(1);

    expect(core.achieved['battery-half']).toBeDefined();
    expect(core.achieved['polluted']).toBeDefined();
    expect(core.achieved['reach-max']).toBeDefined();
    expect(core.maxPollution.toString()).toBe('55');

    // 污染压回 30% 以下 → 治污成功
    core.pollution = dec('20');
    core.tick(1);
    expect(core.achieved['cleaned-up']).toBeDefined();
  });

  it('累计统计跨转生保留，成就也跟着留在记录里', () => {
    const core = new GameCore();
    core.setDevMode(true);
    core.devGrantResources('1e12'); // MAX 机器单价 3.4e10（时空币），要给够
    core.devUnlockTo(14);
    // devUnlockTo 是测试工具，不会顺手抬高履历统计；这里按玩家的真实路径补上
    core.peakTier = core.maxTier;
    expect(core.buy(modelOf('c-14'), 1)).toBe(1);
    core.totalCoins = dec('1e12');
    core.totalEU = dec('1e20');
    core.runEU = dec('1e24');
    core.tick(1);

    const before = Object.keys(core.achieved).length;
    expect(before).toBeGreaterThan(0);

    core.rebirth('max');
    expect(core.rebirthCount).toBe(1);
    expect(core.peakTier).toBe(14); // 转生不清最高电压
    expect(core.builtMachines).toBe(1);
    expect(Object.keys(core.achieved).length).toBeGreaterThanOrEqual(before);
    expect(core.totalCables.gt(0)).toBe(true);
  });

  it('存档往返保留统计与成就', () => {
    const core = new GameCore();
    core.manualMines = 7;
    core.builtMachines = 12;
    core.overclockUsed = true;
    core.repairs = 3;
    core.peakTier = 9;
    core.maxPollution = dec('33.5');
    core.totalCables = dec('12');
    core.achieved = { 'first-swing': 12, 'leave-ulv': 40 };

    const restored = deserialize(serialize(core));
    expect(restored.manualMines).toBe(7);
    expect(restored.builtMachines).toBe(12);
    expect(restored.overclockUsed).toBe(true);
    expect(restored.repairs).toBe(3);
    expect(restored.peakTier).toBe(9);
    expect(restored.maxPollution.toString()).toBe('33.5');
    expect(restored.totalCables.toString()).toBe('12');
    expect(restored.achieved).toEqual({ 'first-swing': 12, 'leave-ulv': 40 });
    expect(serialize(restored)).toEqual(serialize(core));
  });

  it('旧存档（v8）读进来时统计归零、成就为空', () => {
    const core = new GameCore();
    core.maxTier = 6;
    const legacy = { ...serialize(core), version: 8 } as Record<string, unknown>;
    for (const key of [
      'peakTier',
      'manualMines',
      'builtMachines',
      'overclockUsed',
      'repairs',
      'maxPollution',
      'totalCables',
      'achieved',
    ]) {
      delete legacy[key];
    }

    const restored = deserialize(legacy as never);
    expect(restored.peakTier).toBe(6); // 用当前最高等级兜底
    expect(restored.manualMines).toBe(0);
    expect(restored.achieved).toEqual({});
    expect(achievementIdsAreStable()).toBe(true);
  });
});

function modelOf(id: string) {
  const model = MACHINE_MODELS.find((item) => item.id === id);
  if (!model) throw new Error(`没有这个机型：${id}`);
  return model;
}

function achievementIdsAreStable(): boolean {
  const ids = ACHIEVEMENTS.map((achievement) => achievement.id);
  return new Set(ids).size === ids.length;
}
