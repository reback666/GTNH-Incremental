import { describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { deserialize, serialize, type SaveData } from '../src/game/save';
import { GameCore } from '../src/game/core';
import { dec } from '../src/numeric/decimal';
import { useGameStore } from '../src/game/store';
import { getCore } from '../src/game/engine';

// 读档清洗：存档是玩家机器上的数据，坏值不能进到模拟里，也不能因为一个字段坏了
// 就把整份存档丢掉（见 src/game/save.ts 的 clean* 一组）。

function emptySave(): SaveData {
  return {
    version: 17,
    ores: [],
    coins: [],
    maxTier: 1,
    unlockedVeins: [0],
    playSeconds: 0,
    totalOre: '0',
    totalCoins: '0',
    totalOreSpent: '0',
  };
}

describe('读档清洗', () => {
  it('越界、负数、乱写的值都收敛到合法范围', () => {
    const core = deserialize({
      ...emptySave(),
      ores: ['100', 'oops', '-5'],
      counts: { 'm-1': -5, 'm-2': 1.5, 'no-such-model': 3 },
      overclock: { 'm-1': 99, 'm-2': 2 },
      faults: { 'm-2': 99 },
      stopped: { 'm-2': true, 'g-ulv': true },
      maxTier: 999,
      peakTier: 999,
      unlockedVeins: [3, 3, 99, -1],
      playSeconds: -10,
      researchProgressByModel: { 'm-9': 'abc', 'no-such-model': '10' },
    });

    expect(core.maxTier).toBe(14);
    expect(core.peakTier).toBe(14);
    expect(core.unlockedVeins).toEqual([3]);
    expect(core.playSeconds).toBe(0);
    // 越界等级按 0 处理，'oops' 也退回 0
    expect(core.ores[0]!.toString()).toBe('100');
    expect(core.ores[1]!.toString()).toBe('0');
    expect(core.ores[2]!.toString()).toBe('0');
    // 负台数丢掉、小数台数取整、不存在的机型丢掉
    expect(core.counts).toEqual({ 'm-2': 1 });
    expect(core.overclockOf('m-1')).toBe(0);
    expect(core.overclockOf('m-2')).toBe(2);
    // 故障台数不超过剩下的台数
    expect(core.faults['m-2']).toBe(1);
    // 没建过的机型不留停机记录
    expect(core.stopped).toEqual({ 'm-2': true });
    expect(Object.keys(core.researchProgress)).toEqual([]);
  });

  it('缺字段的残档按默认值读入，不再整份丢掉', () => {
    const core = deserialize({ version: 17 } as SaveData);
    expect(core.maxTier).toBe(1);
    expect(core.unlockedVeins).toEqual([0]);
    expect(core.playSeconds).toBe(0);
    expect(core.counts).toEqual({});
    expect(core.grid).toBe('normal');
    expect(core.grids).toEqual(['normal']);
  });

  it('电网模式写坏了就退回普通电网，并保证它一定已解锁', () => {
    const core = deserialize({ ...emptySave(), grid: 'nonsense', grids: ['nonsense'] });
    expect(core.grid).toBe('normal');
    expect(core.grids).toEqual(['normal']);
  });

  it('平行宇宙与待选宇宙只认实现过的，重复项只留一个', () => {
    const core = deserialize({
      ...emptySave(),
      universes: ['arcane', 'arcane', 'no-such-universe'],
      pendingUniverse: 'arcane',
    });
    expect(core.universes).toEqual(['arcane']);
    // 已经拿到的宇宙不能再挂进「下次转生带」
    expect(core.pendingUniverse).toBeNull();
  });

  it('随机事件计时器跟着存档走', () => {
    const core = new GameCore();
    core.outageSeconds = 3.5;
    core.outageTimer = 120;
    core.siphonTimer = 30;
    core.mutationTimer = 45;
    core.collapseTimer = 600;

    const restored = deserialize(serialize(core));
    expect(restored.outageSeconds).toBe(3.5);
    expect(restored.outageTimer).toBe(120);
    expect(restored.siphonTimer).toBe(30);
    expect(restored.mutationTimer).toBe(45);
    expect(restored.collapseTimer).toBe(600);
    expect(serialize(restored)).toEqual(serialize(core));
  });
});

describe('数字显示模式（v21）', () => {
  it('进存档并完整往返；旧档没有该字段、坏值都退回自动', () => {
    const core = new GameCore();
    core.displayMode = 'full';
    expect(serialize(core).displayMode).toBe('full');
    expect(deserialize(serialize(core)).displayMode).toBe('full');

    expect(deserialize(emptySave()).displayMode).toBe('auto');
    const messy = deserialize({ ...emptySave(), displayMode: 'no-such-mode' });
    expect(messy.displayMode).toBe('auto');
  });

  it('设置页切换后，界面数字按新画法输出', () => {
    setActivePinia(createPinia());
    const store = useGameStore();
    store.boot();
    getCore().totalOre = dec('1.23e9');
    store.refresh();
    expect(store.snap.totalOre).toBe('1.23G');

    store.setDisplayMode('full');
    expect(store.snap.displayMode).toBe('full');
    expect(store.snap.totalOre).toBe('1230000000');
    expect(getCore().displayMode).toBe('full');
  });
});

describe('自动存档间隔（v22）', () => {
  it('进存档并完整往返；旧档缺字段退回 10 秒，越界值收进 5~60', () => {
    const core = new GameCore();
    core.autosaveSeconds = 30;
    expect(serialize(core).autosaveSeconds).toBe(30);
    expect(deserialize(serialize(core)).autosaveSeconds).toBe(30);

    expect(deserialize(emptySave()).autosaveSeconds).toBe(10);
    expect(deserialize({ ...emptySave(), autosaveSeconds: 999 }).autosaveSeconds).toBe(60);
    expect(deserialize({ ...emptySave(), autosaveSeconds: 0 }).autosaveSeconds).toBe(5);
  });

  it('存档框滑条改间隔后，snapshot 与 core 同步，非法输入被拒', () => {
    setActivePinia(createPinia());
    const store = useGameStore();
    store.boot();
    // 换假时钟：动作里会按新间隔起定时器，测试里不能留真定时器
    vi.useFakeTimers();
    try {
      expect(store.setAutosaveSeconds(30)).toBe(true);
      expect(store.snap.autosaveSeconds).toBe(30);
      expect(getCore().autosaveSeconds).toBe(30);

      expect(store.setAutosaveSeconds(999)).toBe(true);
      expect(store.snap.autosaveSeconds).toBe(60);

      expect(store.setAutosaveSeconds(Number.NaN)).toBe(false);
      expect(getCore().autosaveSeconds).toBe(60);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('音效开关（v23）', () => {
  it('总开关与单独关闭列表完整往返；旧档缺字段退回默认，乱写的 id 丢掉', () => {
    const core = new GameCore();
    core.soundEnabled = false;
    core.setSoundMuted('mine', true);
    core.setSoundMuted('unlock', true);
    expect(serialize(core).soundEnabled).toBe(false);
    expect(serialize(core).soundMuted).toEqual(['mine', 'unlock']);

    const restored = deserialize(serialize(core));
    expect(restored.soundEnabled).toBe(false);
    expect(restored.soundMuted).toEqual(['mine', 'unlock']);
    // 再开一次总开关 / 取消单独关闭，都生效
    restored.setSoundEnabled(true);
    restored.setSoundMuted('mine', false);
    expect(restored.soundEnabled).toBe(true);
    expect(restored.soundMuted).toEqual(['unlock']);

    const fresh = deserialize(emptySave());
    expect(fresh.soundEnabled).toBe(true);
    expect(fresh.soundMuted).toEqual([]);
    const messy = deserialize({
      ...emptySave(),
      soundMuted: ['no-such-sound', 42, 'sell'],
    } as unknown as SaveData);
    expect(messy.soundMuted).toEqual(['sell']);
  });
});

describe('界面主题（v24）', () => {
  it('两套皮肤往返；旧档缺字段退回暗钢，乱写的值也退回暗钢', () => {
    const core = new GameCore();
    core.setUiTheme('light');
    expect(serialize(core).uiTheme).toBe('light');
    expect(deserialize(serialize(core)).uiTheme).toBe('light');

    core.setUiTheme('classic');
    expect(deserialize(serialize(core)).uiTheme).toBe('classic');

    const fresh = deserialize(emptySave());
    expect(fresh.uiTheme).toBe('dark');
    const messy = deserialize({ ...emptySave(), uiTheme: 'no-such-skin' } as unknown as SaveData);
    expect(messy.uiTheme).toBe('dark');
  });
});
