import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { buildSnapshot } from '../src/game/presentation/snapshot';
import { serialize } from '../src/game/save';
import { dec } from '../src/numeric/decimal';
import { project, SITES, SCENE_HEIGHT, SCENE_WIDTH, viewportPoint, machinePlacements, hitFacility } from '../src/scene/layout';

// 防止呈现层更改进度、把未运行设备画成运行，以及缩放后可点击标记偏离画面。
describe('factory presentation', () => {
  it('builds a read-only overview without changing persisted state', () => {
    const core = new GameCore();
    const before = serialize(core);
    const snapshot = buildSnapshot(core);
    expect(serialize(core)).toEqual(before);
    expect(snapshot.factory.machineCount).toBe(0);
    expect(snapshot.factory.runningCount).toBe(0);
    expect(snapshot.factory.nextTierProgress).toBe(0);
    expect(snapshot.factory.facilities.some(item => item.kind === 'research')).toBe(false);
  });

  it('reflects actual production, stopped machines and maintenance', () => {
    const core = new GameCore();
    core.grid = 'stable';
    core.grids = ['normal', 'stable'];
    core.maxTier = 3;
    core.ores[0] = dec('10000');
    core.counts = { 'm-1': 4, 'g-ulv': 8, 'c-1': 1, 'b-3': 2 };
    core.faults['m-1'] = 1;
    core.tick(1);
    let snapshot = buildSnapshot(core);
    let miner = snapshot.factory.facilities.find(item => item.kind === 'miner')!;
    expect(miner.count).toBe(4);
    expect(miner.running).toBe(3);
    expect(miner.faulty).toBe(1);
    expect(miner.activity).toBeGreaterThan(0);
    core.toggleStopped('m-1');
    core.tick(1);
    snapshot = buildSnapshot(core);
    miner = snapshot.factory.facilities.find(item => item.kind === 'miner')!;
    expect(miner.running).toBe(0);
    expect(miner.activity).toBe(0);
  });

  it('keeps facility labels inside the viewport through the supported zoom range', () => {
    expect(project(0, 0)).toEqual({ x: SCENE_WIDTH / 2, y: 290 });
    for (const zoom of [0.8, 1, 1.2]) {
      for (const site of SITES) {
        const point = viewportPoint(project(site.x, site.y, -40), zoom);
        expect(point.x).toBeGreaterThan(60);
        expect(point.x).toBeLessThan(SCENE_WIDTH - 60);
        expect(point.y).toBeGreaterThan(30);
        expect(point.y).toBeLessThan(SCENE_HEIGHT - 30);
      }
    }
  });
  it('shows settled generation rather than idle nameplate capacity', () => {
    const core = new GameCore();
    core.grid = 'stable';
    core.ores[0] = dec('10000');
    core.counts = { 'g-ulv': 4 };
    core.tick(1);
    let snapshot = buildSnapshot(core);
    expect(snapshot.power.generated.value).toBe('0 EU/t');
    expect(snapshot.columns.find(c => c.kind === 'generator')!.stats[0]!.value).toBe('0 EU/t');
    core.counts['c-1'] = 1;
    core.tick(1);
    snapshot = buildSnapshot(core);
    expect(snapshot.power.generated.value).toBe('8.64 EU/t');
    expect(snapshot.columns.find(c => c.kind === 'generator')!.stats[0]!.value).toBe('8.64 EU/t');
    expect(snapshot.power.generated.detailLabel).toBe('额定能力');
    expect(snapshot.power.generated.note).toContain('32 EU/t');
    core.tick(5);
    expect(buildSnapshot(core).power.generated.value).toBe('8.64 EU/t');
  });

  it('grows the factory with purchases and bounds large machine populations', () => {
    const core = new GameCore();
    core.counts['m-1'] = 1;
    const getMiner = () => buildSnapshot(core).factory.facilities.find(item => item.kind === 'miner')!;
    expect(machinePlacements(getMiner())).toHaveLength(1);
    core.counts['m-1'] = 20;
    const expanded = machinePlacements(getMiner());
    expect(expanded).toHaveLength(20);
    expect(new Set(expanded.map(item => item.base)).size).toBe(2);
    core.counts['m-1'] = 1000;
    const large = machinePlacements(getMiner());
    expect(large).toHaveLength(192);
    expect(new Set(large.map(item => item.rack)).size).toBe(4);
    expect(new Set(large.filter(item => item.rack === 0).map(item => item.base)).size).toBe(3);
    expect(large.every(item => item.machine.modelId === 'm-1')).toBe(true);
  });

  it('selects machine bodies through the same camera transform as their labels', () => {
    const core = new GameCore(); core.counts = { 'g-ulv': 8, 'm-1': 5 };
    const facilities = buildSnapshot(core).factory.facilities;
    const generator = SITES.find(site => site.kind === 'generator')!;
    const point = project(generator.x, generator.y, 24);
    for (const zoom of [0.8, 1, 1.2]) expect(hitFacility(viewportPoint(point, zoom), facilities, zoom)).toBe('generator');
    expect(hitFacility({ x: 0, y: 0 }, facilities)).toBe(null);
  });

  it('adds a parallel rack at the three-layer boundary instead of stretching the old rack', () => {
    const core = new GameCore();
    for (const [count, visible, racks] of [[48, 48, 1], [49, 49, 2], [96, 96, 2], [97, 97, 3], [192, 192, 4], [1000, 192, 4]]) {
      core.counts['m-1'] = count!;
      const facility = buildSnapshot(core).factory.facilities.find(item => item.kind === 'miner')!;
      const items = machinePlacements(facility);
      expect(items).toHaveLength(visible!);
      expect(new Set(items.map(item => item.rack)).size).toBe(racks);
      for (const rack of new Set(items.map(item => item.rack))) {
        expect(new Set(items.filter(item => item.rack === rack).map(item => item.base)).size).toBeLessThanOrEqual(3);
      }
    }
  });

});
