import { Decimal, ONE, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../numeric/voltage';
import { machineCost } from '../numeric/cost';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelEfficiency, generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { convertCoins, paymentTier } from '../numeric/credit';
import { isValidOverclockLevel, overclockEnergyMultiplier, overclockSpeedMultiplier } from '../numeric/overclock';
import { expectedFaults, sampleFaults } from '../numeric/fault';
import { batteryCapacityEU, settleStorage } from '../numeric/storage';
import {
  COLLAPSE_CHANCE_PER_10_MINUTES,
  MUTATION_CHANCE_PER_MINUTE,
  MUTATION_REWARD_SECONDS,
  clampPollution,
  pollutionBand,
  pollutionOutputMultiplier,
  pollutionPerSecond,
  purifyPerSecond,
} from '../numeric/pollution';
import {
  DEFAULT_GRID,
  SIPHON_CHECK_SECONDS,
  SIPHON_RATIO,
  gridEnergyMultiplier,
  gridOutageRule,
  gridMode,
  isGridUnlocked,
  type GridMode,
} from '../numeric/grid';
import {
  MACHINE_MODELS,
  canOverclock,
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
  // 污染：本拍净变化与产出倍率（关掉污染机制时倍率恒为 1）
  pollutionDelta: Decimal;
  outputMultiplier: Decimal;
  // 波动电网断电、变异奖励、工厂崩溃、黑市窃取
  outage: boolean;
  mutations: number;
  collapses: number;
  // 本拍的存电结算：充进去多少、放出来多少
  euCharged: Decimal;
  euDischarged: Decimal;
  // 本拍因超频新增的故障台数
  faultsGained: number;
  oreGained: Decimal[];
  oreSpent: Decimal[];
  coinsGained: Decimal[];
}

export class GameCore {
  ores: Decimal[] = Array.from({ length: 14 }, () => ZERO);
  coins: Decimal[] = Array.from({ length: MAX_TIER }, () => ZERO);
  // 按机型 id 存数量。机型目录见 models.ts
  counts: Record<string, number> = {};
  // 超频档位（0-3）：机型 id → 档位。同机型的所有台数共用一个档位
  overclock: Record<string, number> = {};
  // 故障台数：机型 id → 坏了几台。坏了的机器不产不耗，要手动维护
  faults: Record<string, number> = {};
  // 存电装置的存量（EU），所有电池共用一个池子
  storedEU = ZERO;
  // 污染值 0-100。设置里关掉污染机制后它不涨、也不产生任何影响
  pollution = ZERO;
  pollutionEnabled = true;
  // 累计被黑市电网薅走的 GT 币（按币值折算）
  siphoned = ZERO;
  // 电网模式（计划书第六章）
  grid: GridMode = DEFAULT_GRID;
  // 已解锁的电网。开局只有普通电网，其余的到等级后花对应等级的 GT 币解锁
  grids: GridMode[] = [DEFAULT_GRID];
  // 波动电网：还要断多久、距离下次判定过了多久
  outageSeconds = 0;
  outageTimer = 0;
  siphonTimer = 0;
  mutationTimer = 0;
  collapseTimer = 0;
  maxTier = 1;
  unlockedVeins: number[] = [0];
  playSeconds = 0;
  totalOre = ZERO;
  totalCoins = ZERO;
  totalOreSpent = ZERO;
  lastReport: TickReport = emptyReport();
  // 故障抽样用的随机源。测试里替换成固定序列，游戏里就是 Math.random
  random: () => number = Math.random;

  // ── 查询 ───────────────────────────────────────────────────

  countOf(modelId: string): number {
    return this.counts[modelId] ?? 0;
  }

  countOfCategory(category: MachineCategory): number {
    return modelsOf(category).reduce((sum, model) => sum + this.countOf(model.id), 0);
  }

  // 超频档位：越界或非整数一律当作 0，存档里出现脏数据也不会带崩模拟
  overclockOf(modelId: string): number {
    const level = this.overclock[modelId] ?? 0;
    return isValidOverclockLevel(level) ? level : 0;
  }

  setOverclock(modelId: string, level: number): boolean {
    const model = MACHINE_MODELS.find((item) => item.id === modelId);
    if (!model || !canOverclock(model)) return false;
    if (!isValidOverclockLevel(level)) return false;
    // 调档位相当于顺手检修一次，把故障清掉
    delete this.faults[modelId];
    if (level === 0) delete this.overclock[modelId];
    else this.overclock[modelId] = level;
    return true;
  }

  faultyCountOf(modelId: string): number {
    return Math.min(this.faults[modelId] ?? 0, this.countOf(modelId));
  }

  // 能干活（没坏）的台数：停机的那几台既不产出也不耗电
  workingCountOf(modelId: string): number {
    return Math.max(0, this.countOf(modelId) - this.faultyCountOf(modelId));
  }

  repair(modelId: string): number {
    const fixed = this.faultyCountOf(modelId);
    delete this.faults[modelId];
    return fixed;
  }

  // 存电装置的总容量（EU）
  batteryCapacity(): Decimal {
    let capacity = ZERO;
    for (const model of modelsOf('storage')) {
      const n = this.countOf(model.id);
      if (n > 0) capacity = capacity.plus(batteryCapacityEU(model.tier).times(n));
    }
    return capacity;
  }

  // ── 机型 → 有效数值 ────────────────────────────────────────
  // 都带上超频与故障：坏掉的台数不产不耗，超频按档位提产耗电。
  // 模拟与界面统一走这几个函数，避免两边各算一套。

  minerOutputPerSecond(model: MachineModel): Decimal {
    return minerOrePerSecond(model.tier)
      .times(overclockSpeedMultiplier(this.overclockOf(model.id)))
      .times(this.workingCountOf(model.id));
  }

  minerEnergyDrain(model: MachineModel): Decimal {
    return minerEnergyEU(model.tier)
      .times(overclockEnergyMultiplier(this.overclockOf(model.id)))
      .times(this.workingCountOf(model.id));
  }

  machineOutputPerSecond(model: MachineModel): Decimal {
    return machineOutput({
      baseOutput: C.BASE_MACHINE_OUTPUT,
      tier: model.tier,
      overclockLevel: this.overclockOf(model.id),
    })
      .times(model.outputFactor)
      .times(this.workingCountOf(model.id));
  }

  machineEnergyDrain(model: MachineModel): Decimal {
    return machineEnergy({
      baseEnergy: C.BASE_MACHINE_ENERGY,
      tier: model.tier,
      overclockLevel: this.overclockOf(model.id),
    }).times(this.workingCountOf(model.id));
  }

  generatorOutputRated(model: MachineModel): Decimal {
    return outputOf(model).times(this.countOf(model.id));
  }

  generatorFuelDrain(model: MachineModel): Decimal {
    return fuelRateOf(model).times(this.countOf(model.id));
  }

  // 净化器不跑配方，和发电机一样不参与超频
  purifierEnergyDrain(model: MachineModel): Decimal {
    return machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }).times(
      this.workingCountOf(model.id),
    );
  }

  // ── 污染与电网 ─────────────────────────────────────────────

  isGridUnlocked(mode: GridMode): boolean {
    return this.grids.includes(mode);
  }

  // 解锁价：该等级第一台机器成本的 GRID_UNLOCK_COST_MACHINES 倍，
  // 用「该等级的 GT 币」支付（计划书第六章：电网要靠升级解锁）
  gridUnlockCost(mode: GridMode): Decimal {
    const info = gridMode(mode);
    const valueInTier1 = machineCost({
      baseCost: C.BASE_MACHINE_COST,
      tier: info.unlockTier,
      purchased: 0,
    }).times(C.GRID_UNLOCK_COST_MACHINES);
    return convertCoins(valueInTier1, 1, info.unlockTier);
  }

  gridPaymentIndex(mode: GridMode): number {
    return gridMode(mode).unlockTier - 1;
  }

  canUnlockGrid(mode: GridMode): boolean {
    if (this.isGridUnlocked(mode)) return false;
    if (gridMode(mode).unlockTier > this.maxTier) return false;
    return this.coins[this.gridPaymentIndex(mode)]!.gte(this.gridUnlockCost(mode));
  }

  unlockGrid(mode: GridMode): boolean {
    if (!this.canUnlockGrid(mode)) return false;
    const index = this.gridPaymentIndex(mode);
    this.coins[index] = this.coins[index]!.minus(this.gridUnlockCost(mode));
    this.grids.push(mode);
    return true;
  }

  // 换电网：只有解锁过的才能接。返回是否切换成功
  setGrid(mode: GridMode): boolean {
    if (!this.isGridUnlocked(mode)) return false;
    if (this.grid === mode) return true;
    this.grid = mode;
    // 换电网等于重新接线：断电立刻结束，计时从头开始
    this.outageSeconds = 0;
    this.outageTimer = 0;
    this.siphonTimer = 0;
    return true;
  }

  setPollutionEnabled(enabled: boolean): void {
    this.pollutionEnabled = enabled;
  }

  // 正在跑的机器（按电压等级汇总），污染与净化都按它算
  private runningTiers(category: MachineCategory): { tier: number; count: number }[] {
    return modelsOf(category)
      .filter((model) => model.tier <= this.maxTier)
      .map((model) => ({ tier: model.tier, count: this.workingCountOf(model.id) }));
  }

  // 每秒产生的污染（百分点/秒）
  pollutionPerSecond(): Decimal {
    const machinery: { tier: number; count: number }[] = [
      ...this.runningTiers('miner'),
      ...this.runningTiers('generator'),
      ...this.runningTiers('machine'),
    ];
    return pollutionPerSecond(machinery);
  }

  // 每秒净化掉的污染（百分点/秒）
  purifyPerSecond(): Decimal {
    return purifyPerSecond(this.runningTiers('purifier'));
  }

  // 本拍的污染净变化（正数 = 在涨）
  pollutionDeltaPerSecond(): Decimal {
    return this.pollutionPerSecond().minus(this.purifyPerSecond());
  }

  // 污染对产出的惩罚倍率。关掉污染机制时恒为 1
  outputMultiplier(): Decimal {
    return this.pollutionEnabled ? pollutionOutputMultiplier(this.pollution) : ONE;
  }

  // 污染带来的两个事件（计划书第六章）：
  //   30-70%：每分钟 20% 概率"变异"——按当前每秒产币给 30 秒的量
  //   >70%：每 10 分钟 10% 概率"工厂崩溃"——随机摧毁一台机器
  private handlePollutionEvents(dtSeconds: number, report: TickReport): void {
    const band = pollutionBand(this.pollution);
    if (band === 'mutating') {
      this.mutationTimer += dtSeconds;
      this.collapseTimer = 0;
      if (this.mutationTimer >= 60) {
        this.mutationTimer -= 60;
        if (this.random() < MUTATION_CHANCE_PER_MINUTE) {
          const reward = this.mutationReward();
          if (reward.gt(0)) {
            const tier = this.bestMachineTier();
            this.coins[tier - 1] = this.coins[tier - 1]!.plus(reward);
            this.totalCoins = this.totalCoins.plus(reward);
            report.coinsGained[tier - 1] = report.coinsGained[tier - 1]!.plus(reward);
            report.mutations += 1;
          }
        }
      }
      return;
    }
    this.mutationTimer = 0;
    if (band !== 'critical') {
      this.collapseTimer = 0;
      return;
    }
    this.collapseTimer += dtSeconds;
    if (this.collapseTimer >= 600) {
      this.collapseTimer -= 600;
      if (this.random() < COLLAPSE_CHANCE_PER_10_MINUTES && this.destroyOneMachine()) {
        report.collapses += 1;
      }
    }
  }

  // 最高等级、且真的在运转的制造机等级（变异奖励发这一级的币）
  private bestMachineTier(): number {
    let tier = 1;
    for (const model of modelsOf('machine')) {
      if (model.tier <= this.maxTier && this.workingCountOf(model.id) > 0) {
        tier = Math.max(tier, model.tier);
      }
    }
    return tier;
  }

  // 变异奖励：当前每秒产币 × MUTATION_REWARD_SECONDS
  private mutationReward(): Decimal {
    let perSecond = ZERO;
    for (const model of modelsOf('machine')) {
      if (model.tier <= this.maxTier) perSecond = perSecond.plus(this.machineOutputPerSecond(model));
    }
    return perSecond.times(MUTATION_REWARD_SECONDS);
  }

  // 工厂崩溃：从所有已建机器里随机挑一台摧毁，返回是否真的毁掉了东西
  private destroyOneMachine(): boolean {
    const owned = MACHINE_MODELS.filter((model) => this.countOf(model.id) > 0);
    if (owned.length === 0) return false;
    const victim = owned[Math.floor(this.random() * owned.length)]!;
    const left = this.countOf(victim.id) - 1;
    if (left > 0) this.counts[victim.id] = left;
    else delete this.counts[victim.id];
    if (this.faultyCountOf(victim.id) > left) this.faults[victim.id] = Math.max(0, left);
    return true;
  }

  // 黑市电网：随机薅走一种 GT 币的 1%
  private siphonCoins(): void {
    const held = this.coins
      .map((amount, index) => ({ amount, index }))
      .filter((item) => item.amount.gt(0));
    if (held.length === 0) return;
    const target = held[Math.floor(this.random() * held.length)]!;
    this.coins[target.index] = target.amount.times(dec('1').minus(SIPHON_RATIO));
    this.siphoned = this.siphoned.plus(target.amount.times(SIPHON_RATIO));
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

    // 1) 发电能力与耗电需求。坏掉的机器不耗电，超频的机器按档位吃电
    let capacity = ZERO;
    let demand = ZERO;
    for (const model of active) {
      if (model.category === 'generator') {
        capacity = capacity.plus(this.generatorOutputRated(model));
      } else if (model.category === 'miner') {
        demand = demand.plus(this.minerEnergyDrain(model));
      } else if (model.category === 'machine') {
        demand = demand.plus(this.machineEnergyDrain(model));
      } else if (model.category === 'purifier') {
        demand = demand.plus(this.purifierEnergyDrain(model));
      }
    }
    // 电网模式直接改耗电：稳定 +20%、波动 -30%、黑市 -50%
    demand = demand.times(gridEnergyMultiplier(this.grid));

    // 2) 发电机按库存矿石实际烧掉多少 —— 烧不到就发不满
    let generated = ZERO;
    for (const model of active) {
      if (model.category !== 'generator') continue;
      const want = this.generatorFuelDrain(model).times(dtSeconds);
      const oreTier = model.tier - 1; // 本级发电机烧本级矿石
      const available = this.ores[oreTier]!;
      const burned = Decimal.min(want, available);
      if (burned.gt(0)) {
        this.ores[oreTier] = available.minus(burned);
        report.oreSpent[oreTier] = report.oreSpent[oreTier]!.plus(burned);
        this.totalOreSpent = this.totalOreSpent.plus(burned);
      }
      const ratio = want.gt(0) ? burned.div(want) : ONE;
      generated = generated.plus(this.generatorOutputRated(model).times(dtSeconds).times(ratio));
    }

    // 3) 电网事件：普通/波动电网都可能断电，断电期间机器全停（不产也不耗）
    const outageRule = gridOutageRule(this.grid);
    if (this.outageSeconds > 0) {
      this.outageSeconds = Math.max(0, this.outageSeconds - dtSeconds);
      report.outage = true;
    } else if (outageRule) {
      this.outageTimer += dtSeconds;
      if (this.outageTimer >= outageRule.checkSeconds) {
        this.outageTimer -= outageRule.checkSeconds;
        if (this.random() < outageRule.chance) {
          this.outageSeconds = outageRule.outageSeconds;
          report.outage = true;
        }
      }
    }
    const effectiveDemand = report.outage ? ZERO : demand;

    // 4) 再过存电装置：富余电力存起来，发电不够先放存量，放完还不够才降载
    const settlement = settleStorage({
      stored: this.storedEU,
      capacity: this.batteryCapacity(),
      net: generated.minus(effectiveDemand),
      dtSeconds,
    });
    this.storedEU = settlement.stored;
    const needEU = effectiveDemand.times(dtSeconds);
    const ratioDec = report.outage
      ? ZERO
      : needEU.lte(0)
        ? ONE
        : Decimal.max(0, Decimal.min(ONE, needEU.minus(settlement.shortfall).div(needEU)));
    report.euCharged = settlement.charged;
    report.euDischarged = settlement.discharged;

    // 污染：边污染边被净化器压，产出按污染档位打折
    const pollutionDelta = this.pollutionDeltaPerSecond();
    if (this.pollutionEnabled) {
      this.pollution = clampPollution(this.pollution.plus(pollutionDelta.times(dtSeconds)));
    }
    const pollutionMul = this.outputMultiplier();
    report.pollutionDelta = pollutionDelta;
    report.outputMultiplier = pollutionMul;
    const productive = ratioDec.times(pollutionMul);

    // 4) 采矿机产矿。超频提速，坏了的机器不算数
    //
    // 一台等级 n 的采矿机开采对应等级的矿脉：ULV 采矿机 → T0 矿脉，LV 采矿机 → T1 矿脉。
    // 所以没建 LV 采矿机时，T1 矿石一滴都不会涨。
    // 每座矿脉把产量均分给它能产的全部矿种（T0..T该矿脉等级）。
    const veinRates = new Map<number, Decimal>();
    for (const model of active) {
      if (model.category !== 'miner') continue;
      const rate = this.minerOutputPerSecond(model);
      if (rate.lte(0)) continue;
      const veinTier = model.tier - 1;
      veinRates.set(veinTier, (veinRates.get(veinTier) ?? ZERO).plus(rate));
    }
    for (const [veinTier, ratePerSecond] of veinRates) {
      const total = ratePerSecond.times(dtSeconds).times(productive);
      if (total.lte(0)) continue;
      const kinds = veinTier + 1;
      const share = total.div(kinds);
      for (let oreTier = 0; oreTier <= veinTier; oreTier += 1) {
        this.ores[oreTier] = this.ores[oreTier]!.plus(share);
        report.oreGained[oreTier] = report.oreGained[oreTier]!.plus(share);
      }
      this.totalOre = this.totalOre.plus(total);
    }

    // 5) 制造机产币，同时吃矿。超频提速，吃矿与耗电同步上涨
    for (const model of active) {
      if (model.category !== 'machine') continue;
      const produce = this.machineOutputPerSecond(model).times(dtSeconds).times(productive);
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

    // 6) 超频机器的故障判定：档位越高越容易坏，坏掉的下一拍开始停机
    for (const model of active) {
      const level = this.overclockOf(model.id);
      if (level === 0 || !canOverclock(model)) continue;
      const healthy = this.workingCountOf(model.id);
      if (healthy <= 0) continue;
      const broke = Math.min(healthy, sampleFaults(expectedFaults(level, healthy, dtSeconds), this.random));
      if (broke > 0) {
        this.faults[model.id] = this.faultyCountOf(model.id) + broke;
        report.faultsGained += broke;
      }
    }

    // 7) 污染事件：中度污染偶尔"变异"给一笔奖励，重度污染可能工厂崩溃
    if (this.pollutionEnabled) {
      this.handlePollutionEvents(dtSeconds, report);
    }
    // 8) 黑市电网：每分钟随机薅走一种 GT 币的 1%
    if (this.grid === 'black') {
      this.siphonTimer += dtSeconds;
      if (this.siphonTimer >= SIPHON_CHECK_SECONDS) {
        this.siphonTimer -= SIPHON_CHECK_SECONDS;
        this.siphonCoins();
      }
    }

    this.playSeconds += dtSeconds;
    report.euGenerated = generated;
    report.euConsumed = effectiveDemand.times(dtSeconds).times(ratioDec);
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
    pollutionDelta: ZERO,
    outputMultiplier: ONE,
    outage: false,
    mutations: 0,
    collapses: 0,
    euCharged: ZERO,
    euDischarged: ZERO,
    faultsGained: 0,
    oreGained: Array.from({ length: 14 }, () => ZERO),
    oreSpent: Array.from({ length: 14 }, () => ZERO),
    coinsGained: Array.from({ length: MAX_TIER }, () => ZERO),
  };
}

export { VOLTAGE_TIERS };
