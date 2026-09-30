import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { dec } from '../src/numeric/decimal';
import {
  blastBonusPerUpgrade,
  blastBonus,
  blastChances,
  blastChanceTier,
  blastNextBonus,
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

// 升级现在要花对应电压的 GT 币：这些用例只关心升级本身，先把钱包填满
function funded(core: GameCore): GameCore {
  core.coins = core.coins.map(() => dec('1e30'));
  return core;
}

describe('镐子的三条升级线', () => {
  it('升级机会随电压等级发放：金刚杵从 LV 起每级 1 次、连锁采集每 2 级 1 次、连锁爆破每级 2 次', () => {
    // 金刚杵在 ULV 时没有机会（开局本来就能挖 T0，第一次升级对应 LV）
    expect(vajraChances(1)).toBe(0);
    expect(vajraChances(2)).toBe(1);
    expect(vajraChances(MAX_TIER)).toBe(13);
    expect(collectChances(1)).toBe(0);
    expect(collectChances(2)).toBe(1);
    expect(collectChances(MAX_TIER)).toBe(7);
    expect(blastChances(1)).toBe(2);
    expect(blastChances(MAX_TIER)).toBe(28);
  });

  it('金刚杵挖到 T13 就封顶（最高一档采矿机采的就是 T13）', () => {
    expect(vajraMaxLevel()).toBe(13);
  });

  it('连锁爆破每次机会的加值 = 2^(n/2)', () => {
    expect(blastBonusPerUpgrade(1).toSignificantDigits(6).toString()).toBe('1.41421');
    expect(blastBonusPerUpgrade(2).toString()).toBe('2');
    expect(blastBonusPerUpgrade(3).toSignificantDigits(6).toString()).toBe('2.82843');
    expect(blastBonusPerUpgrade(4).toSignificantDigits(6).toString()).toBe('4');
    expect(blastBonusPerUpgrade(9).toSignificantDigits(6).toString()).toBe('22.6274');
    expect(blastBonusPerUpgrade(14).toString()).toBe('128');
  });

  it('连锁爆破的加值在机会产生时就定死，跟之后升到多高电压无关', () => {
    // 前两次机会来自 ULV、第 3~4 次来自 LV、第 5~6 次来自 MV……
    expect(blastChanceTier(0)).toBe(1);
    expect(blastChanceTier(1)).toBe(1);
    expect(blastChanceTier(2)).toBe(2);
    expect(blastChanceTier(5)).toBe(3);
    // 同一批机会，在 MV 时点、还是攒到 MAX 再点，加的完全一样
    for (const used of [0, 1, 2, 3, 4, 5]) {
      expect(blastNextBonus(3, used).toString()).toBe(blastNextBonus(14, used).toString());
    }
    expect(blastNextBonus(14, 4).toSignificantDigits(6).toString()).toBe('2.82843'); // MV 给的那两次
    // 用满时，总和 = 每个电压那两次机会的加值逐批加起来
    expect(blastBonus(3, 6).toString()).toBe('12.48528137423857029281013234525818847142');
    let total = dec('0');
    for (let t = 1; t <= 14; t += 1) {
      total = total.plus(blastBonusPerUpgrade(t).times(2));
    }
    expect(blastBonus(14, 28).toString()).toBe(total.toString());
  });

  it('连锁采集每级翻倍：0 级 ×1、7 级 ×128', () => {
    expect(collectMultiplier(0).toString()).toBe('1');
    expect(collectMultiplier(1).toString()).toBe('2');
    expect(collectMultiplier(7).toString()).toBe('128');
  });

  it('结算顺序：先加连锁爆破，再乘连锁采集', () => {
    // 4 级用掉 4 次爆破机会：ULV 两次 +2^0.5、LV 两次 +2^1，合计 +6.8284；再 × 4（采集 2 级）
    const output = pickaxeOutputPerClick({ tier: 4, blastUsed: 4, collectLevel: 2 });
    expect(output.toSignificantDigits(10).toString()).toBe('31.3137085');
    // 若先乘后加会得到 10.8284，这里确认不是那个顺序
    expect(output.toSignificantDigits(10).toString()).not.toBe('10.82842712');
  });

  it('MAX 用满全部机会时的产出', () => {
    const output = pickaxeOutputPerClick({ tier: 14, blastUsed: 28, collectLevel: 7 });
    expect(output.toSignificantDigits(12).toString()).toBe('111130.91134');
  });

  it('图标按升级次数取色：分母是总次数，前期不会一次跳满', () => {
    // 没升级时三条线都是 ULV 色
    expect(pickaxeIconTier('vajra', 0)).toBe(1);
    expect(pickaxeIconTier('collect', 0)).toBe(1);
    expect(pickaxeIconTier('blast', 0)).toBe(1);

    // 金刚杵 13 次走完 14 档，所以一级一档：
    // ULV 时升 1 次（总共才 1 次机会）也只是 LV 色，不会跳到 MAX
    expect(pickaxeIconTier('vajra', 1)).toBe(2);
    expect(pickaxeIconTier('vajra', 2)).toBe(3);
    expect(pickaxeIconTier('vajra', 13)).toBe(14);

    // 连锁采集 7 次走完 14 档，每次往前挪约两档
    expect(pickaxeIconTier('collect', 1)).toBe(2);
    expect(pickaxeIconTier('collect', 2)).toBe(4);
    expect(pickaxeIconTier('collect', 7)).toBe(14);

    // 连锁爆破 28 次走完 14 档，两次左右挪一档
    expect(pickaxeIconTier('blast', 1)).toBe(1);
    expect(pickaxeIconTier('blast', 2)).toBe(1);
    expect(pickaxeIconTier('blast', 3)).toBe(2);
    expect(pickaxeIconTier('blast', 28)).toBe(14);
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
    const core = funded(new GameCore());
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    core.upgradePickaxe('vajra');
    expect(core.pickaxeVeinTier()).toBe(1);
    core.manualMine();
    // T1 矿脉产 T0 与 T1 两种，各拿一半
    expect(core.ores[0]!.toString()).toBe('0.5');
    expect(core.ores[1]!.toString()).toBe('0.5');
  });

  it('ULV 时金刚杵还没开放，到 LV 才有第一次机会', () => {
    const core = funded(new GameCore());
    expect(core.pickaxeCap('vajra')).toBe(0);
    expect(core.canUpgradePickaxe('vajra')).toBe(false);
    expect(core.upgradePickaxe('vajra')).toBe(false);
    expect(core.pickaxeVajra).toBe(0);

    core.maxTier = 2; // 解锁 LV
    expect(core.pickaxeCap('vajra')).toBe(1);
    expect(core.upgradePickaxe('vajra')).toBe(true);
    expect(core.pickaxeVajra).toBe(1);
  });

  it('金刚杵等级不够时，挖的还是镐子够得着的那一级', () => {
    const core = funded(new GameCore());
    core.maxTier = 4;
    core.unlockedVeins = [0, 1, 2, 3];
    expect(core.pickaxeVeinTier()).toBe(0);
    core.upgradePickaxe('vajra');
    expect(core.pickaxeVeinTier()).toBe(1);
  });

  it('机会用完之后不能再升', () => {
    const core = funded(new GameCore());
    expect(core.canUpgradePickaxe('collect')).toBe(false); // ULV 时连锁采集还没有机会
    expect(core.canUpgradePickaxe('blast')).toBe(true);
    core.upgradePickaxe('blast');
    core.upgradePickaxe('blast');
    expect(core.canUpgradePickaxe('blast')).toBe(false);
    expect(core.pickaxeBlast).toBe(2);
  });

  it('金刚杵挖满 T13 之后不再消耗机会', () => {
    const core = funded(new GameCore());
    core.maxTier = MAX_TIER;
    for (let i = 0; i < 13; i += 1) core.upgradePickaxe('vajra');
    expect(core.pickaxeVajra).toBe(13);
    expect(core.canUpgradePickaxe('vajra')).toBe(false);
  });

  it('连锁爆破已经用掉的机会不会因为电压变高而增值', () => {
    const core = funded(new GameCore());
    core.maxTier = 4;
    core.upgradePickaxe('blast'); // 第 1 次机会来自 ULV，加值 +2^0.5
    expect(core.pickaxeOutput().toSignificantDigits(9).toString()).toBe('2.41421356');
    core.maxTier = 6;
    expect(core.pickaxeOutput().toSignificantDigits(9).toString()).toBe('2.41421356'); // 没跟着电压涨
    // 第 2 次机会也来自 ULV，还是 +2^0.5
    core.upgradePickaxe('blast');
    expect(core.pickaxeOutput().toSignificantDigits(9).toString()).toBe('3.82842712');
    // 第 3 次机会来自 LV，才按 LV 算：+2
    core.upgradePickaxe('blast');
    expect(core.pickaxeOutput().toSignificantDigits(9).toString()).toBe('5.82842712');
  });

  it('转生之后镐子回到开局状态', () => {
    const core = funded(new GameCore());
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
    const core = funded(new GameCore());
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
    // 三条线都还没升过级：都是 ULV 色，跟当前电压无关
    expect(pickaxe.lines.map((line) => line.iconTier)).toEqual([1, 1, 1]);
    // 已经到了 HV：三条线都开放了
    expect(pickaxe.lines.map((line) => line.locked)).toEqual([false, false, false]);
  });

  it('ULV 时金刚杵在界面上标「未开放」', () => {
    const store = useGameStore();
    store.boot();
    getCore().maxTier = 1;
    store.refresh();

    const vajra = store.snap.pickaxe.lines[0]!;
    expect(vajra.locked).toBe(true);
    expect(vajra.cap).toBe(0);
    expect(vajra.canUpgrade).toBe(false);
  });

  it('点了升级就立刻反映到产出、矿脉与图标上', () => {
    const store = useGameStore();
    store.boot();
    const core = funded(getCore());
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
    const core = funded(getCore());
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
