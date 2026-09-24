import { Decimal, ONE, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER } from '../numeric/voltage';
import { machineCost } from '../numeric/cost';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { paymentTier } from '../numeric/credit';
import * as C from './constants';

export type MachineKind = 'miner' | 'generator' | 'machine';

// 支付方式：计划书第七章规定用 GT 币买；但开局没有任何产币机器，
// 「手动挖矿攒矿石 → 造发电机和制造机」这条开局路径要求机器也能用矿石直接建造。
// 两种方式都保留，矿石价 = 币价 ÷ COINS_PER_ORE。
export type PayWith = 'coin' | 'ore';

// 一个 tick 的产出报告，供界面显示与调试。
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
  ores: Decimal[] = oresArray(); // 索引 i 对应 Ti 矿石
  coins: Decimal[] = coinsArray(); // 索引 i 对应电压等级 i+1 的币
  miners: number[] = tierCounts();
  generators: number[] = tierCounts();
  machines: number[] = tierCounts();
  maxTier = 1; // 已解锁的最高电压等级
  unlockedVeins: number[] = [0]; // 已开放的矿脉等级（0 = T0 矿脉）
  playSeconds = 0;
  totalOre = ZERO;
  totalCoins = ZERO;
  lastReport: TickReport = emptyReport();

  // ── 玩家操作 ────────────────────────────────────────────────

  manualMine(): void {
    const amount = C.manualMineAmount();
    this.ores[0] = this.ores[0]!.plus(amount);
    this.totalOre = this.totalOre.plus(amount);
  }

  // 机器单价：按币计价。
  coinPriceOf(kind: MachineKind, tier: number): Decimal {
    return machineCost({ baseCost: C.BASE_MACHINE_COST, tier, purchased: this.countOf(kind, tier) });
  }

  // 机器单价：按同级矿石计价。
  orePriceOf(kind: MachineKind, tier: number): Decimal {
    return this.coinPriceOf(kind, tier).div(C.COINS_PER_ORE).ceil();
  }

  priceOf(kind: MachineKind, tier: number, payWith: PayWith = 'coin'): Decimal {
    return payWith === 'ore' ? this.orePriceOf(kind, tier) : this.coinPriceOf(kind, tier);
  }

  countOf(kind: MachineKind, tier: number): number {
    return this.countsOf(kind)[tier - 1] ?? 0;
  }

  buy(kind: MachineKind, tier: number, count: number, payWith: PayWith = 'coin'): number {
    let bought = 0;
    for (let i = 0; i < count; i += 1) {
      const price = this.priceOf(kind, tier, payWith);
      const walletIndex = payWith === 'ore' ? tier - 1 : paymentTier(tier) - 1;
      const wallet = payWith === 'ore' ? this.ores[walletIndex]! : this.coins[walletIndex]!;
      if (wallet.lt(price)) break;
      if (payWith === 'ore') this.ores[walletIndex] = wallet.minus(price);
      else this.coins[walletIndex] = wallet.minus(price);
      this.countsOf(kind)[tier - 1] = this.countOf(kind, tier) + 1;
      bought += 1;
    }
    return bought;
  }

  canAfford(kind: MachineKind, tier: number, payWith: PayWith = 'coin'): boolean {
    const price = this.priceOf(kind, tier, payWith);
    const walletIndex = payWith === 'ore' ? tier - 1 : paymentTier(tier) - 1;
    const wallet = payWith === 'ore' ? this.ores[walletIndex]! : this.coins[walletIndex]!;
    return wallet.gte(price);
  }

  // 解锁下一电压等级：攒够 (tier-1) 级的币，并开放对应等级的矿脉。
  unlockCostOf(tier: number): Decimal {
    return C.unlockCost(tier);
  }

  canUnlock(tier: number): boolean {
    if (tier !== this.maxTier + 1 || tier > MAX_TIER) return false;
    const walletTier = paymentTier(tier);
    return this.coins[walletTier - 1]!.gte(this.unlockCostOf(tier));
  }

  unlock(tier: number): boolean {
    if (!this.canUnlock(tier)) return false;
    const walletTier = paymentTier(tier);
    this.coins[walletTier - 1] = this.coins[walletTier - 1]!.minus(this.unlockCostOf(tier));
    this.maxTier = tier;
    this.unlockedVeins.push(tier - 1);
    return true;
  }

  // ── 模拟 ───────────────────────────────────────────────────

  tick(dtSeconds: number): TickReport {
    const report = emptyReport();

    // 1) 发电能力与耗电需求
    let capacity = ZERO;
    for (let tier = 1; tier <= this.maxTier; tier += 1) {
      capacity = capacity.plus(generatorOutputEU(tier).times(this.generators[tier - 1]!));
    }
    let demand = ZERO;
    for (let tier = 1; tier <= this.maxTier; tier += 1) {
      demand = demand
        .plus(minerEnergyEU(tier).times(this.miners[tier - 1]!))
        .plus(
          machineEnergy({
            baseEnergy: C.BASE_MACHINE_ENERGY,
            tier,
            overclockLevel: OVERCLOCK_LEVEL,
          }).times(this.machines[tier - 1]!),
        );
    }

    // 2) 发电机按库存矿石实际烧掉多少 —— 烧不到就发不满
    let generated = ZERO;
    for (let tier = 1; tier <= this.maxTier; tier += 1) {
      const count = this.generators[tier - 1]!;
      if (count === 0) continue;
      const want = generatorFuelRate(tier).times(count).times(dtSeconds);
      const oreTier = tier - 1; // 本级发电机烧本级矿石
      const available = this.ores[oreTier]!;
      const burned = Decimal.min(want, available);
      if (burned.gt(0)) {
        this.ores[oreTier] = available.minus(burned);
        report.oreSpent[oreTier] = report.oreSpent[oreTier]!.plus(burned);
        this.totalOreSpent = this.totalOreSpent.plus(burned);
      }
      const ratio = want.gt(0) ? burned.div(want) : ONE;
      generated = generated.plus(generatorOutputEU(tier).times(count).times(dtSeconds).times(ratio));
    }

    // 3) 电力充足率：发电不够就整体降载。全程用 Decimal，只在报告里转成 number 供界面显示。
    const ratioDec = demand.lte(0) ? ONE : Decimal.min(ONE, generated.div(demand));

    // 4) 采矿机产矿：按矿脉等级把产量均分给它能产的矿种
    let minerOutput = ZERO;
    for (let tier = 1; tier <= this.maxTier; tier += 1) {
      minerOutput = minerOutput.plus(minerOrePerSecond(tier).times(this.miners[tier - 1]!));
    }
    const oreGainedTotal = minerOutput.times(dtSeconds).times(ratioDec);
    const veinKinds = new Set<number>();
    for (const veinTier of this.unlockedVeins) {
      for (let ore = 0; ore <= veinTier; ore += 1) veinKinds.add(ore);
    }
    if (oreGainedTotal.gt(0) && veinKinds.size > 0) {
      const share = oreGainedTotal.div(veinKinds.size);
      for (const oreTier of veinKinds) {
        this.ores[oreTier] = this.ores[oreTier]!.plus(share);
        report.oreGained[oreTier] = report.oreGained[oreTier]!.plus(share);
      }
      this.totalOre = this.totalOre.plus(oreGainedTotal);
    }

    // 5) 制造机产币，同时吃矿
    for (let tier = 1; tier <= this.maxTier; tier += 1) {
      const count = this.machines[tier - 1]!;
      if (count === 0) continue;
      const produce = machineOutput({
        baseOutput: C.BASE_MACHINE_OUTPUT,
        tier,
        overclockLevel: OVERCLOCK_LEVEL,
      })
        .times(count)
        .times(dtSeconds)
        .times(ratioDec);
      const wantOre = produce.div(C.COINS_PER_ORE);
      const oreTier = tier - 1;
      const available = this.ores[oreTier]!;
      const feed = Decimal.min(wantOre, available);
      const actual = wantOre.gt(0) ? produce.times(feed.div(wantOre)) : produce;
      if (feed.gt(0)) {
        this.ores[oreTier] = available.minus(feed);
        report.oreSpent[oreTier] = report.oreSpent[oreTier]!.plus(feed);
        this.totalOreSpent = this.totalOreSpent.plus(feed);
      }
      if (actual.gt(0)) {
        this.coins[tier - 1] = this.coins[tier - 1]!.plus(actual);
        report.coinsGained[tier - 1] = report.coinsGained[tier - 1]!.plus(actual);
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

  totalOreSpent = ZERO;

  private countsOf(kind: MachineKind): number[] {
    if (kind === 'miner') return this.miners;
    if (kind === 'generator') return this.generators;
    return this.machines;
  }
}

function tierCounts(): number[] {
  return new Array(MAX_TIER).fill(0) as number[];
}

function oresArray(): Decimal[] {
  return new Array(14).fill(null).map(() => ZERO);
}

function coinsArray(): Decimal[] {
  return new Array(MAX_TIER).fill(null).map(() => ZERO);
}

function emptyReport(): TickReport {
  return {
    euGenerated: ZERO,
    euConsumed: ZERO,
    powerRatio: 1,
    oreGained: oresArray(),
    oreSpent: oresArray(),
    coinsGained: coinsArray(),
  };
}
