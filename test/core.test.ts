import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize, type SaveData } from '../src/game/save';
import { modelById, modelsOf } from '../src/game/models';
import { dec } from '../src/numeric/decimal';

const ULV_MINER = 'm-1';
const ULV_GENERATOR = 'g-ulv';
const ULV_MACHINE = 'c-1';

// 从实际使用入口验证：开局手动挖矿 → 造机器 → 循环转起来 → 解锁 LV。
describe('游戏核心：ULV → LV 完整循环', () => {
  it('机型目录：LV 的发电机有三种，其中一种是多方块', () => {
    const lv = modelsOf('generator').filter((model) => model.tier === 2);
    expect(lv.map((model) => model.name)).toEqual([
      '基础蒸汽轮机',
      '基础内燃发电机',
      '基础燃气轮机',
    ]);
    const multiblocks = modelsOf('generator').filter((model) => model.block === 'multiblock');
    expect(multiblocks.length).toBeGreaterThan(0);
    expect(multiblocks[0]!.traits).toContain('不按需发电');
  });

  it('开局靠手动挖矿攒够第一台机器', () => {
    const core = new GameCore();
    const machine = modelById(ULV_MACHINE);
    expect(core.coinPriceOf(machine).toString()).toBe('500');
    expect(core.orePriceOf(machine).toString()).toBe('5'); // 500 币 ÷ 100
    for (let i = 0; i < 5; i += 1) core.manualMine();
    expect(core.ores[0]!.toString()).toBe('5');
    expect(core.buy(machine, 1, 'ore')).toBe(1);
    expect(core.countOf(ULV_MACHINE)).toBe(1);
    expect(core.ores[0]!.toString()).toBe('0');
  });

  it('ULV 制造机每秒产出 1 枚币', () => {
    const core = new GameCore();
    core.ores[0] = dec('1000');
    core.counts[ULV_GENERATOR] = 1;
    core.counts[ULV_MACHINE] = 1;
    core.tick(1);
    expect(core.coins[0]!.toString()).toBe('1');
  });

  it('机器建齐之后矿石与币都在动', () => {
    const core = new GameCore();
    core.ores[0] = dec('1000');
    core.counts[ULV_MINER] = 3;
    core.counts[ULV_GENERATOR] = 3;
    core.counts[ULV_MACHINE] = 1;
    const before = core.ores[0]!.toString();
    const report = core.tick(1);

    expect(report.powerRatio).toBe(1);
    expect(report.euGenerated.toString()).toBe('24');
    expect(core.coins[0]!.toString()).toBe('1');
    expect(report.oreGained[0]!.toString()).toBe('0.1875');
    expect(core.ores[0]!.lt(before)).toBe(true);
  });

  it('电力不足时整体降载', () => {
    const core = new GameCore();
    core.ores[0] = dec('100');
    core.counts[ULV_MINER] = 3;
    core.counts[ULV_GENERATOR] = 1;
    core.counts[ULV_MACHINE] = 1;
    const report = core.tick(1);
    expect(report.powerRatio).toBeLessThan(1);
    // 开局接的是普通电网（耗电不打折），1 台 ULV 发电机只够 8/14
    expect(report.powerRatio).toBeGreaterThan(0.5);
    expect(Number(core.coins[0]!.toString())).toBeLessThan(1);
    expect(Number(core.coins[0]!.toString())).toBeGreaterThan(0.5);
  });

  it('没有矿石当燃料时，发电机发不出电，整个工厂停摆', () => {
    const core = new GameCore();
    core.counts[ULV_MINER] = 2;
    core.counts[ULV_GENERATOR] = 2;
    core.counts[ULV_MACHINE] = 1;
    const report = core.tick(1);
    expect(report.powerRatio).toBe(0);
    expect(core.coins[0]!.toString()).toBe('0');
  });

  it('同一等级的机型可以各买各的，价格按机型系数走', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    core.coins[0] = dec('100000');
    const steam = modelById('g-lv-steam');
    const combustion = modelById('g-lv-comb');
    expect(core.coinPriceOf(steam).toString()).toBe('2000'); // 500 × 4 × 1.0
    expect(core.coinPriceOf(combustion).toString()).toBe('2400'); // 500 × 4 × 1.2
    expect(core.buy(steam, 1)).toBe(1);
    expect(core.buy(combustion, 1)).toBe(1);
    expect(core.countOf(steam.id)).toBe(1);
    expect(core.countOf(combustion.id)).toBe(1);
    // 内燃机效率 95% 高于蒸汽轮机 85%，同样烧矿能多发约 12% 的电
    expect(combustion.fuelEfficiency).toBe('0.95');
    expect(steam.fuelEfficiency).toBe('0.85');
  });

  it('攒够币可以解锁 LV，并开放 T1 矿脉', () => {
    const core = new GameCore();
    expect(core.unlockCostOf(2).toString()).toBe('20000');
    expect(core.canUnlock(2)).toBe(false);
    core.coins[0] = core.coins[0]!.plus('20000');
    expect(core.unlock(2)).toBe(true);
    expect(core.maxTier).toBe(2);
    expect(core.unlockedVeins).toEqual([0, 1]);
    expect(core.coins[0]!.toString()).toBe('0');
  });

  it('没有 LV 采矿机时 T1 矿石不会自己涨', () => {
    const core = new GameCore();
    core.ores[0] = dec('100');
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    core.counts[ULV_GENERATOR] = 3;
    core.counts[ULV_MINER] = 4; // 只有 ULV 采矿机，它采的是 T0 矿脉
    core.tick(1);
    expect(core.ores[0]!.gt('100')).toBe(true);
    expect(core.ores[1]!.toString()).toBe('0');
  });

  it('建了 LV 采矿机之后 T1 矿石才开始增长', () => {
    const core = new GameCore();
    core.ores[0] = dec('100');
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    core.counts[ULV_GENERATOR] = 3;
    core.counts[ULV_MINER] = 1;
    core.counts['m-2'] = 1; // LV 采矿机 → T1 矿脉
    core.tick(1);
    expect(core.ores[1]!.toString()).toBe('0.0625');
  });

  it('存档往返不丢精度，状态完整还原', () => {
    const core = new GameCore();
    core.manualMine();
    core.counts[ULV_MINER] = 7;
    core.counts['g-lv-comb'] = 3;
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    core.ores[1] = core.ores[1]!.plus('12345678901234567890');

    const restored = deserialize(serialize(core));
    expect(restored.countOf(ULV_MINER)).toBe(7);
    expect(restored.countOf('g-lv-comb')).toBe(3);
    expect(restored.maxTier).toBe(2);
    expect(restored.ores[1]!.toString()).toBe('12345678901234567890');
    expect(serialize(restored)).toEqual(serialize(core));
  });

  it('旧存档（v1，按等级存数量）能迁移到机型', () => {
    const legacy: SaveData = {
      version: 1,
      ores: ['1000', ...Array(13).fill('0')],
      coins: ['5000', ...Array(13).fill('0')],
      miners: [4, 2, ...Array(12).fill(0)],
      generators: [3, 1, ...Array(12).fill(0)],
      machines: [2, 0, ...Array(12).fill(0)],
      maxTier: 2,
      unlockedVeins: [0, 1],
      playSeconds: 300,
      totalOre: '1000',
      totalCoins: '5000',
      totalOreSpent: '0',
    };
    const core = deserialize(legacy);
    // 数量挂到该等级的第一个机型上
    expect(core.countOf(ULV_MINER)).toBe(4);
    expect(core.countOf('m-2')).toBe(2);
    expect(core.countOf(ULV_GENERATOR)).toBe(3);
    expect(core.countOf('g-lv-steam')).toBe(1);
    expect(core.countOf(ULV_MACHINE)).toBe(2);
    expect(core.maxTier).toBe(2);
  });
});
