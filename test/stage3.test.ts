import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { MACHINE_MODELS, modelById } from '../src/game/models';
import { useGameStore } from '../src/game/store';
import { getCore } from '../src/game/engine';
import { dec } from '../src/numeric/decimal';
import { rebirthCables } from '../src/numeric/rebirth';
import { REBIRTH_NODES, treeTotalCost } from '../src/game/rebirth';

// 计划书第七章资源四、第二十章第三阶段：ZPM 及以后的机型是硬墙，
// 要靠计算机产算力、研究站推进研究进度才能解锁。
describe('第三阶段：研究硬墙', () => {
  it('ZPM 机型在研究出来之前买不了，研究完才能建', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.coins[6] = dec('1000000000'); // 买 tier 8 用 LuV（tier 7）的币
    const zpmMachine = modelById('c-8');

    expect(core.isResearched(8)).toBe(false);
    expect(core.researchTargetTier()).toBe(8);
    expect(core.canAfford(zpmMachine)).toBe(false);
    expect(core.buy(zpmMachine, 1)).toBe(0);
    expect(core.countOf('c-8')).toBe(0);

    core.researched.push(8);
    expect(core.researchTargetTier()).toBe(null);
    expect(core.canAfford(zpmMachine)).toBe(true);
    expect(core.buy(zpmMachine, 1)).toBe(1);
  });

  it('LuV 及以前不用研究，开局就能买', () => {
    const core = new GameCore();
    core.maxTier = 7;
    expect(core.isResearched(1)).toBe(true);
    expect(core.isResearched(7)).toBe(true);
    expect(core.isResearched(8)).toBe(false);
    expect(core.researchTargetTier()).toBe(null); // 还没解锁 ZPM，没有目标
  });

  it('计算机产算力、研究站吃算力推进进度，攒满自动解锁该级', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.counts['x-7'] = 1; // 一台 LuV 计算机：1 算力/秒、32768 EU/t
    core.counts['r-7'] = 1; // 一台 LuV 研究站：吃掉 1 算力/秒
    core.storedEU = dec('100000000'); // 拿存电顶住耗电，便于单独验证研究
    // 普通电网每 5 分钟有 5% 概率断电，断电那一拍算力为 0；这里固定成不会触发
    core.random = () => 0.999;

    const report = core.tick(1);
    expect(report.computeProduced.toString()).toBe('1');
    expect(report.computeUsed.toString()).toBe('1');
    expect(report.computeWasted.toString()).toBe('0');
    expect(report.researchGained.toString()).toBe('1');
    expect(core.researchProgress.toString()).toBe('1');
    expect(report.researchUnlocked).toBe(null);

    const done = core.tick(999);
    expect(done.researchUnlocked).toBe(8);
    expect(core.isResearched(8)).toBe(true);
    expect(core.researchProgress.toString()).toBe('0');
  });

  it('没有研究目标时研究站空转，算力白产', () => {
    const core = new GameCore();
    core.maxTier = 7; // 还没解锁 ZPM，没有目标
    core.counts['x-7'] = 1;
    core.counts['r-7'] = 1;
    core.storedEU = dec('1000000');

    const report = core.tick(1);
    expect(core.labComputeDemand().toString()).toBe('0');
    expect(report.computeUsed.toString()).toBe('0');
    expect(report.computeWasted.toString()).toBe('1');
    expect(core.researchProgress.toString()).toBe('0');
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

  it('存档往返保留研究进度与已研究的等级', () => {
    const core = new GameCore();
    core.maxTier = 9;
    core.researched.push(8);
    core.researchProgress = dec('123.456');
    core.counts['x-7'] = 2;
    core.counts['r-8'] = 1;

    const restored = deserialize(serialize(core));
    expect(restored.researched).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(restored.researchProgress.toString()).toBe('123.456');
    expect(restored.countOf('x-7')).toBe(2);
    expect(restored.countOf('r-8')).toBe(1);
    expect(restored.researchTargetTier()).toBe(9);
    expect(serialize(restored)).toEqual(serialize(core));
  });

  it('旧存档（v5）读进来时默认只有 LuV 及以前已研究', () => {
    const core = new GameCore();
    core.maxTier = 8;
    const legacy = { ...serialize(core), version: 5 } as Record<string, unknown>;
    delete legacy.researched;
    delete legacy.researchProgress;

    const restored = deserialize(legacy as never);
    expect(restored.researched).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(restored.researchTargetTier()).toBe(8);
    expect(restored.isResearched(8)).toBe(false);
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
    expect(core.researched).toEqual([1, 2, 3, 4, 5, 6, 7]);
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
    core.maxTier = 14;
    core.runEU = dec('1e24');
    const expected = rebirthCables({ totalEU: '1e24', maxTier: 14, rebirthCount: 0 });
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
    core.maxTier = 14;
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
    core.researchProgress = dec('500');
    core.researched.push(8);
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
    expect(core.researchProgress.toString()).toBe('0');
    expect(core.researched).toEqual([1, 2, 3, 4, 5, 6, 7]);
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
    // ULV 采矿机比 LV 慢一倍：16 秒一枚（计划书第四章）
    expect(core.minerOutputPerSecond(miner).toString()).toBe('0.0625');

    core.rebirthNodes.push('speed-1'); // 全机器速度 +4%
    expect(core.minerOutputPerSecond(miner).toString()).toBe('0.065');

    core.rebirthNodes.push('research-2b'); // 研究需求 -8%
    expect(core.researchRequiredFor(8).toString()).toBe('920');

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
    expect(treeTotalCost().toString()).toBe('51');
    expect(REBIRTH_NODES.length).toBe(15);
  });

  it('存档往返保留转生状态', () => {
    const core = new GameCore();
    core.maxTier = 14;
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
    core.maxTier = 14;
    core.coins = core.coins.map(() => dec('1e30'));
    core.ores = core.ores.map(() => dec('1e30'));
    core.researched = Array.from({ length: 14 }, (_, index) => index + 1);

    // 灵气节点是奥术宇宙专属：没有宇宙时买不到，选上之后才买得到
    expect(store.buy('n-1', 1, 'coin')).toBe(0);
    core.universes = ['arcane'];

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
});
