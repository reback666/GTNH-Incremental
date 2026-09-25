import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { dec } from '../src/numeric/decimal';
import {
  blastBonusPerUpgrade,
  blastChances,
  collectChances,
  collectMultiplier,
  pickaxeIconTier,
  pickaxeOutputPerClick,
  vajraChances,
  vajraMaxLevel,
} from '../src/numeric/pickaxe';
import { MAX_TIER } from '../src/numeric/voltage';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { useGameStore } from '../src/game/store';
import { getCore } from '../src/game/engine';

describe('镐子的三条升级线', () => {
  it('升级机会随电压等级发放：金刚杵每级 1 次、连锁采集每 2 级 1 次、连锁爆破每级 2 次', () => {
    expect(vajraChances(1)).toBe(1);
    expect(vajraChances(MAX_TIER)).toBe(14);
    expect(collectChances(1)).toBe(0);
    expect(collectChances(2)).toBe(1);
    expect(collectChances(MAX_TIER)).toBe(7);
    expect(blastChances(1)).toBe(2);
    expect(blastChances(MAX_TIER)).toBe(28);
  });

  it('金刚杵挖到 T13 就封顶（最高一档采矿机采的就是 T13）', () => {
    expect(vajraMaxLevel()).toBe(13);
  });

  it('连锁爆破每次机会的加值 = n^(n/2)', () => {
    expect(blastBonusPerUpgrade(1).toString()).toBe('1');
    expect(blastBonusPerUpgrade(2).toString()).toBe('2');
    expect(blastBonusPerUpgrade(3).toSignificantDigits(6).toString()).toBe('5.19615');
    expect(blastBonusPerUpgrade(4).toString()).toBe('16');
    expect(blastBonusPerUpgrade(9).toSignificantDigits(6).toString()).toBe('19683');
    expect(blastBonusPerUpgrade(14).toSignificantDigits(8).toString()).toBe('105413500');
  });

  it('连锁采集每级翻倍：0 级 ×1、7 级 ×128', () => {
    expect(collectMultiplier(0).toString()).toBe('1');
    expect(collectMultiplier(1).toString()).toBe('2');
    expect(collectMultiplier(7).toString()).toBe('128');
  });

  it('结算顺序：先加连锁爆破，再乘连锁采集', () => {
    // 4 级：基础 1 + 4 次 × 16 = 65，再 × 4（采集 2 级）
    const output = pickaxeOutputPerClick({ tier: 4, blastUsed: 4, collectLevel: 2 });
    expect(output.toString()).toBe('260');
    // 若先乘后加会得到 384，这里确认不是那个顺序
    expect(output.toString()).not.toBe('384');
  });

  it('MAX 用满全部机会时的产出', () => {
    const output = pickaxeOutputPerClick({ tier: 14, blastUsed: 28, collectLevel: 7 });
    expect(output.toString()).toBe('377801998464');
  });

  it('图标配色按各自进度取：没升是 ULV 色，满级是 MAX 的彩虹', () => {
    expect(pickaxeIconTier(0, 13)).toBe(1);
    expect(pickaxeIconTier(13, 13)).toBe(14);
    expect(pickaxeIconTier(0, 7)).toBe(1);
    expect(pickaxeIconTier(7, 7)).toBe(14);
    expect(pickaxeIconTier(0, 28)).toBe(1);
    expect(pickaxeIconTier(28, 28)).toBe(14);
    // 三条线机会数不同，但走完一半进度时取的色阶一致
    expect(pickaxeIconTier(13, 26)).toBe(pickaxeIconTier(7, 14));
  });
});

describe('游戏核心里的镐子', () => {
  it('开局只能挖 T0 矿脉，一次点击 1 枚', () => {
    const core = new GameCore();
    expect(core.pickaxeVeinTier()).toBe(0);
    expect(core.pickaxeOutput().toString()).toBe('1');
    core.manualMine();
    expect(core.ores[0]!.toString()).toBe('1');
    expect(core.ores[1]!.toString()).toBe('0');
  });

  it('金刚杵升级后能挖更高一级矿脉，产出按矿脉规则均分', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    core.upgradePickaxe('vajra');
    expect(core.pickaxeVeinTier()).toBe(1);
    core.manualMine();
    // T1 矿脉产 T0 与 T1 两种，各拿一半
    expect(core.ores[0]!.toString()).toBe('0.5');
    expect(core.ores[1]!.toString()).toBe('0.5');
  });

  it('金刚杵等级不够时，挖的还是镐子够得着的那一级', () => {
    const core = new GameCore();
    core.maxTier = 4;
    core.unlockedVeins = [0, 1, 2, 3];
    expect(core.pickaxeVeinTier()).toBe(0);
    core.upgradePickaxe('vajra');
    expect(core.pickaxeVeinTier()).toBe(1);
  });

  it('机会用完之后不能再升', () => {
    const core = new GameCore();
    expect(core.canUpgradePickaxe('collect')).toBe(false); // ULV 时连锁采集还没有机会
    expect(core.canUpgradePickaxe('blast')).toBe(true);
    core.upgradePickaxe('blast');
    core.upgradePickaxe('blast');
    expect(core.canUpgradePickaxe('blast')).toBe(false);
    expect(core.pickaxeBlast).toBe(2);
  });

  it('金刚杵挖满 T13 之后不再消耗机会', () => {
    const core = new GameCore();
    core.maxTier = MAX_TIER;
    for (let i = 0; i < 13; i += 1) core.upgradePickaxe('vajra');
    expect(core.pickaxeVajra).toBe(13);
    expect(core.canUpgradePickaxe('vajra')).toBe(false);
  });

  it('连锁爆破的加值随当前电压变强，不用攒机会', () => {
    const core = new GameCore();
    core.maxTier = 4;
    core.upgradePickaxe('blast');
    expect(core.pickaxeOutput().toString()).toBe('17'); // 1 + 16
    core.maxTier = 6;
    expect(core.pickaxeOutput().toString()).toBe('217'); // 1 + 216
  });

  it('转生之后镐子回到开局状态', () => {
    const core = new GameCore();
    core.maxTier = MAX_TIER;
    core.peakTier = MAX_TIER;
    core.runEU = dec('1e30');
    core.upgradePickaxe('vajra');
    core.upgradePickaxe('collect');
    core.upgradePickaxe('blast');
    const gained = core.rebirth('max', 'industry');
    expect(gained).not.toBeNull();
    expect(core.pickaxeVajra).toBe(0);
    expect(core.pickaxeCollect).toBe(0);
    expect(core.pickaxeBlast).toBe(0);
  });

  it('存档往返保留三条线的进度', () => {
    const core = new GameCore();
    core.maxTier = 6;
    core.upgradePickaxe('vajra');
    core.upgradePickaxe('collect');
    core.upgradePickaxe('blast');
    const restored = deserialize(serialize(core));
    expect(restored.pickaxeVajra).toBe(1);
    expect(restored.pickaxeCollect).toBe(1);
    expect(restored.pickaxeBlast).toBe(1);
    expect(restored.pickaxeOutput().toString()).toBe(core.pickaxeOutput().toString());
  });
});

// 面板是纯展示，数据都来自 snapshot；这里验证界面拿到的那份数据对不对。
describe('镐子面板拿到的数据', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('列出三条升级线，并给出当前产出与各自的图标等级', () => {
    const store = useGameStore();
    store.boot();
    const core = getCore();
    core.maxTier = 4;
    store.refresh();

    const pickaxe = store.snap.pickaxe;
    expect(pickaxe.lines.map((line) => line.id)).toEqual(['vajra', 'collect', 'blast']);
    expect(pickaxe.outputPerClick).toBe('1');
    expect(pickaxe.veinTier).toBe(0);
    expect(pickaxe.maxVeinTier).toBe(0);
    // 三条线都还没升级：都是 ULV 色
    expect(pickaxe.lines.map((line) => line.iconTier)).toEqual([1, 1, 1]);
  });

  it('点了升级就立刻反映到产出、矿脉与图标上', () => {
    const store = useGameStore();
    store.boot();
    const core = getCore();
    core.maxTier = 4;
    core.unlockedVeins = [0, 1, 2, 3];
    store.refresh();

    store.upgradePickaxe('collect'); // HV 时连锁采集有 2 次机会
    expect(store.snap.pickaxe.lines[1]!.level).toBe(1);
    expect(store.snap.pickaxe.outputPerClick).toBe('2');
    // 采集线 2 次机会走了 1 次：图标色跟着进度走
    expect(store.snap.pickaxe.lines[1]!.iconTier).toBeGreaterThan(1);

    store.upgradePickaxe('vajra');
    expect(store.snap.pickaxe.veinTier).toBe(1);
    expect(store.snap.pickaxe.lines[0]!.iconTier).toBeGreaterThan(1);
  });

  it('金刚杵跟不上时，面板提示已解锁更高级矿脉但挖不动', () => {
    const store = useGameStore();
    store.boot();
    const core = getCore();
    core.maxTier = 4;
    core.unlockedVeins = [0, 1, 2, 3];
    store.refresh();

    expect(store.snap.pickaxe.maxVeinName).not.toBe(store.snap.pickaxe.veinName);
    store.upgradePickaxe('vajra');
    store.upgradePickaxe('vajra');
    store.upgradePickaxe('vajra');
    expect(store.snap.pickaxe.veinName).toBe(store.snap.pickaxe.maxVeinName);
  });
});
