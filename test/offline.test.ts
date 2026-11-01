import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from '../src/game/store';
import { getCore, setCore } from '../src/game/engine';
import { GameCore } from '../src/game/core';
import { clearStorage, deserialize, saveToStorage, secondsSinceLastSave, serialize } from '../src/game/save';
import { SAVE_TIME_KEY } from '../src/game/constants';
import { dec } from '../src/numeric/decimal';
import { REBIRTH_NODES } from '../src/game/rebirth';
import { MAX_CATCH_UP_SECONDS } from '../src/game/runtime';

// 离线收益与在线共用逐秒结算，最多补 72 小时。
// 时间戳单独存在 SAVE_TIME_KEY 里，所以这里要临时装一个假的 localStorage。

interface FakeStorage {
  map: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function fakeStorage(): FakeStorage {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function withStorage(fake: FakeStorage): () => void {
  const holder = globalThis as { localStorage?: unknown };
  const previous = holder.localStorage;
  holder.localStorage = fake;
  return () => {
    if (previous === undefined) delete holder.localStorage;
    else holder.localStorage = previous;
  };
}

describe('离线收益', () => {
  afterEach(() => { useGameStore().stop(); vi.restoreAllMocks(); });
  beforeEach(() => {
    setActivePinia(createPinia());
    setCore(new GameCore());
  });

  it('按离线时长补算，并记下这一段产出了多少', async () => {
    const core = getCore();
    core.maxTier = 2;
    core.ores[0] = dec('1e6');
    core.counts['m-1'] = 5;
    core.counts['g-ulv'] = 3;
    core.counts['c-1'] = 1;

    const store = useGameStore();
    await store.catchUp(3600);

    expect(core.playSeconds).toBe(3600);
    expect(core.totalOre.gt(0)).toBe(true);
    expect(core.totalCoins.gt(0)).toBe(true);
    expect(store.offlineNote).toContain('离线 1 小时');
    expect(store.offlineResult).not.toBeNull();
    expect(store.offlineResult!.changes.some(change => change.kind === 'coin' && change.before === '0')).toBe(true);
    expect(store.offlineResult!.changes.some(change => dec(change.produced).gt(0))).toBe(true);
  });

  it('保留原离线上限与星图加成，补算不能超过 72 小时', async () => {
    const store = useGameStore();
    const core = getCore();
    expect(core.offlineCapSeconds()).toBe(24 * 3600);
    core.rebirthNodes = REBIRTH_NODES.filter(node => node.effect === 'offlineHours').map(node => node.id);
    const cap = core.offlineCapSeconds();
    expect(cap).toBeGreaterThan(24 * 3600);
    expect(cap).toBeLessThanOrEqual(MAX_CATCH_UP_SECONDS);
    await store.catchUp(96 * 3600);
    expect(core.playSeconds).toBe(cap);
    expect(store.offlineNote).toContain('超过当前上限');
  }, 30000);

  it('奥术离线摘要对应真实发现、作业和节点供能变化', async () => {
    const core = getCore();
    core.maxTier = 3;
    core.universes = ['arcane'];
    core.coins = core.coins.map(() => dec('1e8'));
    core.ores = core.ores.map(() => dec('1e8'));
    core.counts['g-lv-steam'] = 4;
    core.random = () => 0.999;
    const expedition = core.arcaneExpedition;
    const context = core.arcaneContext();
    expect(expedition.act({ type: 'research', id: 'A0' }, context)).toBe(true);
    expedition.state.research = 1;
    expect(expedition.act({ type: 'build-survey', tier: 2 }, context)).toBe(true);
    expect(expedition.act({ type: 'build-bench', tier: 2 }, context)).toBe(true);
    expect(expedition.act({ type: 'enqueue', benchId: expedition.state.benches[0]!.id, nodeId: expedition.state.nodes[0]!.id, task: { kind: 'cultivate' } }, context)).toBe(true);
    const store = useGameStore();
    await store.catchUp(2000);
    expect(expedition.state.discoveries).toBeGreaterThan(0);
    expect(expedition.state.completedJobs).toBe(1);
    expect(store.offlineNote).toContain(`奥术调查新增 ${expedition.state.discoveries} 颗、完成 1 项作业`);
    expect(store.offlineNote).toContain('实体节点供能');
    expect(store.offlineNote).toContain(`${expedition.state.surveys[0]!.candidates.length} 颗`);
  });

  it('与逐秒在线推进得到相同的状态，包括燃料、储能与污染', async () => {
    const core = getCore();
    core.grid = 'stable';
    core.maxTier = 3;
    core.ores[0] = dec('10000');
    core.grids = ['normal', 'stable'];
    core.counts = { 'm-1': 5, 'g-ulv': 3, 'c-1': 1, 'b-3': 2, 'p-2': 1 };
    core.random = () => 0.99;
    const online = deserialize(serialize(core));
    online.random = () => 0.99;
    for (let i = 0; i < 120; i++) online.tick(1);
    await useGameStore().catchUp(120);
    expect(serialize(core)).toEqual(serialize(online));
  });

  it('补算中存档只记录已完成的时间，重置后旧任务不再更新状态', async () => {
    const storage = fakeStorage();
    const restore = withStorage(storage);
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
    try {
      const store = useGameStore();
      const old = getCore();
      const pending = store.catchUp(3600);
      const completed = old.playSeconds;
      expect(completed).toBeGreaterThan(0);
      expect(completed).toBeLessThan(3600);
      store.save();
      expect(Number(storage.getItem(SAVE_TIME_KEY))).toBe(1000000 - 3600 * 1000 + completed * 1000);
      store.reset();
      await pending;
      expect(getCore().playSeconds).toBe(0);
      expect(old.playSeconds).toBe(completed);
      expect(store.catchingUp).toBe(false);
    } finally { restore(); }
  });

  it('不到一秒不补算', async () => {
    const store = useGameStore();
    await store.catchUp(0.4);
    expect(getCore().playSeconds).toBe(0);
    expect(store.offlineNote).toBe('');
  });

  it('没有库存变化时也保留补算结果窗口', async () => {
    const store = useGameStore();
    await store.catchUp(1);
    expect(store.offlineResult).toEqual(expect.objectContaining({ failed: false, changes: [] }));
  });

  it('补算期间在线模拟不叠上去', () => {
    const store = useGameStore();
    const core = getCore();
    // 分片跑的那一小会儿里，在线那一拍要被挡掉，否则同一段时间会被算两遍
    store.catchingUp = true;
    store.step(1);
    expect(core.playSeconds).toBe(0);
    store.catchingUp = false;
    store.step(1);
    expect(core.playSeconds).toBe(1);
  });
});

describe('写档时间戳', () => {
  it('没有记录时返回 0，写档后能读出经过的秒数', () => {
    const storage = fakeStorage();
    const restore = withStorage(storage);
    try {
      expect(secondsSinceLastSave()).toBe(0);

      saveToStorage(new GameCore());
      expect(secondsSinceLastSave()).toBeLessThan(1);

      // 假装上次写档是 90 秒前
      storage.map.set(SAVE_TIME_KEY, String(Date.now() - 90_000));
      expect(secondsSinceLastSave()).toBeCloseTo(90, 0);

      // 时间戳坏掉（或系统时间倒流）都按 0 处理，宁可少给也不少补
      storage.map.set(SAVE_TIME_KEY, 'not-a-number');
      expect(secondsSinceLastSave()).toBe(0);
      storage.map.set(SAVE_TIME_KEY, String(Date.now() + 60_000));
      expect(secondsSinceLastSave()).toBe(0);

      clearStorage();
      expect(secondsSinceLastSave()).toBe(0);
    } finally {
      restore();
    }
  });
});
