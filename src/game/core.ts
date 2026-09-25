import { Decimal, ONE, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS, isValidTier } from '../numeric/voltage';
import { MARGINAL_COST_GROWTH, machineCost } from '../numeric/cost';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelEfficiency, generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { coinValueInTier1, convertCoins, paymentTier } from '../numeric/credit';
import { type UniverseId, universeById } from './universes';
import { isValidOverclockLevel, overclockEnergyMultiplier, overclockSpeedMultiplier } from '../numeric/overclock';
import { expectedFaults, sampleFaults } from '../numeric/fault';
import { batteryCapacityEU, settleStorage } from '../numeric/storage';
import { rebirthCables } from '../numeric/rebirth';
import {
  RESEARCH_FROM_TIER,
  RESEARCH_GATE_FROM_TIER,
  computerComputePerSecond,
  computerEnergyEU,
  labComputeThroughput,
  needsResearch,
  researchGain,
  researchRequired,
  settleCompute,
} from '../numeric/research';
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
import {
  bonusMultiplier,
  canBuyNode,
  machineSpeedMultiplier,
  minerSpeedMultiplier,
  rebirthNodeById,
  researchCostMultiplier,
  type RebirthEffectKind,
} from './rebirth';
import { ACHIEVEMENTS, achievedCount, type AchievementState } from './achievements';
import * as C from './constants';

// 机型 → 数值：出力带上机型倍率，烧矿速率带上机型的燃料效率。
// 这两个包装放在这里而不是数值层，是为了让数值层保持不依赖游戏数据。
function outputOf(model: MachineModel): Decimal {
  return generatorOutputEU(model.tier, model.outputFactor);
}

export type MachineKind = MachineCategory;

// 时空裂缝：本周目第一次到 LuV 时弹一次，选了转生就固定给这么多条线缆
export const RIFT_FROM_TIER = RESEARCH_FROM_TIER;
export const RIFT_CABLES = '1';

// 支付方式：计划书第七章规定用 GT 币买；但开局没有任何产币机器，
// 「手动挖矿攒矿石 → 造发电机和制造机」这条开局路径要求机器也能用矿石直接建造。
// 两种方式都保留，矿石价 = 币价 ÷ COINS_PER_ORE。
export type PayWith = 'coin' | 'ore';

export interface TickReport {
  euGenerated: Decimal;
  euConsumed: Decimal;
  powerRatio: number;
  // 算力（流量）：本拍产出、被研究站吃掉的、以及直接浪费掉的
  computeProduced: Decimal;
  computeUsed: Decimal;
  computeWasted: Decimal;
  // 本拍推进的研究进度，以及是否刚好研究完成（值是刚解锁的电压等级）
  researchGained: Decimal;
  researchUnlocked: number | null;
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
  // 转生：时空线缆余额、已完成的转生次数、已买下的永久加成节点
  cables = ZERO;
  rebirthCount = 0;
  rebirthNodes: string[] = [];
  // 本周目累计发电量（转生公式的输入，转生后归零）与历史累计
  runEU = ZERO;
  totalEU = ZERO;
  // 本周目的时空裂缝是否已经处理过（弹过并选了转生 / 选了不转）
  riftOffered = false;
  // 开发者模式：设置页里的测试开关，开着时界面会露出测试用的快捷操作
  devMode = false;
  // 已经拥有的平行宇宙（转生时选一个，选过的永久叠加）
  universes: UniverseId[] = [];
  // ── 累计统计与成就 ─────────────────────────────────────────
  // 历史最高电压等级（转生会重置本周目的 maxTier，但不重置这个）
  peakTier = 1;
  manualMines = 0;
  builtMachines = 0;
  overclockUsed = false;
  repairs = 0;
  // 历史最高污染值，用来判「冒过烟又治好了」
  maxPollution = ZERO;
  // 累计获得过的时空线缆（转生不清零）
  totalCables = ZERO;
  // 成就 id → 达成时的游戏内秒数
  achieved: Record<string, number> = {};
  // 波动电网：还要断多久、距离下次判定过了多久
  outageSeconds = 0;
  outageTimer = 0;
  siphonTimer = 0;
  mutationTimer = 0;
  collapseTimer = 0;
  maxTier = 1;
  unlockedVeins: number[] = [0];
  // 当前研究目标已经攒下的进度（研究完一级就清零重来）
  researchProgress = ZERO;
  // 已经研究出来、可以建造的电压等级。LuV 及以前不用研究，开局就在里面
  researched: number[] = Array.from(
    { length: RESEARCH_GATE_FROM_TIER - 1 },
    (_, index) => index + 1,
  );
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
    if (level > 0) this.overclockUsed = true;
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
    if (fixed > 0) this.repairs += 1;
    return fixed;
  }

  // ── 研究：算力与研究进度 ───────────────────────────────────

  // ── 转生：时空裂缝、时空线缆与永久加成 ─────────────────────

  // ── 平行宇宙 ───────────────────────────────────────────────

  hasUniverse(id: UniverseId): boolean {
    return this.universes.includes(id);
  }

  // 转生时选定一个宇宙，选过的会一直叠加
  addUniverse(id: string): boolean {
    const universe = universeById(id);
    if (!universe || this.hasUniverse(universe.id)) return false;
    this.universes.push(universe.id);
    return true;
  }

  // 工业宇宙：同一机型的边际成本增长从 1.07^k 降到 1.05^k
  marginalGrowth(): string {
    return this.hasUniverse('industry') ? '1.05' : MARGINAL_COST_GROWTH;
  }

  // 工业宇宙：跨电压结算。把「不高于结算等级的币」按币值合并后统一扣款，
  // 剩下的零头自动按 4:1 拆回低等级币（等价于 GTNH 的变压器 + 4 合 1 自动合成）。
  private payAcrossTiers(price: Decimal, payTier: number): boolean {
    const unit = coinValueInTier1(payTier);
    let available = ZERO;
    for (let tier = 1; tier <= payTier; tier += 1) {
      available = available.plus(this.coins[tier - 1]!.times(coinValueInTier1(tier)));
    }
    const need = price.times(unit);
    if (available.lt(need)) return false;

    let remaining = available.minus(need);
    for (let tier = payTier; tier >= 1; tier -= 1) {
      const coinValue = coinValueInTier1(tier);
      const count = remaining.div(coinValue).floor();
      this.coins[tier - 1] = count;
      remaining = remaining.minus(count.times(coinValue));
    }
    return true;
  }

  // 本周目第一次到 LuV，裂缝还没处理过 —— 界面该弹窗了
  riftPending(): boolean {
    return !this.riftOffered && this.maxTier >= RIFT_FROM_TIER;
  }

  // 现在打到 MAX 能拿几条线缆（还没到 MAX 返回 null）
  maxRouteCables(): Decimal | null {
    if (this.maxTier < MAX_TIER) return null;
    return rebirthCables({
      totalEU: this.runEU,
      maxTier: this.maxTier,
      rebirthCount: this.rebirthCount,
    });
  }

  canRebirth(route: 'rift' | 'max'): boolean {
    if (route === 'rift') return this.riftPending();
    return this.maxTier >= MAX_TIER;
  }

  cablesFor(route: 'rift' | 'max'): Decimal {
    if (route === 'rift') return dec(RIFT_CABLES);
    return this.maxRouteCables() ?? ZERO;
  }

  // 转生：拿线缆 → 选定平行宇宙 → 重置本周目 → 保留线缆 / 加成 / 宇宙 / 次数 / 累计统计
  rebirth(route: 'rift' | 'max', universe?: string): Decimal | null {
    if (!this.canRebirth(route)) return null;
    const gained = this.cablesFor(route);
    if (universe !== undefined) this.addUniverse(universe);
    this.cables = this.cables.plus(gained);
    this.totalCables = this.totalCables.plus(gained);
    this.rebirthCount += 1;
    this.resetRun();
    return gained;
  }

  // 关掉裂缝窗口：本周目就只剩打到 MAX 一条路
  declineRift(): boolean {
    if (!this.riftPending()) return false;
    this.riftOffered = true;
    return true;
  }

  buyRebirthNode(id: string): boolean {
    const node = rebirthNodeById(id);
    if (!node || !canBuyNode(this.rebirthNodes, node, this.cables)) return false;
    this.cables = this.cables.minus(dec(node.cost));
    this.rebirthNodes.push(node.id);
    return true;
  }

  canBuyRebirthNode(id: string): boolean {
    const node = rebirthNodeById(id);
    return node !== undefined && canBuyNode(this.rebirthNodes, node, this.cables);
  }

  // ── 开发者模式 ─────────────────────────────────────────────
  // 只是给测试用的快捷操作，不参与正常玩法；关掉开关就没法调用。

  // 组装给成就判断用的状态快照
  achievementState(): AchievementState {
    return {
      manualMines: this.manualMines,
      machineCount: MACHINE_MODELS.reduce((sum, model) => sum + this.countOf(model.id), 0),
      builtMachines: this.builtMachines,
      generatorCount: this.countOfCategory('generator'),
      minerCount: this.countOfCategory('miner'),
      maxTier: this.maxTier,
      peakTier: this.peakTier,
      overclockUsed: this.overclockUsed,
      repairs: this.repairs,
      gridCount: this.grids.length,
      researchCount: this.researched.filter((tier) => tier >= RESEARCH_GATE_FROM_TIER).length,
      rebirthCount: this.rebirthCount,
      rebirthNodeCount: this.rebirthNodes.length,
      storedEU: this.storedEU,
      batteryCapacity: this.batteryCapacity(),
      pollution: this.pollution,
      maxPollution: this.maxPollution,
      totalCoins: this.totalCoins,
      totalEU: this.totalEU,
      totalCables: this.totalCables,
    };
  }

  achievedCount(): number {
    return achievedCount(this.achieved);
  }

  // 每拍检查一次，第一次成立就记下时间（成就跨周目保留）
  private checkAchievements(): void {
    const state = this.achievementState();
    for (const achievement of ACHIEVEMENTS) {
      if (this.achieved[achievement.id] !== undefined) continue;
      if (achievement.check(state)) {
        this.achieved[achievement.id] = Math.floor(this.playSeconds);
      }
    }
  }

  setDevMode(enabled: boolean): void {
    this.devMode = enabled;
  }

  // 直接把电压推到某一级：开放矿脉、把该级及以前的机型都标记成已研究
  devUnlockTo(tier: number): boolean {
    if (!this.devMode || !isValidTier(tier)) return false;
    this.maxTier = tier;
    this.peakTier = Math.max(this.peakTier, tier);
    this.unlockedVeins = Array.from({ length: tier }, (_, index) => index);
    this.researched = Array.from({ length: tier }, (_, index) => index + 1);
    this.researchProgress = ZERO;
    return true;
  }

  // 每一级矿石与 GT 币各加一笔，方便直接测后面的机器
  devGrantResources(amount = '1e12'): boolean {
    if (!this.devMode) return false;
    const grant = dec(amount);
    this.ores = this.ores.map((held) => held.plus(grant));
    this.coins = this.coins.map((held) => held.plus(grant));
    return true;
  }

  devGrantCables(amount: string): boolean {
    if (!this.devMode) return false;
    this.cables = this.cables.plus(dec(amount));
    return true;
  }

  // 快进：按给定的秒数跑一拍模拟
  devAdvance(seconds: number): boolean {
    if (!this.devMode || !(seconds > 0)) return false;
    this.tick(seconds);
    return true;
  }

  devClearMachines(): boolean {
    if (!this.devMode) return false;
    this.counts = {};
    this.overclock = {};
    this.faults = {};
    this.storedEU = ZERO;
    return true;
  }

  private totalBonus(kind: RebirthEffectKind): Decimal {
    return bonusMultiplier(this.rebirthNodes, kind);
  }

  minerSpeedBonus(): Decimal {
    return minerSpeedMultiplier(this.rebirthNodes);
  }

  machineSpeedBonus(): Decimal {
    return machineSpeedMultiplier(this.rebirthNodes);
  }

  coinOutputBonus(): Decimal {
    return this.totalBonus('coinOutput');
  }

  fuelEfficiencyBonus(): Decimal {
    return this.totalBonus('fuelEfficiency');
  }

  computeOutputBonus(): Decimal {
    return this.totalBonus('computeOutput');
  }

  researchSpeedBonus(): Decimal {
    return this.totalBonus('researchSpeed');
  }

  researchCostFactor(): Decimal {
    return researchCostMultiplier(this.rebirthNodes);
  }

  // 把本周目的一切推回开局，只留跨周目的东西
  private resetRun(): void {
    this.ores = Array.from({ length: 14 }, () => ZERO);
    this.coins = Array.from({ length: MAX_TIER }, () => ZERO);
    this.counts = {};
    this.overclock = {};
    this.faults = {};
    this.storedEU = ZERO;
    this.pollution = ZERO;
    this.siphoned = ZERO;
    this.grid = DEFAULT_GRID;
    this.grids = [DEFAULT_GRID];
    this.outageSeconds = 0;
    this.outageTimer = 0;
    this.siphonTimer = 0;
    this.mutationTimer = 0;
    this.collapseTimer = 0;
    this.maxTier = 1;
    this.unlockedVeins = [0];
    this.researchProgress = ZERO;
    this.researched = Array.from(
      { length: RESEARCH_GATE_FROM_TIER - 1 },
      (_, index) => index + 1,
    );
    this.runEU = ZERO;
    this.riftOffered = false;
    this.lastReport = emptyReport();
  }

  // 这一级的机型能不能造。ZPM 及以后要先研究出来
  isResearched(tier: number): boolean {
    return !needsResearch(tier) || this.researched.includes(tier);
  }

  // 当前研究目标：已解锁电压里最低的那个还没研究出来的等级。
  // 没有目标（还没到 ZPM，或目标都研究完了）时返回 null
  researchTargetTier(): number | null {
    for (let tier = RESEARCH_GATE_FROM_TIER; tier <= this.maxTier; tier += 1) {
      if (!this.researched.includes(tier)) return tier;
    }
    return null;
  }

  // 计算机的算力总产量（额定值，不含供电降载）
  computerComputeRated(): Decimal {
    let total = ZERO;
    for (const model of modelsOf('research')) {
      if (model.computeRole !== 'produce' || model.tier > this.maxTier) continue;
      total = total.plus(
        computerComputePerSecond(model.tier)
          .times(this.computeOutputBonus())
          .times(this.workingCountOf(model.id)),
      );
    }
    return total;
  }

  // 解锁某一级机型需要的研究进度（含永久加成的减免）
  researchRequiredFor(tier: number): Decimal {
    return researchRequired(tier).times(this.researchCostFactor());
  }

  // 研究站想吃的算力总量（额定值）。没有研究目标时研究站空转，不打算力
  labComputeDemand(): Decimal {
    if (this.researchTargetTier() === null) return ZERO;
    let total = ZERO;
    for (const model of modelsOf('research')) {
      if (model.computeRole !== 'consume' || model.tier > this.maxTier) continue;
      total = total.plus(labComputeThroughput(model.tier).times(this.workingCountOf(model.id)));
    }
    return total;
  }

  computerEnergyDrain(model: MachineModel): Decimal {
    return computerEnergyEU(model.tier).times(this.workingCountOf(model.id));
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
      .times(this.minerSpeedBonus())
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
      .times(this.machineSpeedBonus())
      .times(this.coinOutputBonus())
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
    return this.generatorFuelRateOf(model).times(this.countOf(model.id));
  }

  // 单台发电机的烧矿速率。永久加成里的「燃料效率」直接乘在机型的效率上
  generatorFuelRateOf(model: MachineModel): Decimal {
    const efficiency = dec(model.fuelEfficiency ?? generatorFuelEfficiency(model.tier)).times(
      this.fuelEfficiencyBonus(),
    );
    return generatorFuelRate(model.tier, {
      outputFactor: model.outputFactor,
      efficiency,
    });
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
      ...this.runningTiers('research'),
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
    this.manualMines += 1;
  }

  // 单价：基准成本 × 机型成本系数
  coinPriceOf(model: MachineModel): Decimal {
    return machineCost({
      baseCost: C.BASE_MACHINE_COST,
      tier: model.tier,
      purchased: this.countOf(model.id),
      growth: this.marginalGrowth(),
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
    if (!this.isResearched(model.tier)) return false;
    const price = this.priceOf(model, payWith);
    const index = payWith === 'ore' ? model.tier - 1 : paymentTier(model.tier) - 1;
    const wallet = payWith === 'ore' ? this.ores[index]! : this.coins[index]!;
    if (payWith === 'coin' && this.hasUniverse('industry')) {
      // 跨电压结算：看的是所有不高于结算等级的币合起来的价值
      const payTier = paymentTier(model.tier);
      let available = ZERO;
      for (let tier = 1; tier <= payTier; tier += 1) {
        available = available.plus(this.coins[tier - 1]!.times(coinValueInTier1(tier)));
      }
      return available.gte(price.times(coinValueInTier1(payTier)));
    }
    return wallet.gte(price);
  }

  buy(model: MachineModel, count: number, payWith: PayWith = 'coin'): number {
    // 没研究出来的机型买不了 —— 硬墙挡在这里，不只是界面灰掉
    if (!this.isResearched(model.tier)) return 0;
    const acrossTiers = payWith === 'coin' && this.hasUniverse('industry');
    let bought = 0;
    for (let i = 0; i < count; i += 1) {
      const price = this.priceOf(model, payWith);
      const index = payWith === 'ore' ? model.tier - 1 : paymentTier(model.tier) - 1;
      const wallet = payWith === 'ore' ? this.ores[index]! : this.coins[index]!;
      if (acrossTiers) {
        if (!this.payAcrossTiers(price, paymentTier(model.tier))) break;
      } else {
        if (wallet.lt(price)) break;
        if (payWith === 'ore') this.ores[index] = wallet.minus(price);
        else this.coins[index] = wallet.minus(price);
      }
      this.counts[model.id] = this.countOf(model.id) + 1;
      bought += 1;
    }
    this.builtMachines += bought;
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
    this.peakTier = Math.max(this.peakTier, tier);
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
      } else if (model.category === 'research' && model.computeRole === 'produce') {
        // 研究站不直接耗电，它吃的是计算机产出的算力
        demand = demand.plus(this.computerEnergyDrain(model));
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
    this.maxPollution = Decimal.max(this.maxPollution, this.pollution);
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

    // 5b) 研究：计算机产算力，研究站吃算力推进研究进度。
    //     算力是流量 —— 产出来当拍不用掉就浪费掉；缺电按供电比例少产。
    //     它不受污染影响：污染惩罚的是"产出物"（矿与币），不是基础设施。
    const computeProduced = this.computerComputeRated().times(ratioDec);
    const computeSettlement = settleCompute(computeProduced, this.labComputeDemand());
    report.computeProduced = computeProduced;
    report.computeUsed = computeSettlement.used;
    report.computeWasted = computeSettlement.wasted;
    const researchTarget = this.researchTargetTier();
    if (researchTarget !== null) {
      const gain = researchGain(computeSettlement.used, dtSeconds).times(this.researchSpeedBonus());
      if (gain.gt(0)) {
        this.researchProgress = this.researchProgress.plus(gain);
        report.researchGained = gain;
        const required = this.researchRequiredFor(researchTarget);
        if (this.researchProgress.gte(required)) {
          this.researchProgress = this.researchProgress.minus(required);
          this.researched.push(researchTarget);
          report.researchUnlocked = researchTarget;
        }
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
    this.runEU = this.runEU.plus(generated);
    this.totalEU = this.totalEU.plus(generated);
    report.euGenerated = generated;
    report.euConsumed = effectiveDemand.times(dtSeconds).times(ratioDec);
    report.powerRatio = ratioDec.toNumber();
    this.lastReport = report;
    this.checkAchievements();
    return report;
  }
}

function emptyReport(): TickReport {
  return {
    euGenerated: ZERO,
    euConsumed: ZERO,
    powerRatio: 1,
    computeProduced: ZERO,
    computeUsed: ZERO,
    computeWasted: ZERO,
    researchGained: ZERO,
    researchUnlocked: null,
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
