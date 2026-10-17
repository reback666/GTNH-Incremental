import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { buildSnapshot } from '../src/game/presentation/snapshot';
import { serialize } from '../src/game/save';
import { dec } from '../src/numeric/decimal';

// 呈现快照不能更改进度，运行与发电读数必须反映实际结算。
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

});
