import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from '../src/game/store';
import { getCore } from '../src/game/engine';
import { dec } from '../src/numeric/decimal';

// 机器面板的标签悬停时会列出一类机器吃到的全部增益 / 减益。
// 这里盯的是「清单有没有把该出现的都写出来、数值与来源对不对」。
describe('标签上的增益 / 减益清单', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function boot() {
    const store = useGameStore();
    store.boot();
    return { store, core: getCore() };
  }

  function column(store: ReturnType<typeof useGameStore>, kind: string) {
    const found = store.snap.columns.find((item) => item.kind === kind);
    if (!found) throw new Error(`没有 ${kind} 这一类`);
    return found;
  }

  it('每个机器类别都带一份清单，镐子列出自己的三条线', () => {
    const { store } = boot();
    for (const item of store.snap.columns) {
      expect(Array.isArray(item.modifiers), `${item.kind} 缺清单`).toBe(true);
    }
    expect(store.snap.pickaxe.modifiers.map((row) => row.effect)).toEqual([
      '金刚杵',
      '连锁采集',
      '连锁爆破',
    ]);
  });

  it('转生加成树的效果落到对应类别，且只有该类别有', () => {
    const { store, core } = boot();
    core.maxTier = 3;
    core.rebirthNodes = ['speed-1']; // 采矿机速度 +4%
    store.refresh();

    const speed = column(store, 'miner').modifiers.find((row) => row.effect === '速度');
    expect(speed?.value).toBe('+4%');
    expect(speed?.source).toContain('转生');
    // 发电机不吃速度加成
    expect(column(store, 'generator').modifiers.some((row) => row.effect === '速度')).toBe(false);
  });

  it('电网的耗电倍率、供电不足都写进清单', () => {
    const { store, core } = boot();
    core.maxTier = 3;
    core.grid = 'stable';
    store.refresh();
    expect(column(store, 'miner').modifiers.find((row) => row.effect === '耗电')?.value).toBe('+8%');
  });

  it('污染压产出时记成减益，来源写明是污染', () => {
    const { store, core } = boot();
    core.pollution = dec('90');
    store.refresh();

    const row = column(store, 'miner').modifiers.find((item) => item.effect === '产出');
    expect(row?.tone).toBe('bad');
    expect(row?.source).toContain('污染');
  });

  it('超频与故障按类别汇总', () => {
    const { store, core } = boot();
    core.maxTier = 3;
    core.counts['m-2'] = 10;
    core.setOverclock('m-2', 2);
    core.faults['m-2'] = 3;
    store.refresh();

    const rows = column(store, 'miner').modifiers;
    expect(rows.find((row) => row.source.includes('超频'))?.value).toBe('+120% / ×4');
    expect(rows.find((row) => row.effect === '停机')?.value).toBe('3 台');
  });

  it('存电装置自己没有增益时也不报错，容量写进清单', () => {
    const { store, core } = boot();
    core.maxTier = 4;
    core.counts['b-3'] = 2;
    store.refresh();

    const capacity = column(store, 'storage').modifiers.find((row) => row.effect === '容量');
    expect(capacity?.source).toBe('存电装置合计');
    expect(capacity?.value).toContain('EU');
  });
});
