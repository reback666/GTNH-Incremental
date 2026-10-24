import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { machineColumn } from '../src/game/presentation/machines';
import { factoryOverview } from '../src/game/presentation/factory';
import { COLUMN_ORDER } from '../src/game/presentation/catalog';
import { matchesSceneFilter, sceneMachines } from '../src/scene/factory3d/state';
import { MACHINE_MODELS } from '../src/game/models';
import { CONTENT } from '../src/content';

function factory(core: GameCore) {
  return factoryOverview(core, COLUMN_ORDER.map(kind => machineColumn(core, kind)));
}

describe('只读实际厂区与 LV 演示', () => {
  it('演示设备不写入真实数量，也不覆盖已停机设备', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.counts['c-2'] = 18;
    core.setStopped('c-2', true);
    const overview = factory(core);
    const before = JSON.stringify(overview);
    const demo = sceneMachines(overview, true, true);
    expect(demo.find(model => model.id === 'c-2')).toMatchObject({ count: 1, running: 1, activity: 1 });
    expect(JSON.stringify(overview)).toBe(before);
    expect(core.countOf('c-2')).toBe(18);
    expect(core.isStopped('c-2')).toBe(true);
  });

  it('实际厂区保留真实台数，停机和零台设备不会冒充运行', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.counts['c-2'] = 100;
    core.setStopped('c-2', true);
    const actual = sceneMachines(factory(core), false, true);
    expect(actual.find(model => model.id === 'c-2')).toMatchObject({ count: 100, running: 0 });
    expect(actual.find(model => model.id === 'g-lv-steam')).toBeUndefined();
    expect(actual.some(model => model.id === 'n-2' || model.id === 'mc-2')).toBe(false);
  });

  it('暂停演示只改变画面状态，实际厂区继续读取真实运行台数', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.counts['g-lv-steam'] = 3;
    const overview = factory(core);
    expect(sceneMachines(overview, true, false).every(model => model.count === 1 && model.running === 0)).toBe(true);
    expect(sceneMachines(overview, false, false).find(model => model.id === 'g-lv-steam')?.running).toBe(3);
  });

  it('完整保留全目录的真实名称、数量、电压与原生立体模型', () => {
    const overview = factory(new GameCore());
    for (const facility of overview.facilities) {
      facility.machines = MACHINE_MODELS.filter(model => model.category === facility.kind).map((model, index) => ({ modelId: model.id, tier: model.tier, count: index + 1, running: index }));
      facility.activity = 0.75;
    }
    const before = JSON.stringify(overview);
    const actual = sceneMachines(overview, false, false);
    expect(actual).toHaveLength(MACHINE_MODELS.length);
    for (const machine of actual) {
      const model = CONTENT.byModelId.get(machine.id)!;
      expect(machine.name).toBe(model.name);
      expect(machine.voltage).toBe(CONTENT.voltages[model.tier - 1]!.id);
      expect(machine.activity).toBe(0.75);
      expect(machine.representation).toBe('block');
      expect(machine.size.every(value => Number.isInteger(value) && value > 0)).toBe(true);
    }
    expect(JSON.stringify(overview)).toBe(before);
  });

  it('2400 台实际设备不会被可见容量截断，类别与电压筛选不改变源快照', () => {
    const core = new GameCore();
    core.maxTier = 4;
    core.counts['m-1'] = 800;
    core.counts['m-2'] = 800;
    core.counts['c-4'] = 800;
    const overview = factory(core);
    const actual = sceneMachines(overview, false, true);
    expect(actual.reduce((sum, machine) => sum + machine.count, 0)).toBe(2400);
    expect(actual.filter(machine => matchesSceneFilter(machine, { category: 'miner' })).reduce((sum, machine) => sum + machine.count, 0)).toBe(1600);
    expect(actual.filter(machine => matchesSceneFilter(machine, { category: 'miner', tier: 2 })).map(machine => machine.id)).toEqual(['m-2']);
    expect(actual.filter(machine => matchesSceneFilter(machine, { tier: 4 })).map(machine => machine.id)).toEqual(['c-4']);
    expect(actual.filter(machine => matchesSceneFilter(machine, { category: 'research', tier: 1 }))).toEqual([]);
    expect(overview.machineCount).toBe(2400);
  });
});
