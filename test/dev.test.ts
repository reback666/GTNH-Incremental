import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { modelById } from './helpers';

// 设置页里的开发者模式：只是一组测试用的快捷操作，关着的时候一律不生效。
describe('开发者模式', () => {
  it('默认关闭，关着的时候快捷操作都不生效', () => {
    const core = new GameCore();
    expect(core.devMode).toBe(false);
    expect(core.devUnlockTo(14)).toBe(false);
    expect(core.maxTier).toBe(1);
    expect(core.devGrantResources()).toBe(false);
    expect(core.ores.every((ore) => ore.isZero())).toBe(true);
    expect(core.devGrantCables('10')).toBe(false);
    expect(core.cables.toString()).toBe('0');
    expect(core.devAdvance(60)).toBe(false);
    expect(core.playSeconds).toBe(0);
    expect(core.devClearMachines()).toBe(false);
  });

  it('解锁到某一级：开放矿脉，并把该级及以前都标记成已研究', () => {
    const core = new GameCore();
    core.setDevMode(true);
    expect(core.devUnlockTo(14)).toBe(true);

    expect(core.maxTier).toBe(14);
    expect(core.unlockedVeins).toEqual(Array.from({ length: 14 }, (_, index) => index));
    // 开发者模式一口气把 ZPM 及以后的机型都标成已研究
    expect(core.researchedModels.length).toBeGreaterThan(0);
    expect(core.researchTargetModel()).toBe(null);
    expect(core.isModelResearched(modelById('c-14'))).toBe(true);

    // 补一笔资源之后，MAX 的机器直接可买
    core.devGrantResources();
    expect(core.canAfford(modelById('c-14'))).toBe(true);
    expect(core.buy(modelById('c-14'), 1)).toBe(1);
  });

  it('给资源、给线缆、快进、清空机器', () => {
    const core = new GameCore();
    core.setDevMode(true);

    core.devGrantResources('1e6');
    expect(core.ores[0]!.toString()).toBe('1000000');
    expect(core.coins[13]!.toString()).toBe('1000000');

    core.devGrantCables('10');
    expect(core.cables.toString()).toBe('10');

    core.counts['m-1'] = 2;
    core.overclock['m-1'] = 1;
    core.faults['m-1'] = 1;
    core.storedEU = core.storedEU.plus('500');
    core.devClearMachines();
    expect(core.counts).toEqual({});
    expect(core.overclock).toEqual({});
    expect(core.faults).toEqual({});
    expect(core.storedEU.toString()).toBe('0');

    core.devAdvance(60);
    expect(core.playSeconds).toBe(60);
  });

  it('存档时间滑条：直接拨游玩时长，负数拒绝、超过上限收在 48 小时', () => {
    const core = new GameCore();
    // 关着开发者模式不生效
    expect(core.devSetPlaySeconds(3600)).toBe(false);
    core.setDevMode(true);

    expect(core.devSetPlaySeconds(90.7)).toBe(true);
    expect(core.playSeconds).toBe(90); // 向下取整

    expect(core.devSetPlaySeconds(-1)).toBe(false);
    expect(core.devSetPlaySeconds(48 * 3600 + 1)).toBe(true);
    expect(core.playSeconds).toBe(48 * 3600);

    // 只改时间读数，不跑模拟：不产资源也不涨累计
    core.devClearMachines();
    core.devSetPlaySeconds(7200);
    expect(core.playSeconds).toBe(7200);
    expect(core.totalEU.isZero()).toBe(true);
  });

  it('指定资源与数量：单种、整档都能增能减，减到 0 就停', () => {
    const core = new GameCore();
    core.setDevMode(true);

    expect(core.devAdjustResource({ scope: 'ore', tier: 2 }, '1e6', 1)).toBe(true);
    expect(core.ores[1]!.toString()).toBe('1000000');
    expect(core.ores[0]!.toString()).toBe('0');

    expect(core.devAdjustResource({ scope: 'coin', tier: 14 }, '500', 1)).toBe(true);
    expect(core.coins[13]!.toString()).toBe('500');
    expect(core.coins[0]!.toString()).toBe('0');

    expect(core.devAdjustResource({ scope: 'ores' }, '3', -1)).toBe(true);
    expect(core.ores[1]!.toString()).toBe('999997');
    expect(core.ores[0]!.toString()).toBe('0'); // 减到 0 就停，不会变成负数

    expect(core.devAdjustResource({ scope: 'coins' }, '500', -1)).toBe(true);
    expect(core.coins[13]!.toString()).toBe('0');

    expect(core.devAdjustResource({ scope: 'both' }, '2', 1)).toBe(true);
    expect(core.ores[1]!.toString()).toBe('999999');
    expect(core.coins[0]!.toString()).toBe('2');

    // 时空线缆也在同一套里：能加能减，减到 0 就停
    expect(core.devAdjustResource({ scope: 'cables' }, '10', 1)).toBe(true);
    expect(core.cables.toString()).toBe('10');
    expect(core.devAdjustResource({ scope: 'cables' }, '4', -1)).toBe(true);
    expect(core.cables.toString()).toBe('6');
    expect(core.devAdjustResource({ scope: 'cables' }, '99', -1)).toBe(true);
    expect(core.cables.toString()).toBe('0');
  });

  it('指定资源与数量：非法数量、越界等级、没开开发者模式都不生效', () => {
    const core = new GameCore();
    core.setDevMode(true);
    expect(core.devAdjustResource({ scope: 'ore', tier: 1 }, 'abc', 1)).toBe(false);
    expect(core.devAdjustResource({ scope: 'ore', tier: 1 }, '0', 1)).toBe(false);
    expect(core.devAdjustResource({ scope: 'ore', tier: 1 }, 'Infinity', 1)).toBe(false);
    expect(core.devAdjustResource({ scope: 'ore', tier: 99 }, '1', 1)).toBe(false);
    expect(core.ores.every((ore) => ore.isZero())).toBe(true);

    const off = new GameCore();
    expect(off.devAdjustResource({ scope: 'both' }, '1e12', 1)).toBe(false);
    expect(off.ores.every((ore) => ore.isZero())).toBe(true);
  });

  it('开关进存档，旧存档读进来默认是关的', () => {
    const core = new GameCore();
    core.setDevMode(true);
    const restored = deserialize(serialize(core));
    expect(restored.devMode).toBe(true);
    expect(serialize(restored)).toEqual(serialize(core));

    const legacy = { ...serialize(core), version: 7 } as Record<string, unknown>;
    delete legacy.devMode;
    expect(deserialize(legacy as never).devMode).toBe(false);
  });

  it('开发者模式解锁不会污染「历史最高电压」与成就', () => {
    const core = new GameCore();
    core.setDevMode(true);
    core.devUnlockTo(10);
    expect(core.maxTier).toBe(10);
    // peakTier 是玩家的履历统计（还挂着「最高电压」成就），测试工具不该顺手刷掉
    expect(core.peakTier).toBe(1);
  });
});
