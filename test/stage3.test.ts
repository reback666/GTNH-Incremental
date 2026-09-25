import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { MACHINE_MODELS, modelById } from '../src/game/models';
import { useGameStore } from '../src/game/store';
import { getCore } from '../src/game/engine';
import { dec } from '../src/numeric/decimal';

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

    const failed = MACHINE_MODELS.filter((model) => store.buy(model.id, 1, 'coin') !== 1).map(
      (model) => model.id,
    );
    expect(failed).toEqual([]);
  });
});
