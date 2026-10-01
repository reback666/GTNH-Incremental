import { Decimal, ONE, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS, isValidTier } from '../numeric/voltage';
import { MARGINAL_COST_GROWTH, SELL_REFUND_RATE, machineCost } from '../numeric/cost';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelEfficiency, generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { coinValueInTier1, convertCoins, paymentTier } from '../numeric/credit';
import { type UniverseId, universeById } from './universes';
import {
  arcaneOutputBonus,
  essentiaFromPurify,
  nodeEssentiaDemand,
  nodeOutputFactor,
  nodeVisPerSecond,
  visPerMachine,
} from '../numeric/arcane';
import {
  corrosionPerSecond,
  pollutionDriveFactor,
  suppressionPoints,
} from '../numeric/abyss';
import { isValidOverclockLevel, overclockEnergyMultiplier, overclockSpeedMultiplier } from '../numeric/overclock';
import { expectedFaults, sampleFaults } from '../numeric/fault';
import {
  SILICON_KEEP_PRIORITY,
  SILICON_MISJUDGE_CHANCE,
  SILICON_DOWNGRADE_RATIO,
  SILICON_UPGRADE_HEADROOM,
  type SiliconKind,
} from '../numeric/silicon';
import { MAX_OVERCLOCK_LEVEL } from '../numeric/overclock';
import { batteryCapacityEU, settleStorage } from '../numeric/storage';
import { rebirthCables } from '../numeric/rebirth';
import {
  type PickaxeLine,
  blastChances,
  collectChances,
  pickaxeOutputPerClick,
  pickaxeIconTier,
  pickaxeUpgradeCoinTier,
  pickaxeUpgradeCost,
  vajraChances,
  vajraMaxLevel,
} from '../numeric/pickaxe';
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
  effectTotal,
  machineSpeedMultiplier,
  minerSpeedMultiplier,
  rebirthNodeById,
  researchCostMultiplier,
  type RebirthEffectKind,
} from './rebirth';
import { ACHIEVEMENTS, achievedCount, type AchievementState } from './achievements';
import {
  challengeById,
  challengeSettles,
  evaluateChallenge,
  isChallengeId,
  type ChallengeId,
} from './challenges';
import * as C from './constants';

// 机型 → 数值：出力带上机型倍率，烧矿速率带上机型的燃料效率。
// 这两个包装放在这里而不是数值层，是为了让数值层保持不依赖游戏数据。
function outputOf(model: MachineModel): Decimal {
  return generatorOutputEU(model.tier, model.outputFactor);
}

// 会产生污染的机器类别（净化器不产生，它是往下压的那一方）
const POLLUTING_CATEGORIES: MachineCategory[] = ['miner', 'generator', 'machine', 'research'];

export type MachineKind = MachineCategory;

// 时空裂缝：本周目第一次到 LuV 时弹一次，选了转生就固定给这么多条线缆
export const RIFT_FROM_TIER = RESEARCH_FROM_TIER;
export const RIFT_CABLES = '1';

// 支付方式：计划书第七章规定用 GT 币买；但开局没有任何产币机器，
// 「手动挖矿攒矿石 → 造发电机和制造机」这条开局路径要求机器也能用矿石直接建造。
// 两种方式都保留，矿石价 = 币价 ÷ COINS_PER_ORE。
export type PayWith = 'coin' | 'ore';

// 开发者模式里「指定资源增减」的目标：
//   ores / coins / both 是每一级都给一份
//   ore / coin 只动指定等级的那一种
//   cables 是时空线缆（转生货币）
export type DevResourceTarget =
  | { scope: 'ores' | 'coins' | 'both' | 'cables' }
  | { scope: 'ore' | 'coin'; tier: number };

// 转生履历的一条（docs/转生拓展大纲.md C1）：结算那一刻记下，只增不改，
// 超过 50 条丢最旧的。数值都存字符串（Decimal 序列化口径）。
export interface RunHistoryEntry {
  // 第几个周目（转生后的 rebirthCount，即刚结束的周目序号）
  run: number;
  route: 'rift' | 'max';
  // 这一趟带走的平行宇宙（没带是空串）
  universe: string;
  // 挂着的挑战与结算结果（没挂是空串；passed 只在通过时 true）
  challenge: string;
  challengePassed: boolean;
  cables: string;
  // 本周目时长（游戏内秒）与最高电压
  seconds: number;
  maxTier: number;
}

export interface TickReport {
  euGenerated: Decimal;
  // 这一拍「拿得出」的功率 × 步长：燃料够、灵气够时的上限。
  // 和 euGenerated（按需发电之后的实际值）对比，能区分「缺燃料」和「按需降载」。
  euCapacity: Decimal;
  // 这一拍的长度（秒）。报表里的产量都是"每拍"的量，换算成每秒要看它，
  // 不能假定就是 1 秒（开发者模式的快进会一次跑很长的一拍）。
  stepSeconds: number;
  euConsumed: Decimal;
  powerRatio: number;
  // 算力（流量）：本拍产出、被研究站吃掉的、以及直接浪费掉的
  computeProduced: Decimal;
  computeUsed: Decimal;
  computeWasted: Decimal;
  // 本拍推进的研究进度，以及是否刚好研究完成（值是刚解锁的电压等级）
  researchGained: Decimal;
  // 刚研究出来的机型 id（没有进展就是 null）
  researchUnlocked: string | null;
  // 奥术宇宙：本拍的灵气产出 / 实际用掉，以及源质的产出 / 消耗
  visProduced: Decimal;
  visUsed: Decimal;
  // 灵气充裕度（0~1）：喂满魔法机器就是 1，产量加成按它算
  arcanePlenty: Decimal;
  essentiaProduced: Decimal;
  essentiaUsed: Decimal;
  // 奥术宇宙：污染对灵气机器产出的倍率
  arcanePollutionFactor: Decimal;
  // 挑战时间线：这一拍刚好违规失效的挑战 id（只在失效那一拍有值）
  challengeFailed: string | null;
  // 深渊宇宙：本拍每台机器因污染损坏的概率，以及抑制器抵消掉的污染点数
  corrosionPerSecond: Decimal;
  suppression: Decimal;
  corrosionFaults: number;
  // 硅基宇宙：这一拍 AI 自动修好了几台、升/降了几档、停了哪几类机器
  autoRepairs: number;
  autoOverclockUp: number;
  autoOverclockDown: number;
  sheddedKinds: string[];
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
  // 手动停机的机型（只记停掉的那些，数量为 0 时不留记录）
  stopped: Record<string, true> = {};
  // 存电装置的存量（EU），所有电池共用一个池子
  storedEU = ZERO;
  // 污染值 0-100。设置里关掉污染机制后它不涨、也不产生任何影响
  pollution = ZERO;
  pollutionEnabled = true;
  // 上一拍每台机器实际跑起来的比例（机型 id → 0..1），只用来折算污染产生量
  private pollutionLoad = new Map<string, Decimal>();
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
  // 已经选好、等下一次转生带走的宇宙（只存选择本身，转生时才生效）
  pendingUniverse: UniverseId | null = null;
  // ── 挑战时间线（docs/转生拓展大纲.md M3）──────────────────
  // 本周目挂着的挑战：转生时从 pendingChallenge 生效，全程受检
  activeChallenge: ChallengeId | null = null;
  // 挑战违规即静默失效（没有惩罚，只是结算拿不到加成）
  challengeViolated = false;
  // 赤色时间线的热身标记：污染首次到 60% 之后判定才开始
  challengePrimed = false;
  // 首通过的挑战（跨周目保留，只用来点亮首通成就，不重复发奖）
  completedChallenges: ChallengeId[] = [];
  // 转生履历（最近的在最前，超过 50 条丢最旧的）
  runHistory: RunHistoryEntry[] = [];
  // 终局装置「普朗克锚」：买一次永久生效（跨周目），MAX 路线结算 ×1.5
  planckAnchor = false;
  // 已经选好、等下一次转生挂上的挑战
  pendingChallenge: ChallengeId | null = null;
  // 硅基宇宙的三项 AI 功能，默认全开（三个开关互相独立，跨周目保留）
  siliconAutoRepair = true;
  siliconAutoOverclock = true;
  siliconShedding = true;
  // 奥术宇宙的源质存量（净化器副产，喂给灵气节点）
  essentia = ZERO;
  // ── 镐子（手动开采） ───────────────────────────────────────
  // 金刚杵等级 = 镐子能挖的矿脉等级；连锁采集等级；连锁爆破已用掉的机会数
  pickaxeVajra = 0;
  pickaxeCollect = 0;
  pickaxeBlast = 0;
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
  // 研究是手选机型：ZPM 及以后每个机型都要单独研究，只有选中的那一台在推进。
  // 每台机器各记自己的进度，中途换项目不会把已攒的进度丢掉
  researchTarget: string | null = null;
  researchProgress: Record<string, Decimal> = {};
  // 已经研究出来、可以建造的机型 id。LuV 及以前的机型不用研究，不在这个名单里
  researchedModels: string[] = [];
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
    // 宇宙被收回之后，那类机器既看不见也不干活，就别再算进台数里
    return modelsOf(category)
      .filter((model) => this.universeSatisfied(model))
      .reduce((sum, model) => sum + this.countOf(model.id), 0);
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

  // 能干活（没坏、也没被玩家手动停机）的台数：这些台数既不产出也不耗电。
  // 产矿、产币、发电、净化、污染、故障判定全部走这一份，停机只改这一个口子
  workingCountOf(modelId: string): number {
    if (this.isStopped(modelId)) return 0;
    return Math.max(0, this.countOf(modelId) - this.faultyCountOf(modelId));
  }

  isStopped(modelId: string): boolean {
    return this.stopped[modelId] === true;
  }

  // 手动停机 / 恢复运行。这一台机型一台都没建过时，没什么可停的
  setStopped(modelId: string, stopped: boolean): boolean {
    if (this.countOf(modelId) <= 0) return false;
    if (stopped) this.stopped[modelId] = true;
    else delete this.stopped[modelId];
    return true;
  }

  toggleStopped(modelId: string): boolean {
    return this.setStopped(modelId, !this.isStopped(modelId));
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

  // 记住「下次转生带哪个宇宙」。选中的那一刻不生效，转生时才生效 ——
  // 这个选择跟着存档走，来回切页面、刷新都不会丢
  setPendingUniverse(id: string | null): boolean {
    if (id === null) {
      this.pendingUniverse = null;
      return true;
    }
    const universe = universeById(id);
    if (!universe || this.hasUniverse(universe.id)) return false;
    this.pendingUniverse = universe.id;
    return true;
  }

  // 挑战选择：跟 pendingUniverse 一样只存选择本身，转生时才生效。
  // 赤色时间线要深渊宇宙——已拥有、或本次转生正打算带上，都算够格
  canPickChallenge(id: string): boolean {
    const challenge = challengeById(id);
    if (!challenge) return false;
    if (challenge.requireUniverse === undefined) return true;
    return this.hasUniverse(challenge.requireUniverse) || this.pendingUniverse === challenge.requireUniverse;
  }

  setPendingChallenge(id: string | null): boolean {
    if (id === null) {
      this.pendingChallenge = null;
      return true;
    }
    if (!isChallengeId(id) || !this.canPickChallenge(id)) return false;
    this.pendingChallenge = id;
    return true;
  }

  // 本周目挑战的状态文案用：进行中 / 已失效 / 首通已达成
  challengeSettled(id: string): boolean {
    return this.completedChallenges.includes(id as ChallengeId);
  }

  // 工业宇宙：同一机型的边际成本增长从 1.07^k 降到 1.05^k
  marginalGrowth(): string {
    if (!this.hasUniverse('industry')) return MARGINAL_COST_GROWTH;
    return this.hasRebirthEffect('industryDeepen') ? '1.04' : '1.05';
  }

  // 工业宇宙：跨电压结算。把「不高于结算等级的币」按币值合并后统一扣款，
  // 剩下的零头自动按 4:1 拆回低等级币（等价于 GTNH 的变压器 + 4 合 1 自动合成）。
  // 硅基宇宙的停机调度：从优先级最低的类别开始整组停，直到剩下的需求装得进供给。
  // AI 有 5% 概率误判 —— 那次不按优先级来，而是随机停掉一组，下一拍它会自己纠正。
  private shedKinds(
    demandByKind: Map<MachineKind, Decimal>,
    supply: Decimal,
  ): Set<MachineKind> {
    const shed = new Set<MachineKind>();
    if (this.random() < this.siliconMisjudgeChance()) {
      const candidates = SILICON_KEEP_PRIORITY.filter((kind) => demandByKind.has(kind));
      if (candidates.length > 0) {
        const pick = Math.min(
          candidates.length - 1,
          Math.floor(this.random() * candidates.length),
        );
        shed.add(candidates[pick] as MachineKind);
      }
    }

    let remaining = ZERO;
    for (const value of demandByKind.values()) remaining = remaining.plus(value);
    for (let i = SILICON_KEEP_PRIORITY.length - 1; i >= 0 && remaining.gt(supply); i -= 1) {
      const kind = SILICON_KEEP_PRIORITY[i] as SiliconKind;
      if (!demandByKind.has(kind) || shed.has(kind)) continue;
      shed.add(kind);
      remaining = remaining.minus(demandByKind.get(kind)!);
    }
    return shed;
  }

  private payAcrossTiers(price: Decimal, payTier: number): boolean {
    const unit = coinValueInTier1(payTier);
    let available = ZERO;
    for (let tier = 1; tier <= payTier; tier += 1) {
      available = available.plus(this.coins[tier - 1]!.times(coinValueInTier1(tier)));
    }
    const need = price.times(unit);
    if (available.lt(need)) return false;

    // 从高等级往低等级扣：先用本级结算币，不够再动低一级的，而不是把钱包整体规整
    // （规整会把玩家的低等级币吞掉换成高等级币，看起来就像「先扣了 4 倍的上一级币」）。
    let remaining = need;
    for (let tier = payTier; tier >= 1 && remaining.gt(0); tier -= 1) {
      const coinValue = coinValueInTier1(tier);
      const have = this.coins[tier - 1]!;
      const haveValue = have.times(coinValue);
      if (haveValue.lte(0)) continue;
      // 按价值扣，允许扣到小数枚 —— 机器产出的币本来就是小数，硬凑整会留下付不掉的零头
      const takeValue = Decimal.min(haveValue, remaining);
      this.coins[tier - 1] = have.minus(takeValue.div(coinValue));
      remaining = remaining.minus(takeValue);
    }
    return true;
  }

  // 本周目第一次到 LuV，裂缝还没处理过 —— 界面该弹窗了
  riftPending(): boolean {
    return !this.riftOffered && this.maxTier >= RIFT_FROM_TIER;
  }

  // 现在打到 MAX 能拿几条线缆（还没到 MAX 返回 null）。
  // 普朗克锚在这里乘：结算与界面读数天然一致
  maxRouteCables(): Decimal | null {
    if (this.maxTier < MAX_TIER) return null;
    const base = rebirthCables({
      totalEU: this.runEU,
      maxTier: this.maxTier,
      rebirthCount: this.rebirthCount,
    });
    return this.planckAnchor ? base.times(C.PLANCK_ANCHOR_MULTIPLIER).floor() : base;
  }

  canRebirth(route: 'rift' | 'max'): boolean {
    if (route === 'rift') return this.riftPending();
    return this.maxTier >= MAX_TIER;
  }

  cablesFor(route: 'rift' | 'max'): Decimal {
    if (route === 'rift') return dec(RIFT_CABLES);
    return this.maxRouteCables() ?? ZERO;
  }

  // 转生：拿线缆 → 选定平行宇宙 → 重置本周目 → 保留线缆 / 加成 / 宇宙 / 次数 / 累计统计。
  // 挂着挑战且通过时线缆乘各自倍率；赤色时间线全程没到过 60% 视为没参与，不加成
  rebirth(route: 'rift' | 'max', universe?: string): Decimal | null {
    if (!this.canRebirth(route)) return null;
    let gained = this.cablesFor(route);
    const challenge = this.activeChallenge;
    const passed =
      challenge !== null &&
      challengeSettles(challenge, this.challengeViolated, this.challengePrimed);
    if (challenge !== null && passed) {
      gained = gained.times(challengeById(challenge)!.bonus).floor();
      if (!this.completedChallenges.includes(challenge)) this.completedChallenges.push(challenge);
    }
    this.runHistory.unshift({
      run: this.rebirthCount + 1,
      route,
      universe: universe ?? '',
      challenge: challenge ?? '',
      challengePassed: passed,
      cables: gained.toString(),
      seconds: Math.floor(this.playSeconds),
      maxTier: this.maxTier,
    });
    if (this.runHistory.length > 50) this.runHistory.length = 50;
    if (universe !== undefined) this.addUniverse(universe);
    this.pendingUniverse = null; // 选择已经用掉
    this.cables = this.cables.plus(gained);
    this.totalCables = this.totalCables.plus(gained);
    this.rebirthCount += 1;
    this.resetRun();
    // 新周目的挑战在重置之后挂上；选择用掉即清空
    this.activeChallenge = this.pendingChallenge;
    this.pendingChallenge = null;
    this.challengeViolated = false;
    this.challengePrimed = false;
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

  // 铸造普朗克锚：花 300 条线缆，一次性永久生效
  buyPlanckAnchor(): boolean {
    if (this.planckAnchor) return false;
    if (this.cables.lt(dec(C.PLANCK_ANCHOR_COST))) return false;
    this.cables = this.cables.minus(dec(C.PLANCK_ANCHOR_COST));
    this.planckAnchor = true;
    return true;
  }

  canBuyRebirthNode(id: string): boolean {
    const node = rebirthNodeById(id);
    return (
      node !== undefined && canBuyNode(this.rebirthNodes, node, this.cables, this.universes)
    );
  }

  // ── 开发者模式 ─────────────────────────────────────────────
  // 只是给测试用的快捷操作，不参与正常玩法；关掉开关就没法调用。

  // 组装给成就判断用的状态快照
  achievementState(): AchievementState {
    // 按条件数台数：成就里那几条「有名有姓」的机器都用它
    const countWhere = (predicate: (model: MachineModel) => boolean): number =>
      MACHINE_MODELS.reduce(
        (sum, model) => (predicate(model) ? sum + this.countOf(model.id) : sum),
        0,
      );
    const fuelGenerators = (suffix: string): number =>
      countWhere((model) => model.category === 'generator' && model.id.endsWith(suffix));
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
      researchCount: this.researchedModels.length,
      researchedZpm: this.researchedModels.some((id) => {
        const model = MACHINE_MODELS.find((item) => item.id === id);
        return model?.tier === RESEARCH_GATE_FROM_TIER;
      }),
      rebirthCount: this.rebirthCount,
      rebirthNodeCount: this.rebirthNodes.length,
      storedEU: this.storedEU,
      batteryCapacity: this.batteryCapacity(),
      pollution: this.pollution,
      maxPollution: this.maxPollution,
      totalCoins: this.totalCoins,
      totalEU: this.totalEU,
      totalCables: this.totalCables,
      playSeconds: this.playSeconds,
      totalOre: this.totalOre,
      totalOreSpent: this.totalOreSpent,
      siphoned: this.siphoned,
      // 手里最高一级的币：币的种类按等级排，拿过哪一级就算到哪一级
      topCoinTier: this.coins.reduce((top, amount, index) => (amount.gt(0) ? index + 1 : top), 0),
      universeCount: this.universes.length,
      topOverclock: MACHINE_MODELS.reduce(
        (top, model) => Math.max(top, this.overclockOf(model.id)),
        0,
      ),
      pickaxeVajra: this.pickaxeVajra,
      pickaxeCollect: this.pickaxeCollect,
      pickaxeBlast: this.pickaxeBlast,
      researchedTotal: this.researchedModels.length,
      // 只数「真的能被研究」的那部分：灵气节点与腐蚀抑制器要有对应平行宇宙才会出现在研究列表里。
      // 不这么算的话，没有那两个宇宙的玩家把能研究的全研究完，也永远差着 14 台拿不到成就。
      researchTotal: MACHINE_MODELS.filter(
        (model) => needsResearch(model.tier) && this.universeSatisfied(model),
      ).length,
      essentia: this.essentia,
      completedChallenges: this.completedChallenges,
      specials: {
        steam: fuelGenerators('-steam'),
        plasma: fuelGenerators('-plasma'),
        dyson: fuelGenerators('-dyson'),
        blackhole: fuelGenerators('-blackhole'),
        multiblock: countWhere((model) => model.block === 'multiblock'),
        arcane: countWhere((model) => model.visPowered === true),
        suppressor: countWhere((model) => model.category === 'abyss'),
      },
    };
  }

  achievedCount(): number {
    return achievedCount(this.achieved);
  }

  // 每拍检查一次，第一次成立就记下时间（成就跨周目保留）
  private checkAchievements(): void {
    // 全达成之后就没必要每拍再扫一遍 20 条判定
    if (achievedCount(this.achieved) >= ACHIEVEMENTS.length) return;
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
    // 不动 peakTier：那是玩家的履历统计（还挂着「最高电压」成就），
    // 开发者模式是测试工具，不该顺手把成就也刷了
    this.unlockedVeins = Array.from({ length: tier }, (_, index) => index);
    this.researchedModels = MACHINE_MODELS.filter(
      (model) => model.tier <= tier && needsResearch(model.tier),
    ).map((model) => model.id);
    this.researchTarget = null;
    this.researchProgress = {};
    return true;
  }

  // 每一级矿石与 GT 币各加一笔，方便直接测后面的机器
  devGrantResources(amount = '1e12'): boolean {
    return this.devAdjustResource({ scope: 'both' }, amount, 1);
  }

  // 按指定的资源与数量增减。数量取绝对值，方向由 sign 决定；
  // 减到 0 就停 —— 负资源会让后面所有公式失真，那不是「测试」而是把存档弄坏。
  devAdjustResource(target: DevResourceTarget, amount: string, sign: 1 | -1): boolean {
    if (!this.devMode) return false;
    let delta: Decimal;
    try {
      delta = dec(amount).abs();
    } catch {
      return false;
    }
    if (!delta.isFinite() || delta.isZero()) return false;
    if ('tier' in target && !isValidTier(target.tier)) return false;

    const step = sign < 0 ? delta.neg() : delta;
    const apply = (held: Decimal): Decimal => {
      const next = held.plus(step);
      return next.lt(0) ? ZERO : next;
    };

    switch (target.scope) {
      case 'ore':
        this.ores[target.tier - 1] = apply(this.ores[target.tier - 1]!);
        break;
      case 'coin':
        this.coins[target.tier - 1] = apply(this.coins[target.tier - 1]!);
        break;
      case 'ores':
        this.ores = this.ores.map(apply);
        break;
      case 'coins':
        this.coins = this.coins.map(apply);
        break;
      case 'both':
        this.ores = this.ores.map(apply);
        this.coins = this.coins.map(apply);
        break;
      case 'cables':
        this.cables = apply(this.cables);
        break;
    }
    return true;
  }

  devGrantCables(amount: string): boolean {
    return this.devAdjustResource({ scope: 'cables' }, amount, 1);
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
    this.stopped = {};
    this.storedEU = ZERO;
    return true;
  }

  // 测试用：直接把某个宇宙加进来（正常玩法里只有转生时才会获得宇宙）
  devGrantUniverse(id: string): boolean {
    if (!this.devMode) return false;
    return this.addUniverse(id);
  }

  // 测试用：把某个宇宙撤掉。已经建好的灵气节点 / 抑制器留着不动，
  // 只是失去宇宙之后它们不再生效（重新给回来就能继续用）
  devRevokeUniverse(id: string): boolean {
    if (!this.devMode) return false;
    const universe = universeById(id);
    if (!universe || !this.hasUniverse(universe.id)) return false;
    this.universes = this.universes.filter((item) => item !== universe.id);
    // 待选里如果正挂着它，一并清掉
    if (this.pendingUniverse === universe.id) this.pendingUniverse = null;
    return true;
  }

  private totalBonus(kind: RebirthEffectKind): Decimal {
    return bonusMultiplier(this.rebirthNodes, kind);
  }

  // 给界面读的加成倍率（1 + 该类累计）
  totalBonusFor(kind: RebirthEffectKind): Decimal {
    return this.totalBonus(kind);
  }

  // 污染产生的总倍率（「污染产生」节点）
  pollutionProductionFactor(): Decimal {
    return ONE.minus(effectTotal(this.rebirthNodes, 'pollutionReduction'));
  }

  // 超频故障率的总倍率（「故障率」节点）
  faultFactor(): Decimal {
    return ONE.minus(effectTotal(this.rebirthNodes, 'faultReduction'));
  }

  // 腐蚀损坏率的总倍率（「腐蚀损伤」节点）
  corrosionFactor(): Decimal {
    return ONE.minus(effectTotal(this.rebirthNodes, 'corrosionReduction'));
  }

  // 树上是否点亮了某一类效果（每个 kind 至少有一个非零节点，累计 > 0 即视为点亮）
  hasRebirthEffect(kind: RebirthEffectKind): boolean {
    return effectTotal(this.rebirthNodes, kind).gt(0);
  }

  // 接电网机器的耗电倍率（「全厂耗电」节点）
  energyFactor(): Decimal {
    return ONE.minus(effectTotal(this.rebirthNodes, 'energySaving'));
  }

  // 硅基 AI 的误判率（「误判率」节点把它从 5% 压到 2%）
  siliconMisjudgeChance(): number {
    return this.hasRebirthEffect('siliconMisjudge') ? 0.02 : SILICON_MISJUDGE_CHANCE;
  }

  // 深渊宇宙污染驱动产出的中性点（「中性点」节点把它从 30% 移到 25%）
  abyssNeutralPoint(): Decimal {
    return this.hasRebirthEffect('abyssNeutral') ? dec('25') : dec('30');
  }

  // 中性点的偏移量，传给 pollutionDriveFactor
  pollutionNeutralShift(): Decimal {
    return this.hasRebirthEffect('abyssNeutral') ? dec('5') : ZERO;
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
    this.stopped = {};
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
    this.pickaxeVajra = 0;
    this.pickaxeCollect = 0;
    this.pickaxeBlast = 0;
    this.researchTarget = null;
    this.researchProgress = {};
    this.researchedModels = [];
    this.runEU = ZERO;
    this.riftOffered = false;
    this.challengeViolated = false;
    this.challengePrimed = false;
    this.lastReport = emptyReport();
  }

  // 这台机型要不要先研究（ZPM 及以后要），研究出来没有
  isModelResearched(model: MachineModel): boolean {
    return !needsResearch(model.tier) || this.researchedModels.includes(model.id);
  }

  // 机型能不能造：研究 + 平行宇宙两个条件都要满足（灵气节点要奥术宇宙）
  isModelUnlocked(model: MachineModel): boolean {
    if (!this.isModelResearched(model)) return false;
    return this.universeSatisfied(model);
  }

  // 这台机器要求的平行宇宙有没有。没有的话它既买不到、界面上也不该出现、
  // 已经建好的也停摆（开发者模式可以收回宇宙，不能留下看不见还在跑的机器）。
  universeSatisfied(model: MachineModel): boolean {
    return model.requiresUniverse === undefined || this.hasUniverse(model.requiresUniverse);
  }

  // 这一级要单独研究的机型（ZPM 及以后每个机型一张研究单）
  researchableModelsAt(tier: number): MachineModel[] {
    if (!needsResearch(tier)) return [];
    return MACHINE_MODELS.filter(
      (model) => model.tier === tier && this.universeSatisfied(model),
    );
  }

  // 可以选的研究项目：所有还没研究出来的机型（电压没解锁也能先研究，只是暂时造不了）
  researchOptions(): MachineModel[] {
    const out: MachineModel[] = [];
    for (let tier = RESEARCH_GATE_FROM_TIER; tier <= MAX_TIER; tier += 1) {
      for (const model of this.researchableModelsAt(tier)) {
        if (!this.researchedModels.includes(model.id)) out.push(model);
      }
    }
    return out;
  }

  // 手选研究项目：算力只往选中的那一台机器上投
  setResearchTarget(modelId: string): boolean {
    const model = MACHINE_MODELS.find((item) => item.id === modelId);
    if (!model || !needsResearch(model.tier)) return false;
    if (!this.universeSatisfied(model)) return false;
    if (this.researchedModels.includes(model.id)) return false;
    this.researchTarget = model.id;
    return true;
  }

  // 当前选中的机型（没选、已经研究完、宇宙不支持时返回 null）。
  // 电压没到也能先研究，所以这里不看 maxTier
  researchTargetModel(): MachineModel | null {
    const id = this.researchTarget;
    if (id === null) return null;
    const model = MACHINE_MODELS.find((item) => item.id === id);
    if (!model || !needsResearch(model.tier)) return null;
    if (this.researchedModels.includes(model.id)) return null;
    if (!this.universeSatisfied(model)) return null;
    return model;
  }

  // 某台机器已经攒下的研究进度
  researchProgressOf(modelId: string): Decimal {
    return this.researchProgress[modelId] ?? ZERO;
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

  // 研究一台机器需要的进度：该等级的总额度按这一级的机型数平摊
  // （所以「把一级的机器全研究完」的总量还是老样子），再乘永久加成的减免
  researchRequiredFor(model: MachineModel): Decimal {
    // 用这一级全部机型数（不看宇宙要求），免得拿到一个新宇宙就改变了研究价
    const count = Math.max(
      1,
      MACHINE_MODELS.filter((item) => item.tier === model.tier && needsResearch(item.tier)).length,
    );
    return researchRequired(model.tier).div(count).times(this.researchCostFactor());
  }

  // 研究站想吃的算力总量（额定值）。没有研究目标时研究站空转，不打算力
  labComputeDemand(): Decimal {
    if (this.researchTargetModel() === null) return ZERO;
    let total = ZERO;
    for (const model of modelsOf('research')) {
      if (model.computeRole !== 'consume' || model.tier > this.maxTier) continue;
      total = total.plus(labComputeThroughput(model.tier).times(this.workingCountOf(model.id)));
    }
    return total;
  }

  computerEnergyDrain(model: MachineModel): Decimal {
    return computerEnergyEU(model.tier)
      .times(this.energyFactor())
      .times(this.workingCountOf(model.id));
  }

  // ── 奥术宇宙：灵气与源质 ───────────────────────────────────

  // 灵气节点的额定灵气产量（灵气/秒）
  nodeVisRated(): Decimal {
    let total = ZERO;
    for (const model of modelsOf('arcane')) {
      if (model.tier > this.maxTier) continue;
      const count = this.workingCountOf(model.id);
      if (count <= 0) continue;
      total = total.plus(nodeVisPerSecond(model.tier).times(count));
    }
    return total;
  }

  // 灵气节点想吃的源质总量（单位/秒）
  nodeEssentiaDemandRated(): Decimal {
    let nodes = ZERO;
    for (const model of modelsOf('arcane')) {
      if (model.tier > this.maxTier) continue;
      nodes = nodes.plus(this.workingCountOf(model.id));
    }
    return nodeEssentiaDemand(nodes);
  }

  // ── 深渊宇宙：腐蚀与抑制 ───────────────────────────────────

  // 抑制器抵消掉的污染点数
  suppression(): Decimal {
    return suppressionPoints(this.runningTiers('abyss'));
  }

  // 这一拍每台机器因污染坏掉的概率（污染机制关掉时恒为 0）
  corrosionPerSecond(): Decimal {
    if (!this.pollutionEnabled) return ZERO;
    return corrosionPerSecond(this.pollution, this.suppression()).times(this.corrosionFactor());
  }

  // 魔法机器要多少灵气：每台按该等级的「本级 1A」算，超频按档位翻倍。
  // 采矿机只吃 1A 的 1/4（和耗电曲线一致）。坏掉的机器不耗灵气，和耗电一个规矩。
  magicVisDemand(): Decimal {
    let demand = ZERO;
    for (const model of MACHINE_MODELS) {
      if (!model.visPowered || model.tier > this.maxTier) continue;
      const working = this.workingCountOf(model.id);
      if (working <= 0) continue;
      const base =
        model.category === 'miner'
          ? minerEnergyEU(model.tier)
          : visPerMachine(model.tier);
      demand = demand.plus(
        base.times(overclockEnergyMultiplier(this.overclockOf(model.id))).times(working),
      );
    }
    return demand;
  }

  // 存电装置的总容量（EU）
  batteryCapacity(): Decimal {
    let capacity = ZERO;
    for (const model of modelsOf('storage')) {
      const n = this.countOf(model.id);
      if (n > 0) capacity = capacity.plus(batteryCapacityEU(model.tier).times(n));
    }
    return capacity.times(this.totalBonus('batteryCapacity'));
  }

  // ── 机型 → 有效数值 ────────────────────────────────────────
  // 都带上超频与故障：坏掉的台数不产不耗，超频按档位提产耗电。
  // 模拟与界面统一走这几个函数，避免两边各算一套。

  minerOutputPerSecond(model: MachineModel): Decimal {
    return minerOrePerSecond(model.tier)
      .times(model.outputFactor)
      .times(overclockSpeedMultiplier(this.overclockOf(model.id)))
      .times(this.minerSpeedBonus())
      .times(this.workingCountOf(model.id));
  }

  minerEnergyDrain(model: MachineModel): Decimal {
    return minerEnergyEU(model.tier)
      .times(overclockEnergyMultiplier(this.overclockOf(model.id)))
      .times(this.energyFactor())
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
    })
      .times(this.energyFactor())
      .times(this.workingCountOf(model.id));
  }

  generatorOutputRated(model: MachineModel): Decimal {
    return outputOf(model)
      .times(this.totalBonus('generatorOutput'))
      .times(this.workingCountOf(model.id));
  }

  generatorFuelDrain(model: MachineModel): Decimal {
    return this.generatorFuelRateOf(model).times(this.workingCountOf(model.id));
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
    return machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier })
      .times(this.energyFactor())
      .times(this.workingCountOf(model.id));
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
    const machinery: { tier: number; count: number; load: Decimal }[] = [];
    for (const category of POLLUTING_CATEGORIES) {
      for (const model of modelsOf(category)) {
        if (model.tier > this.maxTier) continue;
        const count = this.workingCountOf(model.id);
        if (count <= 0) continue;
        machinery.push({
          tier: model.tier,
          count,
          load: this.pollutionLoad.get(model.id) ?? ONE,
        });
      }
    }
    return pollutionPerSecond(machinery).times(
      ONE.minus(effectTotal(this.rebirthNodes, 'pollutionReduction')),
    );
  }

  // 这一拍每台机器实际跑起来的比例：停电、被停机调度、没燃料、没灵气的记 0，
  // 降载的按比例记。界面上的「产生」读数与模拟共用这份数据，看到的和算进去的一致。
  private samplePollutionLoad(input: {
    shed: Set<MachineKind>;
    outage: boolean;
    ratio: Decimal;
    visRatio: Decimal;
    fuelLoad: Map<string, Decimal>;
  }): void {
    this.pollutionLoad = new Map();
    for (const model of MACHINE_MODELS) {
      if (model.tier > this.maxTier) continue;
      // 停电是整厂停摆：接电网的机器这一拍都不算干活。
      // 灵气机器不吃电（见 tick 里的 factorOf），停电照常运转，所以按灵气比例记负载，
      // 否则会出现「一边产出、一边不算污染」的矛盾口径。
      if (input.outage && !model.visPowered) {
        this.pollutionLoad.set(model.id, ZERO);
        continue;
      }
      if (model.category === 'generator') {
        // 发电机不接负载，它烧到多少燃料就干了多少活（魔法发电机吃灵气）
        this.pollutionLoad.set(
          model.id,
          model.visPowered ? input.visRatio : (input.fuelLoad.get(model.id) ?? ONE),
        );
        continue;
      }
      if (input.shed.has(model.category)) {
        this.pollutionLoad.set(model.id, ZERO);
        continue;
      }
      this.pollutionLoad.set(model.id, model.visPowered ? input.visRatio : input.ratio);
    }
  }

  // 每秒净化掉的污染（百分点/秒）。
  // 和污染产生共用同一份负载采样（见 samplePollutionLoad）：停电、被停机调度、
  // 缺电降载时净化器跟着停或降，不再出现「停电反而把污染压下去」。
  // 采样发生在每一拍的污染结算之前，所以灵气/源质那一块读到的是上一拍的负载，
  // 和界面上「上一拍实际」的口径一致。
  purifyPerSecond(): Decimal {
    return purifyPerSecond(
      modelsOf('purifier')
        .filter((model) => model.tier <= this.maxTier)
        .map((model) => ({
          tier: model.tier,
          count: this.workingCountOf(model.id),
          load: this.pollutionLoad.get(model.id) ?? ONE,
        })),
    ).times(this.totalBonus('purifyBoost'));
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

  // 在给定电压等级上能造的机型。
  // 平行宇宙被收回后，专属机型（魔法机器 / 灵气节点 / 腐蚀抑制器）整个类别失效：
  // 模拟里不干活，这里的读数口径也要跟着排除，否则界面会把停摆的机器算进产量与耗电。
  modelsAt(category: MachineCategory, tier: number): MachineModel[] {
    return modelsOf(category).filter(
      (model) => model.tier === tier && this.universeSatisfied(model),
    );
  }

  // 已解锁区间内的全部机型（按电压等级、再按目录顺序）
  unlockedModels(category: MachineCategory): MachineModel[] {
    return modelsOf(category).filter(
      (model) => model.tier <= this.maxTier && this.universeSatisfied(model),
    );
  }

  // ── 玩家操作 ───────────────────────────────────────────────

  manualMine(): void {
    // 手动挖矿就是「手动版采矿机」：作用在当前能挖到的那座矿脉上，
    // 产量按矿脉规则均分给它能产的全部矿种（见计划书第四章）。
    const total = this.pickaxeOutput();
    const veinTier = this.pickaxeVeinTier();
    const kinds = veinTier + 1;
    const share = total.div(kinds);
    for (let oreTier = 0; oreTier <= veinTier; oreTier += 1) {
      this.ores[oreTier] = this.ores[oreTier]!.plus(share);
    }
    this.totalOre = this.totalOre.plus(total);
    this.manualMines += 1;
  }

  // ── 镐子（手动开采） ───────────────────────────────────────
  // 三条线的升级机会都由电压等级发放，用掉就永久生效，不花币。

  pickaxeChances(): Record<PickaxeLine, number> {
    return {
      vajra: vajraChances(this.maxTier),
      collect: collectChances(this.maxTier),
      blast: blastChances(this.maxTier),
    };
  }

  pickaxeLevel(line: PickaxeLine): number {
    if (line === 'vajra') return this.pickaxeVajra;
    if (line === 'collect') return this.pickaxeCollect;
    return this.pickaxeBlast;
  }

  // 该条线的天花板：金刚杵挖到 T13 就封顶，再往上没有更高级的矿脉
  pickaxeCap(line: PickaxeLine): number {
    const chances = this.pickaxeChances();
    if (line === 'vajra') return Math.min(chances.vajra, vajraMaxLevel());
    return chances[line];
  }

  // 升级要同时满足两件事：机会还有剩（电压发放的上限），且买得起这次的币价。
  canUpgradePickaxe(line: PickaxeLine): boolean {
    if (this.pickaxeLevel(line) >= this.pickaxeCap(line)) return false;
    return this.canAffordPickaxe(line);
  }

  // 这次升级的价格（币种见 pickaxeUpgradeCoinTierOf）
  pickaxeUpgradeCostOf(line: PickaxeLine): Decimal {
    return pickaxeUpgradeCost(
      line,
      this.pickaxeLevel(line),
      (tier) => machineCost({ baseCost: C.BASE_MACHINE_COST, tier, purchased: 0 }),
    );
  }

  // 这次升级花哪一级的币（界面显示币种用）
  pickaxeUpgradeCoinTierOf(line: PickaxeLine): number {
    return pickaxeUpgradeCoinTier(line, this.pickaxeLevel(line));
  }

  // 界面用的买得起判断（不含机会上限）：机会不够时也照实显示钱够不够
  canAffordPickaxeOf(line: PickaxeLine): boolean {
    return this.canAffordPickaxe(line);
  }

  // 买得起吗。币种是「第 n 级币」，但 industry 宇宙下可以跨电压结算，
  // 照 canAfford 的写法：所有不高于结算等级的币按价值折算后与所需价值比较。
  private canAffordPickaxe(line: PickaxeLine): boolean {
    const price = this.pickaxeUpgradeCostOf(line);
    const payTier = this.pickaxeUpgradeCoinTierOf(line);
    if (this.hasUniverse('industry')) {
      let available = ZERO;
      for (let tier = 1; tier <= payTier; tier += 1) {
        available = available.plus(this.coins[tier - 1]!.times(coinValueInTier1(tier)));
      }
      return available.gte(price.times(coinValueInTier1(payTier)));
    }
    return this.coins[payTier - 1]!.gte(price);
  }

  upgradePickaxe(line: PickaxeLine): boolean {
    if (!this.canUpgradePickaxe(line)) return false;
    // 先扣币再 +1：扣不动就直接不升，不能出现「币没花、等级涨了」
    const price = this.pickaxeUpgradeCostOf(line);
    const payTier = this.pickaxeUpgradeCoinTierOf(line);
    if (this.hasUniverse('industry')) {
      if (!this.payAcrossTiers(price, payTier)) return false;
    } else {
      this.coins[payTier - 1] = this.coins[payTier - 1]!.minus(price);
    }
    if (line === 'vajra') this.pickaxeVajra += 1;
    else if (line === 'collect') this.pickaxeCollect += 1;
    else this.pickaxeBlast += 1;
    return true;
  }

  // 一次点击的产出总量（枚）
  pickaxeOutput(): Decimal {
    return pickaxeOutputPerClick({
      tier: this.maxTier,
      blastUsed: this.pickaxeBlast,
      collectLevel: this.pickaxeCollect,
    });
  }

  // 手动挖矿挖的是哪座矿脉：已解锁的最高一级，但不能超过金刚杵的等级
  pickaxeVeinTier(): number {
    const best = this.unlockedVeins.length ? Math.max(...this.unlockedVeins) : 0;
    return Math.min(best, this.pickaxeVajra);
  }

  // 这条线的图标用哪一档电压色：按它自己升了多少次取（见 numeric/pickaxe.ts）
  pickaxeLineIconTier(line: PickaxeLine): number {
    return pickaxeIconTier(line, this.pickaxeLevel(line));
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

  // 出售一台能退多少：按当前单价的固定比例退，退的是该机型的结算等级资源（和买的时候一致）
  refundOf(model: MachineModel, payWith: PayWith = 'coin'): Decimal {
    return this.priceOf(model, payWith).times(SELL_REFUND_RATE).floor();
  }

  // 出售机器。卖出去之后「已购数量」减少，重新买回来的价钱也跟着回落。
  sell(model: MachineModel, count: number, payWith: PayWith = 'coin'): number {
    const index = payWith === 'ore' ? model.tier - 1 : paymentTier(model.tier) - 1;
    let sold = 0;
    for (let i = 0; i < count; i += 1) {
      const have = this.countOf(model.id);
      if (have <= 0) break;
      this.counts[model.id] = have - 1;
      // 退款按「卖出后的台数」定价：卖掉的那一台本来就是按这一档买进来的，
      // 这样买 N 台再全卖回去，拿回的钱正好是买价的一半（用卖出前的台数会多退一档）
      const refund = this.refundOf(model, payWith);
      // 坏掉的台数不能比剩下的台数还多
      const faulty = this.faults[model.id];
      if (faulty !== undefined && faulty > have - 1) this.faults[model.id] = have - 1;
      // 卖光了就不留停机记录，免得以后重新买回来还是停着的
      if (have - 1 === 0) delete this.stopped[model.id];
      if (payWith === 'ore') this.ores[index] = this.ores[index]!.plus(refund);
      else this.coins[index] = this.coins[index]!.plus(refund);
      sold += 1;
    }
    return sold;
  }

  orePriceOf(model: MachineModel): Decimal {
    return this.coinPriceOf(model).div(C.COINS_PER_ORE).ceil();
  }

  priceOf(model: MachineModel, payWith: PayWith = 'coin'): Decimal {
    return payWith === 'ore' ? this.orePriceOf(model) : this.coinPriceOf(model);
  }

  canAfford(model: MachineModel, payWith: PayWith = 'coin'): boolean {
    if (!this.isModelUnlocked(model)) return false;
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
    if (!this.isModelUnlocked(model)) return 0;
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
      (model) =>
        model.tier <= this.maxTier &&
        this.countOf(model.id) > 0 &&
        this.universeSatisfied(model),
    );

    // 1) 耗电需求。坏掉的机器不耗电，超频的机器按档位吃电。
    // 耗电按类别分开记：硅基宇宙的停机调度要按类别整组停
    const demandByKind = new Map<MachineKind, Decimal>();
    for (const model of active) {
      // 发电机不耗电（出力在下面单独算），魔法机器要的是灵气
      if (model.category !== 'generator' && !model.visPowered) {
        let drain = ZERO;
        if (model.category === 'miner') drain = this.minerEnergyDrain(model);
        else if (model.category === 'machine') drain = this.machineEnergyDrain(model);
        else if (model.category === 'purifier') drain = this.purifierEnergyDrain(model);
        // 研究站不直接耗电，它吃的是计算机产出的算力
        else if (model.category === 'research' && model.computeRole === 'produce') {
          drain = this.computerEnergyDrain(model);
        } else if (model.category === 'abyss') drain = this.purifierEnergyDrain(model);
        if (drain.gt(0)) {
          demandByKind.set(
            model.category,
            (demandByKind.get(model.category) ?? ZERO).plus(drain),
          );
        }
      }
    }
    // 电网模式直接改耗电：稳定 +20%、波动 -30%、黑市 -50%（「全厂耗电」已在各 drain 里打折）
    const gridMul = gridEnergyMultiplier(this.grid);
    for (const [kind, value] of demandByKind) demandByKind.set(kind, value.times(gridMul));
    let demand = ZERO;
    for (const value of demandByKind.values()) demand = demand.plus(value);
    const step = dec(String(dtSeconds));

    // 2) 电网事件：普通/波动电网都可能断电，断电期间接电网的机器全停（不产也不耗）。
    //    放在发电之前算，因为发电机也要按「这一拍到底要不要干活」决定烧不烧矿。
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

    // 3) 燃料发电机这一拍最多能拿出多少功率：只看燃料够不够，
    //    真正烧多少留到需求算清楚之后再定（见第 6 步的按需发电）。
    let fuelCapacity = ZERO;
    for (const model of active) {
      if (model.category !== 'generator' || model.visPowered) continue;
      const want = this.generatorFuelDrain(model).times(step);
      const available = this.ores[model.tier - 1]!; // 本级发电机烧本级矿石
      const ratio = want.gt(0) ? Decimal.min(ONE, available.div(want)) : ONE;
      fuelCapacity = fuelCapacity.plus(this.generatorOutputRated(model).times(ratio));
    }

    // 4) 供电结算。
    //    电力侧：富余电力存进电池，不够先放存量，放完才降载。
    //    奥术宇宙多一条灵气侧：节点产灵气，只有魔法机器吃灵气（它们不接电网）。
    const arcane = this.hasUniverse('arcane');
    const abyss = this.hasUniverse('abyss');
    // 魔法机器拿到的灵气比例，以及它带来的产量加成（0 = 没喂上，1 = 喂满）
    let visRatio = ONE;
    let plenty = ZERO;
    // 「奥术·充裕上限」：把灵气加成的上限抬高几个百分点（见 arcaneOutputBonus）
    const arcaneBonusUp = effectTotal(this.rebirthNodes, 'arcaneBonusUp');
    // 魔法发电机这一拍的可用出力（EU/t）：不烧矿，直接按拿到的灵气算
    let magicCapacity = ZERO;

    if (arcane) {
      const essentiaProduced = essentiaFromPurify(this.purifyPerSecond()).times(step);
      const essentiaNeed = this.nodeEssentiaDemandRated().times(step);
      const essentiaUsed = Decimal.min(essentiaNeed, this.essentia.plus(essentiaProduced));
      this.essentia = this.essentia.plus(essentiaProduced).minus(essentiaUsed);
      report.essentiaProduced = essentiaProduced;
      report.essentiaUsed = essentiaUsed;

      const factor = nodeOutputFactor(essentiaUsed, essentiaNeed);
      const vis = this.nodeVisRated().times(factor);
      const visNeed = this.magicVisDemand();
      report.visProduced = vis;
      report.visUsed = Decimal.min(vis, visNeed);
      visRatio = visNeed.lte(0) ? ONE : Decimal.min(ONE, vis.div(visNeed));
      // 没有魔法机器就没有加成：奥术宇宙的收益得靠魔法机器自己挣
      plenty = visNeed.gt(0) ? visRatio : ZERO;
      report.arcanePlenty = plenty;

      // 魔法发电机：不烧矿，直接按拿到的灵气出力
      for (const model of active) {
        if (model.category !== 'generator' || !model.visPowered) continue;
        magicCapacity = magicCapacity.plus(
          this.generatorOutputRated(model)
            .times(visRatio)
            .times(arcaneOutputBonus(plenty, true, arcaneBonusUp)),
        );
      }
    }

    // 5) 硅基宇宙的停机调度：电力不够时按类别整组停，而不是全厂等比降载。
    //     保住优先级高的那几类满速跑，被停的那几类这一拍不产也不耗。
    //     判断依据是「这一拍拿得出的出力」（燃料 + 灵气），不是按需发电之后的实际出力。
    const silicon = this.hasUniverse('silicon');
    const supplyCapacity = fuelCapacity.plus(magicCapacity);
    let shed = new Set<MachineKind>();
    const rawDemand = demand;
    const rawRatio = rawDemand.lte(0)
      ? 1
      : Decimal.min(ONE, supplyCapacity.div(rawDemand)).toNumber();
    if (silicon && this.siliconShedding && !report.outage && demand.gt(supplyCapacity)) {
      shed = this.shedKinds(demandByKind, supplyCapacity);
      if (shed.size > 0) {
        demand = ZERO;
        for (const [kind, value] of demandByKind) {
          if (!shed.has(kind)) demand = demand.plus(value);
        }
        report.sheddedKinds = [...shed];
      }
    }
    const effectiveDemand = report.outage ? ZERO : demand;

    // 6) 按需发电：只发「需求 + 电池还能吃下的量」，富余出力不空烧矿石。
    //    停电那一拍接电网的部分全停，所以充电余量按 0 算；灵气侧不接电网，
    //    照常出力（魔法机器在停电时也照常运转，见 samplePollutionLoad）。
    const batteryRoom = Decimal.max(ZERO, this.batteryCapacity().minus(this.storedEU));
    const chargeHeadroom = report.outage ? ZERO : batteryRoom.div(step);
    const supplyTarget = report.outage
      ? magicCapacity
      : Decimal.min(supplyCapacity, effectiveDemand.plus(chargeHeadroom));
    // 灵气发电机先顶住缺口，燃料发电机只补剩下的部分
    const magicUsed = Decimal.min(magicCapacity, supplyTarget);
    const fuelTarget = supplyTarget.minus(magicUsed);
    const fuelThrottle = fuelCapacity.gt(0)
      ? Decimal.min(ONE, fuelTarget.div(fuelCapacity))
      : ZERO;

    // 每台发电机这一拍实际出了多少力（0-1）：按需降载与燃料不够都记在这里，污染按它算。
    // 额度是"分享"出去的，不在这里累加总出力 —— 逐台乘除会在第 40 位留舍入误差，
    // 让供电率莫名其妙掉到 1 以下（界面就会误报"电力不足"）。
    const fuelLoad = new Map<string, Decimal>();
    for (const model of active) {
      if (model.category !== 'generator' || model.visPowered) continue;
      const want = this.generatorFuelDrain(model).times(step).times(fuelThrottle);
      const oreTier = model.tier - 1;
      const available = this.ores[oreTier]!;
      const burned = Decimal.min(want, available);
      if (burned.gt(0)) {
        this.ores[oreTier] = available.minus(burned);
        report.oreSpent[oreTier] = report.oreSpent[oreTier]!.plus(burned);
        this.totalOreSpent = this.totalOreSpent.plus(burned);
      }
      const runRatio = want.gt(0) ? fuelThrottle.times(burned.div(want)) : ZERO;
      fuelLoad.set(model.id, runRatio);
    }
    // 燃料侧的实际出力就等于按需分配的额度：fuelTarget ≤ fuelCapacity 时一定拿得出来
    const generated = magicUsed.plus(fuelTarget);

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
    // 「降载缓冲」：产出侧的缺电缺口减半。停电（整厂停摆）与供电率读数都保持原样
    const outputRatio =
      !report.outage && this.hasRebirthEffect('softLoading')
        ? ONE.minus(ONE.minus(ratioDec).times('0.5'))
        : ratioDec;

    // 污染：边污染边被净化器压，产出按污染档位打折
    this.samplePollutionLoad({ shed, outage: report.outage, ratio: outputRatio, visRatio, fuelLoad });
    const pollutionDelta = this.pollutionDeltaPerSecond();
    if (this.pollutionEnabled) {
      this.pollution = clampPollution(this.pollution.plus(pollutionDelta.times(dtSeconds)));
    }
    const pollutionMul = this.outputMultiplier();
    report.pollutionDelta = pollutionDelta;
    // 奥术宇宙里污染不是惩罚而是「燃料」：污染越高灵气机器功率越高，
    // 所以这一档直接换成灵气倍率（正常宇宙才走 -20% / -40% 那套）
    // 污染机制被关掉时这条也不生效（和普通宇宙的惩罚一个道理）
    // 深渊宇宙里污染是燃料：把产出往上推（替代普通的 -20% / -40% 惩罚）。
    // 奥术宇宙不参与这一条 —— 那边的污染仍然按普通规则惩罚产出。
    const driveMul =
      abyss && this.pollutionEnabled
        ? pollutionDriveFactor(this.pollution, this.pollutionNeutralShift())
        : ONE;
    report.arcanePollutionFactor = driveMul;
    report.outputMultiplier = abyss ? driveMul : pollutionMul;
    this.maxPollution = Decimal.max(this.maxPollution, this.pollution);
    // 一台机器这一拍吃到的总倍率：驱动方式（电 / 灵气）× 污染 × 灵气充裕加成。
    // 奥术宇宙里魔法机器按灵气比例降载，普通机器仍按电力比例降载。
    const pollutionFactor = abyss ? driveMul : pollutionMul;
    const factorOf = (model: MachineModel): Decimal => {
      // 被停机调度停掉的那几类：这一拍不产
      if (shed.has(model.category)) return ZERO;
      const driven = arcane && model.visPowered ? visRatio : outputRatio;
      const bonus = arcane
        ? arcaneOutputBonus(plenty, model.visPowered === true, arcaneBonusUp)
        : ONE;
      return driven.times(pollutionFactor).times(bonus);
    };

    // 4) 采矿机产矿。超频提速，坏了的机器不算数
    //
    // 一台等级 n 的采矿机开采对应等级的矿脉：ULV 采矿机 → T0 矿脉，LV 采矿机 → T1 矿脉。
    // 所以没建 LV 采矿机时，T1 矿石一滴都不会涨。
    // 每座矿脉把产量均分给它能产的全部矿种（T0..T该矿脉等级）。
    const veinRates = new Map<number, Decimal>();
    for (const model of active) {
      if (model.category !== 'miner') continue;
      const rate = this.minerOutputPerSecond(model).times(factorOf(model));
      if (rate.lte(0)) continue;
      const veinTier = model.tier - 1;
      veinRates.set(veinTier, (veinRates.get(veinTier) ?? ZERO).plus(rate));
    }
    for (const [veinTier, ratePerSecond] of veinRates) {
      const total = ratePerSecond.times(dtSeconds);
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
      const produce = this.machineOutputPerSecond(model).times(dtSeconds).times(factorOf(model));
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
    const computeProduced = this.computerComputeRated().times(outputRatio);
    const computeSettlement = settleCompute(computeProduced, this.labComputeDemand());
    report.computeProduced = computeProduced;
    report.computeUsed = computeSettlement.used;
    report.computeWasted = computeSettlement.wasted;
    const researchTarget = this.researchTargetModel();
    if (researchTarget !== null) {
      const gain = researchGain(computeSettlement.used, dtSeconds).times(this.researchSpeedBonus());
      if (gain.gt(0)) {
        report.researchGained = gain;
        const required = this.researchRequiredFor(researchTarget);
        const done = this.researchProgressOf(researchTarget.id).plus(gain);
        if (done.gte(required)) {
          // 项目完成：这台机器解锁，选中的项目清空，等玩家自己挑下一个。
          // 多出来的算力不结转 —— 研究是手动排的，攒够那一刻就该停。
          this.researchedModels.push(researchTarget.id);
          delete this.researchProgress[researchTarget.id];
          this.researchTarget = null;
          report.researchUnlocked = researchTarget.id;
        } else {
          this.researchProgress[researchTarget.id] = done;
        }
      }
    }

    // 6) 超频机器的故障判定：档位越高越容易坏，坏掉的下一拍开始停机。
    //    奥术宇宙的机器由灵气驱动，不会故障 —— 所以那个宇宙可以放心拉满超频。
    if (!arcane) {
      for (const model of active) {
        const level = this.overclockOf(model.id);
        if (level === 0 || !canOverclock(model)) continue;
        const healthy = this.workingCountOf(model.id);
        if (healthy <= 0) continue;
        const broke = Math.min(
          healthy,
          sampleFaults(
            expectedFaults(level, healthy, dtSeconds) * this.faultFactor().toNumber(),
            this.random,
          ),
        );
        if (broke > 0) {
          this.faults[model.id] = this.faultyCountOf(model.id) + broke;
          report.faultsGained += broke;
        }
      }
    }

    // 6b) 深渊宇宙的腐蚀：污染把机器啃坏（抑制器按等级抵消一部分污染点数）。
    //     抑制器自己不算在被啃的名单里。
    if (abyss) {
      const suppression = this.suppression();
      const corrosion = this.corrosionPerSecond();
      report.suppression = suppression;
      report.corrosionPerSecond = corrosion;
      if (corrosion.gt(0)) {
        for (const model of active) {
          // 发电机与净化器也会被啃，所以这里不看能不能超频；抑制器自己不算
          if (model.category === 'abyss') continue;
          const healthy = this.workingCountOf(model.id);
          if (healthy <= 0) continue;
          const expected = corrosion.times(healthy).times(dtSeconds).toNumber();
          const broke = Math.min(healthy, sampleFaults(expected, this.random));
          if (broke > 0) {
            this.faults[model.id] = this.faultyCountOf(model.id) + broke;
            report.faultsGained += broke;
            report.corrosionFaults += broke;
          }
        }
      }
    }

    // 6c) 硅基宇宙：AI 自动维护，故障当拍就修好。
    //     5% 概率这一拍没修（AI 误判），下一拍会补上。
    if (silicon && this.siliconAutoRepair && this.random() >= this.siliconMisjudgeChance()) {
      for (const model of active) {
        const faulty = this.faultyCountOf(model.id);
        if (faulty <= 0) continue;
        this.faults[model.id] = 0;
        this.repairs += faulty;
        report.autoRepairs += faulty;
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
    // 累计发电量按 EU 计：generated 是这一拍的功率（EU/t），乘步长才是电量
    const generatedEU = generated.times(step);
    this.runEU = this.runEU.plus(generatedEU);
    this.totalEU = this.totalEU.plus(generatedEU);

    // 8b) 硅基宇宙：AI 按供电情况自动升降档。
    //     升档要求电力扛得住翻倍，降档只在明显缺电时动手，中间地带不动 —— 免得来回抖。
    if (silicon && this.siliconAutoOverclock && this.random() >= this.siliconMisjudgeChance()) {
      // 用没经过停机调度修正的比值：调度把需求砍下去之后，缺电这件事仍然要反映到档位上
      const ratio = rawRatio;
      for (const model of active) {
        if (!canOverclock(model)) continue;
        const level = this.overclockOf(model.id);
        if (
          // 被停机的机器这一拍不干活，不给它升档
          !shed.has(model.category) &&
          ratio >= 1 &&
          level < MAX_OVERCLOCK_LEVEL &&
          rawDemand.gt(0) &&
          supplyCapacity.gte(rawDemand.times(SILICON_UPGRADE_HEADROOM))
        ) {
          this.setOverclock(model.id, level + 1);
          report.autoOverclockUp += 1;
        } else if (ratio < SILICON_DOWNGRADE_RATIO && level > 0) {
          this.setOverclock(model.id, level - 1);
          report.autoOverclockDown += 1;
        }
      }
    }

    report.euGenerated = generatedEU;
    report.euCapacity = supplyCapacity.times(step);
    report.stepSeconds = dtSeconds;
    report.euConsumed = effectiveDemand.times(dtSeconds).times(ratioDec);
    report.powerRatio = ratioDec.toNumber();
    // 挑战时间线：每拍评估一次激活中的挑战，违规即失效（没有惩罚，不再重新评估）。
    // 放在供电率出炉之后——稳频挑战读的就是它
    if (this.activeChallenge !== null && !this.challengeViolated) {
      const verdict = evaluateChallenge(this.activeChallenge, {
        pollution: this.pollution,
        gridCount: this.grids.length,
        powerRatio: report.powerRatio,
        playSeconds: this.playSeconds,
        maxTier: this.maxTier,
        primed: this.challengePrimed,
      });
      this.challengePrimed = verdict.primed;
      if (verdict.violated) {
        this.challengeViolated = true;
        report.challengeFailed = this.activeChallenge;
      }
    }
    this.lastReport = report;
    this.checkAchievements();
    return report;
  }
}

function emptyReport(): TickReport {
  return {
    euGenerated: ZERO,
    euCapacity: ZERO,
    stepSeconds: 0,
    euConsumed: ZERO,
    powerRatio: 1,
    computeProduced: ZERO,
    computeUsed: ZERO,
    computeWasted: ZERO,
    researchGained: ZERO,
    researchUnlocked: null,
    visProduced: ZERO,
    visUsed: ZERO,
    arcanePlenty: ZERO,
    essentiaProduced: ZERO,
    essentiaUsed: ZERO,
    arcanePollutionFactor: ONE,
    challengeFailed: null,
    corrosionPerSecond: ZERO,
    suppression: ZERO,
    corrosionFaults: 0,
    autoRepairs: 0,
    autoOverclockUp: 0,
    autoOverclockDown: 0,
    sheddedKinds: [],
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
