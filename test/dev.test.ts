import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { modelById } from '../src/game/models';

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
    expect(core.researched).toEqual(Array.from({ length: 14 }, (_, index) => index + 1));
    expect(core.researchTargetTier()).toBe(null);
    expect(core.isResearched(14)).toBe(true);

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
});
