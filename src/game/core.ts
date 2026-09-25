import { Decimal, ONE, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../numeric/voltage';
import { machineCost } from '../numeric/cost';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelEfficiency, generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { paymentTier } from '../numeric/credit';
import {
  MACHINE_MODELS,
  modelsOf,
  type MachineCategory,
  type MachineModel,
} from './models';
import * as C from './constants';

// 机型 → 数值：出力带上机型倍率，烧矿速率带上机型的燃料效率。
// 这两个包装放在这里而不是数值层，是为了让数值层保持不依赖游戏数据。
function outputOf(model: MachineModel): Decimal {
  return generatorOutputEU(model.tier, model.outputFactor);
}

function fuelRateOf(model: MachineModel): Decimal {
  return generatorFuelRate(model.tier, {
    outputFactor: model.outputFactor,
    efficiency: model.fuelEfficiency ?? generatorFuelEfficiency(model.tier),
  });
}

export type MachineKind = MachineCategory;

// 支付方式：计划书第七章规定用 GT 币买；但开局没有任何产币机器，
// 「手动挖矿攒矿石 → 造发电机和制造机」这条开局路径要求机器也能用矿石直接建造。
// 两种方式都保留，矿石价 = 币价 ÷ COINS_PER_ORE。
export type PayWith = 'coin' | 'ore';

export interface TickReport {
  euGenerated: Decimal;
  euConsumed: Decimal;
  powerRatio: number;
  oreGained: Decimal[];
  oreSpent: Decimal[];
  coinsGained: Decimal[];
}

// 第一阶段的超频档位固定为 0（界面与逐台控制放到后续阶段）。
const OVERCLOCK_LEVEL = 0;

export class GameCore {
  ores: Decimal[] = Array.from({ length: 14 }, () => ZERO);
  coins: Decimal[] = Array.from({ length: MAX_TIER }, () => ZERO);
  // 按机型 id 存数量。机型目录见 models.ts
  counts: Record<string, number> = {};
  maxTier = 1;
  unlockedVeins: number[] = [0];
  playSeconds = 0;
  totalOre = ZERO;
  totalCoins = ZERO;
  totalOreSpent = ZERO;
  lastReport: TickReport = emptyReport();

  // ── 查询 ───────────────────────────────────────────────────

  countOf(modelId: string): number {
    return this.counts[modelId] ?? 0;
  }

  countOfCategory(category: MachineCategory): number {
    return modelsOf(category).reduce((sum, model) => sum + this.countOf(model.id), 0);
  }

  // 在给定电压等级上能造的机型
  modelsAt(category: MachineCategory, tier: number): MachineModel[] {
    return modelsOf(category).filter((model) => model.tier === tier);
  }

  // 已解锁区间内的全部机型（按电压等级、再按目录顺序）
  unlockedModels(category: MachineCategory): MachineModel[] {
    return modelsOf(category).filter((model) => model.tier <= this.maxTier);
  }

  // ── 玩家操作 ───────────────────────────────────────────────

  manualMine(): void {
    const amount = C.manualMineAmount();
    this.ores[0] = this.ores[0]!.plus(amount);
    this.totalOre = this.totalOre.plus(amount);
  }

  // 单价：基准成本 × 机型成本系数
  coinPriceOf(model: MachineModel): Decimal {
    return machineCost({
      baseCost: C.BASE_MACHINE_COST,
      tier: model.tier,
      purchased: this.countOf(model.id),
    })
      .times(dec(model.costFactor))
      .floor();
  }

  orePriceOf(model: MachineModel): Decimal {
    return this.coinPriceOf(model).div(C.COINS_PER_ORE).ceil();
  }

  priceOf(model: MachineModel, payWith: PayWith = 'coin'): Decimal {
    return payWith === 'ore' ? this.orePriceOf(model) : this.coinPriceOf(model);
  }

  canAfford(model: MachineModel, payWith: PayWith = 'coin'): boolean {
    const price = this.priceOf(model, payWith);
    const index = payWith === 'ore' ? model.tier - 1 : paymentTier(model.tier) - 1;
    const wallet = payWith === 'ore' ? this.ores[index]! : this.coins[index]!;
    return wallet.gte(price);
  }

  buy(model: MachineModel, count: number, payWith: PayWith = 'coin'): number {
    let bought = 0;
    for (let i = 0; i < count; i += 1) {
      const price = this.priceOf(model, payWith);
      const index = payWith === 'ore' ? model.tier - 1 : paymentTier(model.tier) - 1;
      const wallet = payWith === 'ore' ? this.ores[index]! : this.coins[index]!;
      if (wallet.lt(price)) break;
      if (payWith === 'ore') this.ores[index] = wallet.minus(price);
      else this.coins[index] = wallet.minus(price);
      this.counts[model.id] = this.countOf(model.id) + 1;
      bought += 1;
    }
    return bought;
  }

  // 解锁下一电压等级：攒够上一级的币，并开放对应等级的矿脉
  unlockCostOf(tier: number): Decimal {
    return C.unlockCost(tier);
  }

  canUnlock(tier: number): boolean {
    if (tier !== this.maxTier + 1 || tier > MAX_TIER) return false;
    return this.coins[paymentTier(tier) - 1]!.gte(this.unlockCostOf(tier));
  }

  unlock(tier: number): boolean {
    if (!this.canUnlock(tier)) return false;
    const index = paymentTier(tier) - 1;
    this.coins[index] = this.coins[index]!.minus(this.unlockCostOf(tier));
    this.maxTier = tier;
    this.unlockedVeins.push(tier - 1);
    return true;
  }

  // ── 模拟 ───────────────────────────────────────────────────

  tick(dtSeconds: number): TickReport {
    const report = emptyReport();
    const active = MACHINE_MODELS.filter(
      (model) => model.tier <= this.maxTier && this.countOf(model.id) > 0,
    );

    // 1) 发电能力与耗电需求
    let capacity = ZERO;
    let demand = ZERO;
    for (const model of active) {
      const n = this.countOf(model.id);
      if (model.category === 'generator') {
        capacity = capacity.plus(outputOf(model).times(n));
      } else if (model.category === 'miner') {
        demand = demand.plus(minerEnergyEU(model.tier).times(n));
      } else {
        demand = demand.plus(
          machineEnergy({
            baseEnergy: C.BASE_MACHINE_ENERGY,
            tier: model.tier,
            overclockLevel: OVERCLOCK_LEVEL,
          }).times(n),
        );
      }
    }

    // 2) 发电机按库存矿石实际烧掉多少 —— 烧不到就发不满
    let generated = ZERO;
    for (const model of active) {
      if (model.category !== 'generator') continue;
      const n = this.countOf(model.id);
      const want = fuelRateOf(model).times(n).times(dtSeconds);
      const oreTier = model.tier - 1; // 本级发电机烧本级矿石
      const available = this.ores[oreTier]!;
      const burned = Decimal.min(want, available);
      if (burned.gt(0)) {
        this.ores[oreTier] = available.minus(burned);
        report.oreSpent[oreTier] = report.oreSpent[oreTier]!.plus(burned);
        this.totalOreSpent = this.totalOreSpent.plus(burned);
      }
      const ratio = want.gt(0) ? burned.div(want) : ONE;
      generated = generated.plus(outputOf(model).times(n).times(dtSeconds).times(ratio));
    }

    // 3) 电力充足率：发电不够就整体降载。全程用 Decimal，只在报告里转成 number
    const ratioDec = demand.lte(0) ? ONE : Decimal.min(ONE, generated.div(demand));

    // 4) 采矿机产矿
    //
    // 一台等级 n 的采矿机开采对应等级的矿脉：ULV 采矿机 → T0 矿脉，LV 采矿机 → T1 矿脉。
    // 所以没建 LV 采矿机时，T1 矿石一滴都不会涨。
    // 每座矿脉把产量均分给它能产的全部矿种（T0..T该矿脉等级）。
    const veinRates = new Map<number, Decimal>();
    for (const model of active) {
      if (model.category !== 'miner') continue;
      const veinTier = model.tier - 1;
      const rate = minerOrePerSecond(model.tier).times(this.countOf(model.id));
      veinRates.set(veinTier, (veinRates.get(veinTier) ?? ZERO).plus(rate));
    }
    for (const [veinTier, ratePerSecond] of veinRates) {
      const total = ratePerSecond.times(dtSeconds).times(ratioDec);
      if (total.lte(0)) continue;
      const kinds = veinTier + 1;
      const share = total.div(kinds);
      for (let oreTier = 0; oreTier <= veinTier; oreTier += 1) {
        this.ores[oreTier] = this.ores[oreTier]!.plus(share);
        report.oreGained[oreTier] = report.oreGained[oreTier]!.plus(share);
      }
      this.totalOre = this.totalOre.plus(total);
    }

    // 5) 制造机产币，同时吃矿
    for (const model of active) {
      if (model.category !== 'machine') continue;
      const n = this.countOf(model.id);
      const produce = machineOutput({
        baseOutput: C.BASE_MACHINE_OUTPUT,
        tier: model.tier,
        overclockLevel: OVERCLOCK_LEVEL,
      })
        .times(model.outputFactor)
        .times(n)
        .times(dtSeconds)
        .times(ratioDec);
      const wantOre = produce.div(C.COINS_PER_ORE);
      const oreTier = model.tier - 1;
      const available = this.ores[oreTier]!;
      const feed = Decimal.min(wantOre, available);
      const actual = wantOre.gt(0) ? produce.times(feed.div(wantOre)) : produce;
      if (feed.gt(0)) {
        this.ores[oreTier] = available.minus(feed);
        report.oreSpent[oreTier] = report.oreSpent[oreTier]!.plus(feed);
        this.totalOreSpent = this.totalOreSpent.plus(feed);
      }
      if (actual.gt(0)) {
        this.coins[model.tier - 1] = this.coins[model.tier - 1]!.plus(actual);
        report.coinsGained[model.tier - 1] = report.coinsGained[model.tier - 1]!.plus(actual);
        this.totalCoins = this.totalCoins.plus(actual);
      }
    }

    this.playSeconds += dtSeconds;
    report.euGenerated = generated;
    report.euConsumed = demand.times(dtSeconds).times(ratioDec);
    report.powerRatio = ratioDec.toNumber();
    this.lastReport = report;
    return report;
  }
}

function emptyReport(): TickReport {
  return {
    euGenerated: ZERO,
    euConsumed: ZERO,
    powerRatio: 1,
    oreGained: Array.from({ length: 14 }, () => ZERO),
    oreSpent: Array.from({ length: 14 }, () => ZERO),
    coinsGained: Array.from({ length: MAX_TIER }, () => ZERO),
  };
}

export { VOLTAGE_TIERS };
