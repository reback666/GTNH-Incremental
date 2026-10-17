import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { machineColumn } from '../src/game/presentation/machines';
import { factoryOverview } from '../src/game/presentation/factory';
import { COLUMN_ORDER } from '../src/game/presentation/catalog';
import { sceneMachines } from '../src/scene/factory3d/state';

function factory(core: GameCore) {
  return factoryOverview(core, COLUMN_ORDER.map(kind => machineColumn(core, kind)));
}

describe('LV 3D 厂区数据', () => {
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
    expect(actual.find(model => model.id === 'g-lv-steam')).toMatchObject({ count: 0, running: 0, activity: 0 });
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
});
