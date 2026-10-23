import { MAX_TIER } from '../src/numeric/voltage';
import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { MACHINE_MODELS } from '../src/game/models';
import { modelById } from './helpers';
import { useGameStore } from '../src/game/store';
import { getCore } from '../src/game/engine';
import { dec } from '../src/numeric/decimal';
import { rebirthCables } from '../src/numeric/rebirth';
import { REBIRTH_NODES } from '../src/game/rebirth';

// 计划书第七章资源四、第二十章第三阶段：ZPM 及以后的机型是硬墙，
// 要靠计算机产算力、研究站推进研究进度才能解锁。
describe('第三阶段：研究硬墙', () => {
  it('ZPM 机型在研究出来之前买不了，研究完才能建', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.coins[6] = dec('1000000000'); // 买 tier 8 用 LuV（tier 7）的币
    const zpmMachine = modelById('c-8');

    expect(core.isModelResearched(zpmMachine)).toBe(false);
    expect(core.researchTargetModel()).toBe(null); // 手选：没选项目就没有目标
    expect(core.canAfford(zpmMachine)).toBe(false);
    expect(core.buy(zpmMachine, 1)).toBe(0);
    expect(core.countOf('c-8')).toBe(0);

    // 研究是逐机型的：研究出「ZPM 制造机」只解锁它自己
    expect(core.setResearchTarget('c-8')).toBe(true);
    expect(core.researchTargetModel()?.id).toBe('c-8');
    core.researchedModels.push('c-8');
    expect(core.researchTargetModel()).toBe(null);
    expect(core.isModelResearched(modelById('m-8'))).toBe(false); // 同级的采矿机还没研究
    expect(core.canAfford(zpmMachine)).toBe(true);
    expect(core.buy(zpmMachine, 1)).toBe(1);
  });

  it('LuV 及以前不用研究，开局就能买', () => {
    const core = new GameCore();
    core.maxTier = 7;
    expect(core.isModelResearched(modelById('m-1'))).toBe(true);
    expect(core.isModelResearched(modelById('r-7'))).toBe(true);
    expect(core.isModelResearched(modelById('c-8'))).toBe(false);
    expect(core.researchTargetModel()).toBe(null); // 还没选项目
  });

  it('计算机产算力、研究站吃算力推进选中的机型，攒满解锁它', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.counts['x-7'] = 1; // 一台 LuV 计算机：1 算力/秒、32768 EU/t
    core.counts['r-7'] = 1; // 一台 LuV 研究站：吃掉 1 算力/秒
    core.storedEU = dec('100000000'); // 拿存电顶住耗电，便于单独验证研究
    // 普通电网每 5 分钟有 5% 概率断电，断电那一拍算力为 0；这里固定成不会触发
    core.random = () => 0.999;
    expect(core.setResearchTarget('c-8')).toBe(true);
    const required = core.researchRequiredFor(modelById('c-8'));

    const report = core.tick(1);
    expect(report.computeProduced.toString()).toBe('1');
    expect(report.computeUsed.toString()).toBe('1');
    expect(report.computeWasted.toString()).toBe('0');
    expect(report.researchGained.toString()).toBe('1');
    expect(core.researchProgressOf('c-8').toString()).toBe('1');
    expect(report.researchUnlocked).toBe(null);

    const done = core.tick(required.toNumber() + 1);
    expect(done.researchUnlocked).toBe('c-8');
    expect(core.isModelResearched(modelById('c-8'))).toBe(true);
    expect(core.researchProgressOf('c-8').toString()).toBe('0');
    expect(core.researchTargetModel()).toBe(null); // 研究完就清空，等玩家挑下一个
  });

  it('没选项目时研究站空转，算力白产', () => {
    const core = new GameCore();
    core.maxTier = 8; // ZPM 已经解锁，但玩家还没挑研究项目
    core.counts['x-7'] = 1;
    core.counts['r-7'] = 1;
    core.storedEU = dec('1000000');

    const report = core.tick(1);
    expect(core.labComputeDemand().toString()).toBe('0');
    expect(report.computeUsed.toString()).toBe('0');
    expect(report.computeWasted.toString()).toBe('1');
    expect(Object.keys(core.researchProgress)).toEqual([]);
  });

  it('缺电时算力按供电比例少产，研究跟着变慢', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.counts['x-7'] = 1;
    core.counts['r-7'] = 1;
    // 一台 IV 内燃发电机只有 8192 EU/t，喂不满 32768 EU/t 的计算机
    core.ores[5] = dec('100000');
    core.counts['g-iv-comb'] = 1;

    const report = core.tick(1);
    expect(report.powerRatio).toBeLessThan(1);
    expect(report.computeProduced.lt('1')).toBe(true);
    expect(report.researchGained.lt('1')).toBe(true);
  });

  it('存档往返保留研究进度与已研究的机型', () => {
    const core = new GameCore();
    core.maxTier = 9;
    core.researchedModels.push('c-8');
    core.researchTarget = 'm-9';
    core.researchProgress = { 'm-9': dec('123.456') };
    core.counts['x-7'] = 2;
    core.counts['r-8'] = 1;

    const restored = deserialize(serialize(core));
    expect(restored.researchedModels).toEqual(['c-8']);
    expect(restored.researchProgressOf('m-9').toString()).toBe('123.456');
    expect(restored.countOf('x-7')).toBe(2);
    expect(restored.countOf('r-8')).toBe(1);
    expect(restored.researchTargetModel()?.id).toBe('m-9');
    expect(serialize(restored)).toEqual(serialize(core));
  });

  it('旧存档读进来：老存档研究过的等级整级解锁，旧的进度挂到那一级第一台机器上', () => {
    const core = new GameCore();
    core.maxTier = 8;
    const legacy = { ...serialize(core), version: 5 } as Record<string, unknown>;
    delete legacy.researched;
    delete legacy.researchProgress;
    delete legacy.researchTarget;
    delete legacy.researchProgressByTier;
    delete legacy.researchedModels;
    delete legacy.researchTargetModel;
    delete legacy.researchProgressByModel;

    const restored = deserialize(legacy as never);
    expect(restored.researchedModels).toEqual([]);
    expect(restored.researchTargetModel()).toBe(null);
    expect(restored.isModelResearched(modelById('c-8'))).toBe(false);

    // v16 的存档：研究过 ZPM 级 → 这一级所有机型整级解锁；进度挂到该级第一台没研究的机器上
    const older = {
      ...serialize(core),
      version: 16,
      researched: [1, 2, 3, 4, 5, 6, 7, 8],
      researchTarget: 9,
      researchProgressByTier: { 9: '500' },
    } as Record<string, unknown>;
    delete older.researchedModels;
    delete older.researchTargetModel;
    delete older.researchProgressByModel;

    const migrated = deserialize(older as never);
    expect(migrated.isModelResearched(modelById('c-8'))).toBe(true);
    const uv = migrated.researchTargetModel();
    expect(uv?.tier).toBe(9);
    expect(migrated.researchProgressOf(uv!.id).toString()).toBe('500');
  });

  it('手选研究项目：每台机器单独研究，进度各记各的', () => {
    const core = new GameCore();
    core.maxTier = 9;
    core.counts['x-7'] = 1;
    core.counts['r-7'] = 1;
    core.storedEU = dec('100000000');
    core.random = () => 0.999;

    // 列出来的是一台台机器：同级的不同机型各是一张研究单
    const options = core.researchOptions();
    expect(options.length).toBeGreaterThan(8);
    expect(options.map((model) => model.id)).toContain('c-8');
    expect(options.map((model) => model.id)).toContain('m-8');
    expect(core.setResearchTarget('c-7')).toBe(false); // LuV 及以前不用研究
    expect(core.setResearchTarget('c-8')).toBe(true);
    expect(core.setResearchTarget('m-14')).toBe(true); // 电压没到也能先研究

    core.tick(10);
    expect(core.researchProgressOf('m-14').toString()).toBe('10');

    // 换到另一台：先研究的那份进度留在自己名下，不会被搬过去
    expect(core.setResearchTarget('c-8')).toBe(true);
    core.tick(10);
    expect(core.researchProgressOf('c-8').toString()).toBe('10');
    expect(core.researchProgressOf('m-14').toString()).toBe('10');

    // 已经研究出来的机器不能再选
    core.researchedModels.push('c-8');
    expect(core.setResearchTarget('c-8')).toBe(false);
  });
});

// 计划书第五章：转生两条路 —— 打到 MAX 按公式结算，或第一次到 LuV 时穿时空裂缝。
describe('第三阶段：转生与永久加成', () => {
  it('到 LuV 会挂起时空裂缝，穿过去固定拿 1 条线缆并重开一轮', () => {
    const core = new GameCore();
    core.maxTier = 7;
    expect(core.riftPending()).toBe(true);
    core.counts['m-1'] = 5;
    core.runEU = dec('1e30'); // 缝裂不看累计 EU，多高都只给固定数

    expect(core.rebirth('rift')?.toString()).toBe('1');
    expect(core.cables.toString()).toBe('1');
    expect(core.rebirthCount).toBe(1);
    expect(core.maxTier).toBe(1);
    expect(core.counts).toEqual({});
    expect(core.unlockedVeins).toEqual([0]);
    expect(core.researchedModels).toEqual([]);
    expect(core.runEU.toString()).toBe('0');
    expect(core.riftPending()).toBe(false); // 新周目还没到 LuV
  });

  it('拒绝裂缝之后本周目只剩 MAX 一条路', () => {
    const core = new GameCore();
    core.maxTier = 7;
    expect(core.declineRift()).toBe(true);
    expect(core.riftPending()).toBe(false);
    expect(core.canRebirth('rift')).toBe(false);
    expect(core.rebirth('rift')).toBe(null);
    expect(core.rebirthCount).toBe(0);
  });

  it('打到 MAX 按公式结算，没到 MAX 不能转生', () => {
    const core = new GameCore();
    core.maxTier = MAX_TIER;
    core.runEU = dec('1e24');
    const expected = rebirthCables({ totalEU: '1e24', maxTier: MAX_TIER, rebirthCount: 0 });
    expect(core.cablesFor('max').toString()).toBe(expected.toString());
    expect(core.rebirth('max')?.toString()).toBe(expected.toString());
    expect(core.cables.toString()).toBe(expected.toString());
    expect(core.rebirthCount).toBe(1);

    const early = new GameCore();
    early.maxTier = 13;
    expect(early.canRebirth('max')).toBe(false);
    expect(early.rebirth('max')).toBe(null);
  });

  it('转生只清本周目，线缆 / 加成 / 次数 / 累计统计都留下', () => {
    const core = new GameCore();
    core.maxTier = MAX_TIER;
    core.ores[0] = dec('100');
    core.coins[3] = dec('5');
    core.counts['m-1'] = 3;
    core.overclock['m-1'] = 2;
    core.faults['m-1'] = 1;
    core.storedEU = dec('500');
    core.pollution = dec('40');
    core.grid = 'black';
    core.grids = ['normal', 'black'];
    core.siphoned = dec('9');
    core.researchTarget = 'm-9';
    core.researchProgress = { 'm-9': dec('500') };
    core.researchedModels.push('c-8');
    core.cables = dec('3');
    core.rebirthNodes = ['speed-1'];
    core.playSeconds = 1000;
    core.totalOre = dec('77');
    core.totalCoins = dec('88');
    core.totalEU = dec('99');

    core.rebirth('max');

    // 本周目清空
    expect(core.ores.every((ore) => ore.isZero())).toBe(true);
    expect(core.coins.every((coin) => coin.isZero())).toBe(true);
    expect(core.counts).toEqual({});
    expect(core.overclock).toEqual({});
    expect(core.faults).toEqual({});
    expect(core.storedEU.toString()).toBe('0');
    expect(core.pollution.toString()).toBe('0');
    expect(core.grid).toBe('normal');
    expect(core.grids).toEqual(['normal']);
    expect(core.siphoned.toString()).toBe('0');
    expect(core.researchTargetModel()).toBe(null);
    expect(Object.keys(core.researchProgress)).toEqual([]);
    expect(core.researchedModels).toEqual([]);
    expect(core.runEU.toString()).toBe('0');

    // 跨周目的留下
    expect(core.cables.gte(3)).toBe(true);
    expect(core.rebirthNodes).toEqual(['speed-1']);
    expect(core.rebirthCount).toBe(1);
    expect(core.playSeconds).toBe(1000);
    expect(core.totalOre.toString()).toBe('77');
    expect(core.totalCoins.toString()).toBe('88');
    expect(core.totalEU.toString()).toBe('99');
  });

  it('加成真的落到数值上：速度 / 算力 / 研究需求 / 燃料效率', () => {
    const core = new GameCore();
    core.counts['m-1'] = 1;
    const miner = modelById('m-1');
    // ULV 采矿机比 LV 慢一倍：全局提速 8 倍后 2 秒一枚（计划书第四章）
    expect(core.minerOutputPerSecond(miner).toString()).toBe('0.5');

    core.rebirthNodes.push('speed-1'); // 全机器速度 +4%
    expect(core.minerOutputPerSecond(miner).toString()).toBe('0.52');

    core.rebirthNodes.push('research-2b'); // 研究需求 -8%
    // ZPM 制造机：1000 ÷ 该级机型数（9 台）× 0.92
    expect(core.researchRequiredFor(modelById('c-8')).toNumber()).toBeCloseTo(102.22, 2);

    core.rebirthNodes.push('research-2a'); // 计算机算力 +8%
    core.counts['x-7'] = 1;
    core.maxTier = 7;
    expect(core.computerComputeRated().toString()).toBe('1.08');

    core.rebirthNodes.push('economy-2b'); // 发电机燃料效率 +5%
    const generator = modelById('g-ulv');
    const before = new GameCore().generatorFuelRateOf(generator);
    expect(core.generatorFuelRateOf(generator).lt(before)).toBe(true);
  });

  it('加成树要先买内层、线缆够才能点亮', () => {
    const core = new GameCore();
    core.cables = dec('1');
    expect(core.canBuyRebirthNode('speed-2a')).toBe(false); // 前置没买
    expect(core.buyRebirthNode('speed-2a')).toBe(false);
    expect(core.buyRebirthNode('speed-1')).toBe(true);
    expect(core.cables.toString()).toBe('0');
    expect(core.buyRebirthNode('speed-1')).toBe(false); // 已买过
    expect(core.buyRebirthNode('speed-2a')).toBe(false); // 2 条，线缆不够
    core.cables = dec('2');
    expect(core.buyRebirthNode('speed-2a')).toBe(true);
    expect(core.cables.toString()).toBe('0');
    // 买满整棵树（时空星图扩展后，价格表如有意调整应同步改这条）
    expect(
      REBIRTH_NODES.reduce((sum, node) => sum.plus(dec(node.cost)), dec('0')).toString(),
    ).toBe('289');
    expect(REBIRTH_NODES.length).toBe(51);
  });

  it('存档往返保留转生状态', () => {
    const core = new GameCore();
    core.maxTier = MAX_TIER;
    core.cables = dec('5');
    core.rebirthCount = 2;
    core.rebirthNodes = ['speed-1', 'economy-1'];
    core.runEU = dec('1.5e20');
    core.totalEU = dec('9e20');
    core.riftOffered = true;

    const restored = deserialize(serialize(core));
    expect(restored.cables.toString()).toBe('5');
    expect(restored.rebirthCount).toBe(2);
    expect(restored.rebirthNodes).toEqual(['speed-1', 'economy-1']);
    expect(restored.runEU.toString()).toBe('150000000000000000000');
    expect(restored.totalEU.toString()).toBe('900000000000000000000');
    expect(restored.riftOffered).toBe(true);
    expect(serialize(restored)).toEqual(serialize(core));
  });

  it('旧存档（v6）读进来时转生状态是空的，且不会立刻弹裂缝', () => {
    const core = new GameCore();
    core.maxTier = 8;
    const legacy = { ...serialize(core), version: 6 } as Record<string, unknown>;
    for (const key of ['cables', 'rebirthCount', 'rebirthNodes', 'runEU', 'totalEU', 'riftOffered']) {
      delete legacy[key];
    }

    const restored = deserialize(legacy as never);
    expect(restored.cables.toString()).toBe('0');
    expect(restored.rebirthCount).toBe(0);
    expect(restored.rebirthNodes).toEqual([]);
    expect(restored.runEU.toString()).toBe('0');
    expect(restored.riftOffered).toBe(true); // 已经在 LuV 以上，按「这个点早就过了」算
    expect(restored.riftPending()).toBe(false);
  });
});

// 界面上的购买入口是按机型 id 查表找机型的，漏一个类别就会「按钮能点但买不到」。
describe('界面购买入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('每一个机型都能通过界面买到（曾经漏了净化器）', () => {
    const store = useGameStore();
    store.boot();
    const core = getCore();
    core.maxTier = MAX_TIER;
    core.coins = core.coins.map(() => dec('1e30'));
    core.ores = core.ores.map(() => dec('1e30'));
    core.researchedModels = MACHINE_MODELS.map((model) => model.id);

    // 灵气节点 / 腐蚀抑制器分别是奥术与深渊宇宙专属：没有对应宇宙时买不到
    expect(store.buy('n-1', 1, 'coin')).toBe(0);
    expect(store.buy('s-1', 1, 'coin')).toBe(0);
    core.universes = ['arcane', 'abyss'];

    const failed = MACHINE_MODELS.filter((model) => store.buy(model.id, 1, 'coin') !== 1).map(
      (model) => model.id,
    );
    expect(failed).toEqual([]);
  });

  it('机器面板的标签随进度出现：灵气节点要奥术宇宙，研究要到 LuV', () => {
    const store = useGameStore();
    store.boot();
    const core = getCore();
    core.maxTier = 3;
    core.universes = [];
    store.refresh();
    const kinds = () => store.snap.columns.map((column) => column.kind);
    expect(kinds()).not.toContain('research');
    expect(kinds()).not.toContain('arcane');

    // 到 LuV 出现「研究」
    core.maxTier = 7;
    store.refresh();
    expect(kinds()).toContain('research');
    expect(kinds()).not.toContain('arcane');
    expect(store.snap.research.unlocked).toBe(true);

    // 拥有奥术宇宙才出现「灵气节点」
    core.universes = ['arcane'];
    store.refresh();
    expect(kinds()).toContain('arcane');
  });

  // 电网省电是作用在耗电机器上的：面板上的耗电读数必须跟着一起变，
  // 否则模拟里省了电、界面上看不出来（曾经就是这样）。
  it('耗电读数跟着电网倍率走', () => {
    const store = useGameStore();
    store.boot();
    const core = getCore();
    core.maxTier = 4;
    core.counts = { 'c-2': 10 }; // 10 台 LV 制造机，额定 32 EU/t 一台
    core.grids = ['normal', 'stable', 'volatile', 'black'];

    core.grid = 'normal';
    store.refresh();
    expect(store.snap.power.consumed.value).toBe('320 EU/t');

    core.grid = 'black'; // -15%
    store.refresh();
    expect(store.snap.power.consumed.value).toBe('272 EU/t');

    core.grid = 'stable'; // +8%
    store.refresh();
    expect(store.snap.power.consumed.value).toBe('346 EU/t');
  });
});
