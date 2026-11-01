import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize, type SaveData } from '../src/game/save';
import { modelsOf, type MachineModel } from '../src/game/models';
import { modelById } from './helpers';
import { dec } from '../src/numeric/decimal';
import { MAX_TIER, MIN_TIER, VOLTAGE_TIERS } from '../src/numeric/voltage';

const ULV_MINER = 'm-1';
const ULV_GENERATOR = 'g-ulv';
const ULV_MACHINE = 'c-1';

// 从实际使用入口验证：开局手动挖矿 → 造机器 → 循环转起来 → 解锁 LV。
describe('游戏核心：ULV → LV 完整循环', () => {
  it('机型目录：LV 有四种发电机（三种电力 + 一台魔法），其中一种是多方块', () => {
    const lv = modelsOf('generator').filter((model) => model.tier === 2);
    expect(lv.map((model) => model.name)).toEqual([
      '基础蒸汽轮机',
      '基础内燃发电机',
      '基础燃气轮机',
      '魔法发电机',
    ]);
    const multiblocks = modelsOf('generator').filter((model) => model.block === 'multiblock');
    expect(multiblocks.length).toBeGreaterThan(0);
    expect(multiblocks[0]!.block).toBe('multiblock');
  });

  it('每一级电压都有发电机机型，且高档机型的出力倍率随等级不减', () => {
    for (let tier = MIN_TIER; tier <= MAX_TIER; tier += 1) {
      const models = modelsOf('generator').filter((model) => model.tier === tier);
      expect(models.length, `${VOLTAGE_TIERS[tier - 1]} 没有发电机机型`).toBeGreaterThan(0);
    }

    const bestPerTier = Array.from({ length: MAX_TIER }, (_, index) => {
      const tier = index + 1;
      return Math.max(
        ...modelsOf('generator')
          .filter((model) => model.tier === tier)
          .map((model) => Number(model.outputFactor)),
      );
    });
    for (let index = 1; index < bestPerTier.length; index += 1) {
      expect(bestPerTier[index], `${VOLTAGE_TIERS[index]} 的出力倍率低于上一级`).toBeGreaterThanOrEqual(
        bestPerTier[index - 1]!,
      );
    }
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
    // 按需发电：3 台 ULV 发电机额定 24 EU/t，但这套机器只要 3×2 + 8 = 14 EU/t
    expect(report.euGenerated.toString()).toBe('14');
    expect(core.coins[0]!.toString()).toBe('1');
    expect(report.oreGained[0]!.toString()).toBe('1.5');
    // 产矿提速 8 倍后，同级采矿机产矿快于发电机烧矿，矿石转为净增长
    expect(core.ores[0]!.gt(before)).toBe(true);
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

  it('旧存档默认只烧本级矿石，调整燃料顺序后才会尝试低级矿石', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.unlockedVeins = [0, 1];
    const generator = modelById('g-lv-steam');
    core.counts[generator.id] = 1;
    core.counts['c-1'] = 1;
    core.ores[0] = dec('100');

    core.tick(1);
    expect(core.lastReport.euGenerated.toString()).toBe('0');

    core.setGeneratorFuelPriority(generator.id, [0, 1]);
    core.tick(1);
    expect(core.lastReport.euGenerated.gt(0)).toBe(true);
    expect(core.ores[0]!.lt('100')).toBe(true);
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

  it('出售机器：退回当前单价的一半，卖完价格也跟着回落', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.coins[0] = dec('100000');
    const steam = modelById('g-lv-steam');
    expect(core.coinPriceOf(steam).toString()).toBe('2000');

    core.buy(steam, 3);
    // 第 3 台买完时，下一台要 2000 × 1.07^3 ≈ 2450
    const priceBeforeSell = core.coinPriceOf(steam);
    const walletBefore = core.coins[0]!;

    expect(core.sell(steam, 1)).toBe(1);
    expect(core.countOf(steam.id)).toBe(2);
    // 退款按「卖出后的台数」定价：卖掉的这台就是按这一档买进来的
    expect(core.coins[0]!.minus(walletBefore).toString()).toBe(core.refundOf(steam).toString());
    // 台数少了，重新买回来的价钱比刚才低
    expect(core.coinPriceOf(steam).lt(priceBeforeSell)).toBe(true);

    // 买卖对称：买一台再卖回去，退的正好是买入价的一半
    const solo = new GameCore();
    solo.maxTier = 2;
    solo.coins[0] = dec('100000');
    solo.buy(steam, 1);
    const paid = dec('100000').minus(solo.coins[0]!);
    const walletAfterBuy = solo.coins[0]!;
    solo.sell(steam, 1);
    expect(solo.coins[0]!.minus(walletAfterBuy).toString()).toBe(paid.times('0.5').floor().toString());

    // 卖到一台不剩之后就卖不动了
    expect(core.sell(steam, 10)).toBe(2);
    expect(core.countOf(steam.id)).toBe(0);
    expect(core.sell(steam, 1)).toBe(0);
  });

  it('出售带故障的机器时，坏掉的台数不会超过剩下的台数', () => {
    const core = new GameCore();
    core.maxTier = 2;
    core.coins[0] = dec('100000');
    const steam = modelById('g-lv-steam');
    core.buy(steam, 3);
    core.faults[steam.id] = 3;
    expect(core.sell(steam, 2)).toBe(2);
    expect(core.countOf(steam.id)).toBe(1);
    expect(core.faultyCountOf(steam.id)).toBe(1);
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
    expect(core.ores[1]!.toString()).toBe('0.5');
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

describe('机型清单', () => {
  it('按类别预生成一份，调用方改不动它', () => {
    const miners = modelsOf('miner');
    // 同一个类别每次都拿同一份，不再每次去全表筛 140 多个机型
    expect(modelsOf('miner')).toBe(miners);
    expect(miners.length).toBeGreaterThan(0);
    // 冻结的清单：谁想就地排序 / 塞东西都会立刻炸出来，而不是悄悄影响全局
    expect(() => (miners as MachineModel[]).push(miners[0]!)).toThrow();
  });
});
describe('UMV 与后续电压', () => {
  it('从 UIV 逐级解锁 UMV、UXV、MAX，UXV 仍未达到终局', () => {
    const core = new GameCore();
    core.maxTier = 12;
    core.unlockedVeins = Array.from({ length: 12 }, (_, index) => index);
    core.coins = core.coins.map(() => dec('1e30'));
    expect(core.unlock(14)).toBe(false);
    expect(core.unlock(13)).toBe(true);
    expect(VOLTAGE_TIERS[core.maxTier - 1]).toBe('UMV');
    expect(core.unlockedVeins).toContain(12);
    expect(core.unlock(14)).toBe(true);
    expect(VOLTAGE_TIERS[core.maxTier - 1]).toBe('UXV');
    expect(core.canRebirth('max')).toBe(false);
    expect(core.unlock(15)).toBe(true);
    expect(VOLTAGE_TIERS[core.maxTier - 1]).toBe('MAX');
    expect(core.unlockedVeins).toContain(14);
  });

  it.each([
    [13, 'g-umv-mb-dyson'],
    [14, 'g-uxv-mb-annihilation'],
    [15, 'g-max-mb-blackhole'],
  ] as const)('第 %i 档的采矿、发电、制造都能结算到对应资源', (tier, generator) => {
    const core = new GameCore();
    core.setDevMode(true);
    core.devUnlockTo(tier);
    core.devGrantResources('1e30');
    core.counts[`m-${tier}`] = 1;
    core.counts[`c-${tier}`] = 1;
    core.counts[generator] = 10;
    const before = core.coins[tier - 1]!;
    const report = core.tick(1);
    expect(report.powerRatio).toBe(1);
    expect(report.oreGained[tier - 1]?.gt(0)).toBe(true);
    expect(report.coinsGained[tier - 1]?.gt(0)).toBe(true);
    expect(core.coins[tier - 1]!.gt(before)).toBe(true);
  });
});
