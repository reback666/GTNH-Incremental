import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { buildSnapshot } from '../src/game/presentation/snapshot';
import { serialize } from '../src/game/save';
import { dec } from '../src/numeric/decimal';
import { achievementStats, rebirthStats } from '../src/game/presentation/progression';
import { getDefaultDisplayMode, setDefaultDisplayMode } from '../src/numeric/format';

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

describe('presentation caches', () => {
  it('reuses unchanged catalogs while current balances and production stay live', () => {
    const core = new GameCore();
    const first = buildSnapshot(core);
    core.playSeconds = 10;
    core.runEU = dec('1234');
    core.ores[0] = dec('42');
    const next = buildSnapshot(core);
    expect(next.rebirth.nodes).toBe(first.rebirth.nodes);
    expect(next.rebirth.historyRows).toBe(first.rebirth.historyRows);
    expect(next.rebirth.challengeRows).toBe(first.rebirth.challengeRows);
    expect(next.rebirth.bonuses).toBe(first.rebirth.bonuses);
    expect(next.achievements).toBe(first.achievements);
    expect(next.rebirth.runEU).not.toBe(first.rebirth.runEU);
    expect(next.playTime).not.toBe(first.playTime);
    expect(next.ores[0].value).toBe('42');
  });

  it('refreshes affordability, purchased nodes and universe gates immediately', () => {
    const core = new GameCore();
    const initial = rebirthStats(core);
    expect(initial.nodes.find(node => node.id === 'speed-1')?.buyable).toBe(false);
    core.cables = dec('100');
    expect(rebirthStats(core).nodes.find(node => node.id === 'speed-1')?.buyable).toBe(true);
    expect(core.buyRebirthNode('speed-1')).toBe(true);
    const purchased = rebirthStats(core);
    expect(purchased.nodes.find(node => node.id === 'speed-1')).toMatchObject({ owned: true, buyable: false });
    expect(purchased.nodes.find(node => node.id === 'speed-2a')?.unlocked).toBe(true);
    expect(purchased.nodes.find(node => node.id === 'universe-1')?.unlocked).toBe(false);
    core.universes.push('industry');
    expect(rebirthStats(core).nodes.find(node => node.id === 'universe-1')?.unlocked).toBe(true);
    core.universes[0] = 'arcane';
    expect(rebirthStats(core).nodes.find(node => node.id === 'universe-1')?.unlocked).toBe(false);
  });

  it('refreshes challenge options, completion and edited history', () => {
    const core = new GameCore();
    expect(rebirthStats(core).challengeRows.find(row => row.id === 'red')?.eligible).toBe(false);
    core.pendingUniverse = 'abyss';
    core.pendingChallenge = 'red';
    core.completedChallenges.push('red');
    expect(rebirthStats(core).challengeRows.find(row => row.id === 'red')).toMatchObject({ eligible: true, selected: true, firstDone: true });
    core.runHistory.push({ run: 1, route: 'max', universe: '', challenge: '', challengePassed: false, cables: '1', seconds: 60, maxTier: 15 });
    expect(rebirthStats(core).historyRows[0]).toMatchObject({ cables: '1' });
    core.runHistory[0].cables = '2';
    expect(rebirthStats(core).historyRows[0]).toMatchObject({ cables: '2' });
  });

  it('refreshes cached text when the numeric display mode changes', () => {
    const core = new GameCore();
    const previous = getDefaultDisplayMode();
    try {
      setDefaultDisplayMode('full');
      expect(rebirthStats(core).nodes.find(node => node.id === 'speed-1')?.cost).toBe('1');
      setDefaultDisplayMode('scientific');
      expect(rebirthStats(core).nodes.find(node => node.id === 'speed-1')?.cost).toBe('1.00e0');
    } finally { setDefaultDisplayMode(previous); }
  });

  it('refreshes earned timestamps and isolates replaced or reset cores', () => {
    const core = new GameCore();
    const initial = achievementStats(core);
    core.achieved['first-swing'] = 10;
    const earned = achievementStats(core);
    expect(earned.done).toBe(initial.done + 1);
    core.achieved['first-swing'] = 20;
    expect(achievementStats(core).rows[0].at).not.toBe(earned.rows[0].at);
    core.achieved = {};
    expect(achievementStats(core).done).toBe(0);
    const fresh = new GameCore();
    expect(rebirthStats(fresh).nodes).not.toBe(rebirthStats(core).nodes);
    expect(achievementStats(fresh)).not.toBe(achievementStats(core));
  });
});
