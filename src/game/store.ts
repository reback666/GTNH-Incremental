import { defineStore } from 'pinia';
import { Decimal, ZERO, dec, decInt } from '../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../numeric/voltage';
import { coinName, oreName } from '../numeric/credit';
import { formatNumber } from '../numeric/format';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelEfficiency, generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { overclockEnergyMultiplier, overclockSpeedMultiplier } from '../numeric/overclock';
import { faultHint } from '../numeric/fault';
import { batteryCapacityEU } from '../numeric/storage';
import {
  COLLAPSE_CHANCE_PER_10_MINUTES,
  MUTATION_CHANCE_PER_MINUTE,
  POLLUTION_HIGH,
  POLLUTION_LOW,
  pollutionBand,
  pollutionBandName,
} from '../numeric/pollution';
import { GRID_MODES, gridMode, type GridMode } from '../numeric/grid';
import { ACHIEVEMENTS } from './achievements';
import { UNIVERSES, universeById } from './universes';
import { essentiaFromPurify } from '../numeric/arcane';
import {
  NODE_ESSENTIA_PER_SECOND,
  nodeEssentiaDemand,
  nodeVisPerSecond,
} from '../numeric/arcane';
import { PURIFY_PER_TIER_PER_SECOND, purifierMachineCoverage } from '../numeric/pollution';
import { pollutionDriveFactor, suppressionOfTier } from '../numeric/abyss';
import { REBIRTH_NODES, REBIRTH_ROOT, treeTotalCost, type RebirthEffectKind } from './rebirth';
import {
  RESEARCH_FROM_TIER,
  RESEARCH_GATE_FROM_TIER,
  computerComputePerSecond,
  computerEnergyEU,
  labComputeThroughput,
  researchRemaining,
  researchRequired,
} from '../numeric/research';
import { type GameCore, type MachineKind, type PayWith } from './core';
import { canOverclock, modelsOf, type BlockKind, type MachineModel } from './models';
import { getCore, resetCore, setCore } from './engine';
import * as C from './constants';
import { clearStorage, loadFromStorage, saveToStorage } from './save';

export interface ResourceRow {
  tier: number;
  name: string;
  amount: string;
  value: string;
  detail: { label: string; value: string }[];
}

export interface PowerDetailRow {
  tier: number;
  voltage: string;
  // 机型 id 与类别，供界面显示机型图标
  modelId: string;
  kind: MachineKind;
  name: string;
  count: number;
  amount: string;
}

export interface PowerStat {
  value: string;
  rows: PowerDetailRow[];
  emptyText: string;
  note?: string;
}

export interface PowerStats {
  stored: PowerStat;
  generated: PowerStat;
  consumed: PowerStat;
  ratio: string;
  ratioShort: boolean;
}

// 设置与风险面板：污染 + 电网
export interface RiskStats {
  pollution: string;
  pollutionRaw: string;
  band: string;
  bandName: string;
  // 污染在这个存档里是「燃料」而不是惩罚（奥术 / 深渊宇宙）
  boosted: boolean;
  enabled: boolean;
  growth: string;
  purify: string;
  net: string;
  netPositive: boolean;
  mutationChance: string;
  collapseChance: string;
  grid: GridMode;
  gridName: string;
  gridSummary: string;
  gridModes: {
    id: GridMode;
    name: string;
    summary: string;
    unlocked: boolean;
    unlockable: boolean;
    // 解锁要求（电压等级）与价格（该等级的 GT 币）
    requirement: string;
    cost: string;
    unit: string;
  }[];
  outage: boolean;
  siphoned: string;
}

export interface MachineModelRow {
  id: string;
  name: string;
  block: BlockKind;
  traits: string[];
  // ZPM 及以后的机型要先研究出来才能建造
  researched: boolean;
  // 是否已解锁（研究 + 所属平行宇宙都满足）；奥术宇宙的灵气节点要拥有奥术宇宙
  unlocked: boolean;
  // 需要哪个平行宇宙才能建造，没有需求时是空串
  needsUniverse: string;
  // 单台的消耗与产出，鼠标移到机器名上时显示
  single: { label: string; value: string }[];
  count: number;
  // 超频档位（0-3）。发电机没有配方，档位恒为 0 且不可调
  overclock: number;
  overclockable: boolean;
  // 故障台数与「平均多久坏一台」的提示
  faulty: number;
  faultHint: string;
  icons: number;
  overflow: number;
  price: string;
  orePrice: string;
  affordable: boolean;
  oreAffordable: boolean;
}

export interface MachineTierGroup {
  tier: number;
  voltage: string;
  oreLabel: string;
  unlocked: boolean;
  unit: string;
  models: MachineModelRow[];
}

export interface MachineColumn {
  kind: MachineKind;
  title: string;
  hint: string;
  count: number;
  tiers: MachineTierGroup[];
  stats: { label: string; value: string }[];
}

export interface ProductionRate {
  orePerSecond: string;
  orePerSecondRaw: string;
  euNet: string;
  euNetRaw: string;
  coinsPerSecond: string;
  fuelPerSecond: string;
}

// 研究：算力（流量）与当前研究目标的进度
export interface ResearchStats {
  // 到 LuV 才解锁研究，之前资源条上不显示这一块
  unlocked: boolean;
  // 每秒产出 / 被研究站吃掉 / 直接浪费的算力
  computeProduced: string;
  computeUsed: string;
  computeWasted: string;
  computers: number;
  labs: number;
  hasTarget: boolean;
  targetTier: number | null;
  targetName: string;
  progress: string;
  required: string;
  percent: number;
  eta: string;
  note: string;
}

// 永久加成树上的一个节点
export interface RebirthNodeRow {
  id: string;
  layer: number;
  x: number;
  y: number;
  name: string;
  effectText: string;
  cost: string;
  requires: string[];
  owned: boolean;
  buyable: boolean;
}

export interface RebirthStats {
  cables: string;
  count: number;
  runEU: string;
  // 打到 MAX 现在能拿几条（还没到 MAX 是 —）
  maxCables: string;
  canRebirth: boolean;
  riftPending: boolean;
  riftClosed: boolean;
  // 已经选好、等下次转生带走的宇宙（没选时空串）
  pendingUniverse: string;
  pendingUniverseName: string;
  // 已经拥有的宇宙名字，界面上做摘要用
  universes: string[];
  root: { name: string; x: number; y: number };
  nodes: RebirthNodeRow[];
  // 已经装上的加成汇总
  bonuses: { label: string; value: string }[];
  treeTotal: string;
  treeOwned: number;
}

// 成就：一行一条
export interface AchievementRow {
  id: string;
  name: string;
  desc: string;
  achieved: boolean;
  // 达成时间（游戏内时长），未达成是空串
  at: string;
}

export interface AchievementStats {
  rows: AchievementRow[];
  done: number;
  total: number;
}

// 平行宇宙：转生时选一个，已拥有的标出来
export interface UniverseRow {
  id: string;
  name: string;
  summary: string;
  effects: string[];
  implemented: boolean;
  owned: boolean;
}

// 奥术宇宙的资源读数：灵气（流量）与源质（存量）
export interface ArcaneStats {
  active: boolean;
  // 每秒产出 / 用掉的灵气
  visProduced: string;
  visUsed: string;
  // 源质存量与每秒净变化
  essentia: string;
  essentiaNet: string;
  essentiaPositive: boolean;
  nodes: number;
  note: string;
}

// 深渊宇宙的读数：腐蚀速率与抑制器抵消的污染点数
export interface AbyssStats {
  active: boolean;
  // 污染对全厂产出的倍率（30% 是中性点）
  pollutionFactor: string;
  pollutionFactorPositive: boolean;
  // 每台机器每分钟的损坏概率
  corrosionPerMinute: string;
  // 抑制器抵消掉的污染点数
  suppression: string;
  // 污染超出中性点、又没被抑制的部分
  effective: string;
  note: string;
}

export interface Snapshot {
  ores: ResourceRow[];
  coins: ResourceRow[];
  columns: MachineColumn[];
  maxTier: number;
  powerGenerated: string;
  powerConsumed: string;
  powerRatio: number;
  powerShort: boolean;
  playTime: string;
  totalOre: string;
  totalCoins: string;
  rate: ProductionRate;
  power: PowerStats;
  risk: RiskStats;
  research: ResearchStats;
  rebirth: RebirthStats;
  achievements: AchievementStats;
  universes: UniverseRow[];
  arcane: ArcaneStats;
  abyss: AbyssStats;
  // 累计统计（存档面板里显示）
  stats: { label: string; value: string }[];
  // 开发者模式开关（设置页）
  devMode: boolean;
  nextTier: number | null;
  unlockCost: string;
  canUnlock: boolean;
  veins: number[];
  // 当前最高等级的矿脉（界面中间那张图），贴图与特效由 veins.ts 按 tier 查
  currentVein: { tier: number; name: string };
}

// 每一级、每个机型最多画这么多个图标，再多就折叠成 +N。
export const TIER_ICON_LIMIT = 24;

// 机器面板的标签顺序。购买、统计、显示都走这一份，避免各写一遍漏类别
const COLUMN_ORDER: MachineKind[] = [
  'miner',
  'generator',
  'arcane',
  'abyss',
  'machine',
  'storage',
  'purifier',
  'research',
];

const COLUMN_META: Record<MachineKind, { title: string; hint: string }> = {
  miner: { title: '采矿机', hint: '放在矿脉上自动产矿，是整条循环的入口。' },
  generator: { title: '发电机', hint: '烧本级矿石发电。同等级有多种机型，效率高的更贵。' },
  machine: { title: '制造机', hint: '吃本级矿石与电力，直接产出本级 GT 币。' },
  storage: {
    title: '存电装置',
    hint: '富余电力存进电池；发电不够时先放存量，存量见底才降载停机。',
  },
  purifier: {
    title: '净化器',
    hint: '压污染。重度污染下产出 -40%，还会随机砸掉机器，靠它把污染拉回安全区。',
  },
  research: {
    title: '研究',
    hint: '计算机把电力换成算力，研究站吃掉算力推进研究进度；进度满才解锁 ZPM 及以后的机型。算力是流量，用不掉就浪费。',
  },
  arcane: {
    title: '灵气节点',
    hint: '只有奥术宇宙才能建造。节点从矿脉抽灵气，灵气是流量、不能囤积；源质（净化器压污染时的副产物）能把节点喂满，没有源质时只出一半。',
  },
  abyss: {
    title: '腐蚀抑制器',
    hint: '只有深渊宇宙才能建造。深渊宇宙里污染会把机器啃坏（随机停机、要手动维护），抑制器按等级抵消一部分污染点数，把损坏速率压回去。',
  },
};

export const useGameStore = defineStore('game', {
  state: () => ({
    snapshot: null as Snapshot | null,
    running: false,
  }),
  getters: {
    snap: (state): Snapshot => state.snapshot ?? buildSnapshot(getCore()),
  },
  actions: {
    boot() {
      const loaded = loadFromStorage();
      if (loaded) setCore(loaded);
      this.refresh();
    },
    refresh() {
      this.snapshot = buildSnapshot(getCore());
    },
    manualMine() {
      getCore().manualMine();
      this.refresh();
    },
    buy(modelId: string, count: number, payWith: PayWith = 'coin'): number {
      const core = getCore();
      const model = findModel(modelId);
      const bought = model ? core.buy(model, count, payWith) : 0;
      this.refresh();
      this.save();
      return bought;
    },
    unlock(): boolean {
      const core = getCore();
      const ok = core.unlock(core.maxTier + 1);
      this.refresh();
      this.save();
      return ok;
    },
    // 超频档位：0-3。档位越高越快、越费电，也越容易坏
    setOverclock(modelId: string, level: number): boolean {
      const ok = getCore().setOverclock(modelId, level);
      this.refresh();
      this.save();
      return ok;
    },
    // 手动维护：把该机型坏掉的机器全部修好
    repair(modelId: string): number {
      const fixed = getCore().repair(modelId);
      this.refresh();
      this.save();
      return fixed;
    },
    // 换电网 / 开关污染机制：都属于设置，改完立刻生效并存档
    setGrid(mode: GridMode): void {
      getCore().setGrid(mode);
      this.refresh();
      this.save();
    },
    // 解锁电网要花对应等级的 GT 币
    unlockGrid(mode: GridMode): boolean {
      const ok = getCore().unlockGrid(mode);
      this.refresh();
      this.save();
      return ok;
    },
    setPollutionEnabled(enabled: boolean): void {
      getCore().setPollutionEnabled(enabled);
      this.refresh();
      this.save();
    },
    // 开发者模式：只是测试用的开关，关着的时候下面这些快捷操作都不生效
    setDevMode(enabled: boolean): void {
      getCore().setDevMode(enabled);
      this.refresh();
      this.save();
    },
    devUnlockTo(tier: number): boolean {
      const ok = getCore().devUnlockTo(tier);
      this.refresh();
      this.save();
      return ok;
    },
    devGrantResources(amount = '1e12'): boolean {
      const ok = getCore().devGrantResources(amount);
      this.refresh();
      this.save();
      return ok;
    },
    devGrantCables(amount: string): boolean {
      const ok = getCore().devGrantCables(amount);
      this.refresh();
      this.save();
      return ok;
    },
    devAdvance(seconds: number): boolean {
      const ok = getCore().devAdvance(seconds);
      this.refresh();
      this.save();
      return ok;
    },
    devClearMachines(): boolean {
      const ok = getCore().devClearMachines();
      this.refresh();
      this.save();
      return ok;
    },
    // 测试用：直接把某个宇宙加进来
    devGrantUniverse(id: string): boolean {
      const ok = getCore().devGrantUniverse(id);
      this.refresh();
      this.save();
      return ok;
    },
    // 测试用：把某个宇宙撤掉
    devRevokeUniverse(id: string): boolean {
      const ok = getCore().devRevokeUniverse(id);
      this.refresh();
      this.save();
      return ok;
    },
    // 记住「下次转生带哪个宇宙」，跟着存档走
    setPendingUniverse(id: string | null): boolean {
      const ok = getCore().setPendingUniverse(id);
      this.refresh();
      this.save();
      return ok;
    },
    // 转生：走时空裂缝（固定 1 条）或打到 MAX（按公式结算）；可以顺带选一个平行宇宙
    rebirth(route: 'rift' | 'max', universe?: string): string | null {
      const gained = getCore().rebirth(route, universe);
      this.refresh();
      this.save();
      return gained === null ? null : formatNumber(gained);
    },
    declineRift(): void {
      getCore().declineRift();
      this.refresh();
      this.save();
    },
    buyRebirthNode(id: string): boolean {
      const ok = getCore().buyRebirthNode(id);
      this.refresh();
      this.save();
      return ok;
    },
    step(dtSeconds: number) {
      getCore().tick(dtSeconds);
      this.refresh();
    },
    save() {
      saveToStorage(getCore());
    },
    reset() {
      clearStorage();
      resetCore();
      this.refresh();
    },
    start() {
      if (this.running) return;
      this.running = true;
      // 计划书第十四章：数值运算 1 Hz，界面刷新 20 Hz。
      setInterval(() => this.step(C.SIM_STEP_MS / 1000), C.SIM_STEP_MS);
      setInterval(() => {
        if (this.snapshot === null) this.refresh();
      }, C.UI_REFRESH_MS);
      setInterval(() => this.save(), 10_000);
      window.addEventListener('beforeunload', () => this.save());
    },
  },
});

function findModel(id: string): MachineModel | undefined {
  return COLUMN_ORDER
    .flatMap((category) => modelsOf(category as MachineKind))
    .find((model) => model.id === id);
}

function buildSnapshot(core: GameCore): Snapshot {
  const report = core.lastReport;
  const nextTier = core.maxTier < MAX_TIER ? core.maxTier + 1 : null;
  const oreRate = oreRates(core);
  const coinRate = coinRates(core);
  const rate = productionOf(core);
  return {
    ores: core.ores.slice(0, core.maxTier).map((amount, index) => ({
      tier: index,
      name: oreName(index),
      amount: formatNumber(amount),
      value: amount.toString(),
      detail: [
        { label: '产出', value: `${formatNumber(oreRate[index]!.gross)}/秒` },
        { label: '消耗', value: `${formatNumber(oreRate[index]!.spent)}/秒` },
        {
          label: '净变化',
          value: `${formatNumber(oreRate[index]!.gross.minus(oreRate[index]!.spent))}/秒`,
        },
      ],
    })),
    coins: core.coins.slice(0, core.maxTier).map((amount, index) => ({
      tier: index + 1,
      name: coinName(index + 1),
      amount: formatNumber(amount),
      value: amount.toString(),
      detail: [{ label: '产出', value: `${formatNumber(coinRate[index]!)}/秒` }],
    })),
    // 两类机器是条件出现的：灵气节点要奥术宇宙，研究类要到 LuV 才解锁
    columns: COLUMN_ORDER.filter(
      (kind) =>
        (kind !== 'arcane' || core.hasUniverse('arcane')) &&
        (kind !== 'abyss' || core.hasUniverse('abyss')) &&
        (kind !== 'research' || core.maxTier >= RESEARCH_FROM_TIER),
    ).map((kind) => machineColumn(core, kind)),
    maxTier: core.maxTier,
    powerGenerated: formatNumber(report.euGenerated),
    powerConsumed: formatNumber(report.euConsumed),
    powerRatio: report.powerRatio,
    powerShort: report.powerRatio < 1,
    playTime: formatDuration(core.playSeconds),
    totalOre: formatNumber(core.totalOre),
    totalCoins: formatNumber(core.totalCoins),
    rate: {
      orePerSecond: formatNumber(rate.oreNet),
      orePerSecondRaw: rate.oreNet.toString(),
      euNet: formatNumber(rate.euNet),
      euNetRaw: rate.euNet.toString(),
      coinsPerSecond: formatNumber(rate.coins),
      fuelPerSecond: formatNumber(rate.fuel),
    },
    power: powerStats(core),
    risk: riskStats(core),
    research: researchStats(core),
    rebirth: rebirthStats(core),
    achievements: achievementStats(core),
    universes: universeRows(core),
    arcane: arcaneStats(core),
    abyss: abyssStats(core),
    stats: statRows(core),
    devMode: core.devMode,
    nextTier,
    unlockCost: nextTier === null ? '—' : formatNumber(core.unlockCostOf(nextTier)),
    canUnlock: nextTier !== null && core.canUnlock(nextTier),
    veins: [...core.unlockedVeins],
    currentVein: currentVein(core),
  };
}

function currentVein(core: GameCore): Snapshot['currentVein'] {
  const oreTier = core.unlockedVeins.length
    ? Math.max(...core.unlockedVeins)
    : 0;
  return { tier: oreTier, name: oreName(oreTier) };
}

// 设置与风险：污染值 + 增长/净化速率 + 电网模式
function riskStats(core: GameCore): RiskStats {
  const growth = core.pollutionPerSecond();
  const purify = core.purifyPerSecond();
  const net = core.pollutionDeltaPerSecond();
  const mode = gridMode(core.grid);
  // 深渊宇宙把污染从惩罚变成燃料，污染条上的说明也要跟着变
  const boosted = core.hasUniverse('abyss');
  const drivePercent = pollutionDriveFactor(core.pollution).minus(1).times(100);
  const driveText = `${drivePercent.gte(0) ? '+' : ''}${formatNumber(drivePercent)}%`;
  const bandName = !core.pollutionEnabled
    ? '污染机制已关闭：不增长，也不产生任何影响'
    : boosted
      ? `${
          core.pollution.gte(70) ? '重度污染' : core.pollution.gte(30) ? '中度污染' : '清洁'
        }：产出 ${driveText}（30% 是中性点）${
          core.pollution.gte(70) ? '，随时可能工厂崩溃' : ''
        }`
      : pollutionBandName(core.pollution);
  return {
    pollution: `${formatNumber(core.pollution, { significantDigits: 4 })}%`,
    pollutionRaw: core.pollution.toString(),
    band: pollutionBand(core.pollution),
    bandName,
    boosted,
    enabled: core.pollutionEnabled,
    growth: `${formatNumber(growth, { significantDigits: 3 })}%/秒`,
    purify: `${formatNumber(purify, { significantDigits: 3 })}%/秒`,
    net: `${net.gte(0) ? '+' : ''}${formatNumber(net, { significantDigits: 3 })}%/秒`,
    netPositive: net.gt(0),
    mutationChance: `${formatNumber(dec(String(MUTATION_CHANCE_PER_MINUTE * 100)))}% / 分钟`,
    collapseChance: `${formatNumber(dec(String(COLLAPSE_CHANCE_PER_10_MINUTES * 100)))}% / 10 分钟`,
    grid: core.grid,
    gridName: mode.name,
    gridSummary: mode.summary,
    gridModes: GRID_MODES.map((item) => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
      unlocked: core.isGridUnlocked(item.id),
      unlockable: core.canUnlockGrid(item.id),
      requirement: `${VOLTAGE_TIERS[item.unlockTier - 1] ?? '?'} 起可解锁`,
      cost: formatNumber(core.gridUnlockCost(item.id)),
      unit: coinName(item.unlockTier),
    })),
    outage: core.outageSeconds > 0,
    siphoned: formatNumber(core.siphoned),
  };
}

function machineColumn(core: GameCore, kind: MachineKind): MachineColumn {
  const meta = COLUMN_META[kind];
  const tiers: MachineTierGroup[] = [];
  for (let tier = 1; tier <= MAX_TIER; tier += 1) {
    const models = core.modelsAt(kind, tier);
    if (models.length === 0) continue;
    const payment = paymentUnit(tier);
    tiers.push({
      tier,
      voltage: VOLTAGE_TIERS[tier - 1] ?? `T${tier}`,
      oreLabel: oreName(tier - 1),
      unlocked: tier <= core.maxTier,
      unit: payment,
      models: models.map((model) => {
        const count = core.countOf(model.id);
        const overclockable = canOverclock(model);
        const level = overclockable ? core.overclockOf(model.id) : 0;
        return {
          id: model.id,
          name: model.name,
          block: model.block,
          traits: model.traits ?? [],
          researched: core.isResearched(model.tier),
          unlocked: core.isModelUnlocked(model),
          needsUniverse:
            model.requiresUniverse === 'arcane' && !core.hasUniverse('arcane') ? '奥术宇宙' : '',
          single: singleStats(model, level),
          count,
          overclock: level,
          overclockable,
          faulty: core.faultyCountOf(model.id),
          faultHint: faultHint(level, core.workingCountOf(model.id)),
          icons: Math.min(count, TIER_ICON_LIMIT),
          overflow: Math.max(0, count - TIER_ICON_LIMIT),
          price: formatNumber(core.coinPriceOf(model)),
          orePrice: formatNumber(core.orePriceOf(model)),
          affordable: tier <= core.maxTier && core.canAfford(model, 'coin'),
          oreAffordable: tier <= core.maxTier && core.canAfford(model, 'ore'),
        };
      }),
    });
  }
  return {
    kind,
    title: meta.title,
    hint: meta.hint,
    count: core.countOfCategory(kind),
    tiers,
    stats: kindStats(core, kind),
  };
}

// 算力（流量）与当前研究目标。
// 上报的是「上一拍」的实际数据，和电能四格同一个口径。
function researchStats(core: GameCore): ResearchStats {
  const report = core.lastReport;
  const target = core.researchTargetTier();
  const required = target === null ? ZERO : researchRequired(target);
  const remaining = researchRemaining(core.researchProgress, required);
  const targetName = target === null ? '' : (VOLTAGE_TIERS[target - 1] ?? `T${target}`);
  const used = report.computeUsed;

  let computers = 0;
  let labs = 0;
  for (const model of core.unlockedModels('research')) {
    const count = core.countOf(model.id);
    if (model.computeRole === 'produce') computers += count;
    else labs += count;
  }

  const percent =
    target !== null && required.gt(0)
      ? Math.min(100, core.researchProgress.div(required).times(100).toNumber())
      : 0;

  let note: string;
  if (target === null && core.maxTier < RESEARCH_GATE_FROM_TIER) {
    note = `还没到 ${VOLTAGE_TIERS[RESEARCH_GATE_FROM_TIER - 1]}：计算机可以先建起来，但研究站现在空转，算力会浪费掉。`;
  } else if (target === null) {
    note = '当前已解锁的机型都研究完了。';
  } else {
    note = `正在研究 ${targetName} 级机型：工程进度 ${formatNumber(core.researchProgress)} / ${formatNumber(required)}。`;
  }

  return {
    unlocked: core.maxTier >= RESEARCH_FROM_TIER,
    computeProduced: `${formatNumber(report.computeProduced)}/秒`,
    computeUsed: `${formatNumber(used)}/秒`,
    computeWasted: `${formatNumber(report.computeWasted)}/秒`,
    computers,
    labs,
    hasTarget: target !== null,
    targetTier: target,
    targetName,
    progress: formatNumber(core.researchProgress),
    required: target === null ? '—' : formatNumber(required),
    percent,
    eta: target !== null && used.gt(0) ? formatDuration(remaining.div(used).toNumber()) : '—',
    note,
  };
}

const EFFECT_LABEL: Record<RebirthEffectKind, string> = {
  allMachineSpeed: '全机器速度',
  minerSpeed: '采矿机速度',
  machineSpeed: '制造机速度',
  coinOutput: 'GT 币产出',
  fuelEfficiency: '燃料效率',
  researchSpeed: '研究速度',
  computeOutput: '算力产出',
  researchCost: '研究需求',
};

function effectText(kind: RebirthEffectKind, amount: string): string {
  const percent = formatNumber(dec(amount).times(100));
  const sign = kind === 'researchCost' ? '-' : '+';
  return `${EFFECT_LABEL[kind]} ${sign}${percent}%`;
}

function rebirthStats(core: GameCore): RebirthStats {
  const maxCables = core.maxRouteCables();
  const owned = core.rebirthNodes;
  return {
    cables: formatNumber(core.cables),
    count: core.rebirthCount,
    runEU: formatNumber(core.runEU),
    maxCables: maxCables === null ? '—' : formatNumber(maxCables),
    canRebirth: core.canRebirth('max'),
    riftPending: core.riftPending(),
    riftClosed: core.riftOffered,
    pendingUniverse: core.pendingUniverse ?? '',
    pendingUniverseName:
      core.pendingUniverse === null
        ? ''
        : (universeById(core.pendingUniverse)?.name ?? core.pendingUniverse),
    universes: core.universes.map((id) => universeById(id)?.name ?? id),
    root: { ...REBIRTH_ROOT },
    nodes: REBIRTH_NODES.map((node) => ({
      id: node.id,
      layer: node.layer,
      x: node.x,
      y: node.y,
      name: node.name,
      effectText: effectText(node.effect, node.amount),
      cost: formatNumber(dec(node.cost)),
      requires: [...node.requires],
      owned: owned.includes(node.id),
      buyable: core.canBuyRebirthNode(node.id),
    })),
    bonuses: (Object.keys(EFFECT_LABEL) as RebirthEffectKind[]).map((kind) => {
      const total = REBIRTH_NODES.filter(
        (node) => node.effect === kind && owned.includes(node.id),
      ).reduce((sum, node) => sum.plus(dec(node.amount)), ZERO);
      return {
        label: EFFECT_LABEL[kind],
        value: `${kind === 'researchCost' ? '-' : '+'}${formatNumber(total.times(100))}%`,
      };
    }),
    treeTotal: formatNumber(treeTotalCost()),
    treeOwned: owned.length,
  };
}

function paymentUnit(tier: number): string {
  const paying = Math.max(1, tier - 1);
  return paying === 1 ? '铜币' : coinName(paying);
}

// 成就清单：只显示达成情况与达成时间，判断逻辑在 src/game/achievements.ts
function achievementStats(core: GameCore): AchievementStats {
  const rows = ACHIEVEMENTS.map((achievement) => {
    const at = core.achieved[achievement.id];
    return {
      id: achievement.id,
      name: achievement.name,
      desc: achievement.desc,
      achieved: at !== undefined,
      at: at === undefined ? '' : formatDuration(at),
    };
  });
  return { rows, done: rows.filter((row) => row.achieved).length, total: rows.length };
}

// 累计统计：跨周目累加的那些数
function statRows(core: GameCore): { label: string; value: string }[] {
  return [
    { label: '已玩时长', value: formatDuration(core.playSeconds) },
    { label: '最高电压', value: VOLTAGE_TIERS[core.peakTier - 1] ?? 'ULV' },
    { label: '累计发电', value: `${formatNumber(core.totalEU)} EU` },
    { label: '累计矿石', value: formatNumber(core.totalOre) },
    { label: '累计产币', value: formatNumber(core.totalCoins) },
    { label: '累计耗矿', value: formatNumber(core.totalOreSpent) },
    { label: '累计建机', value: `${core.builtMachines} 台` },
    { label: '手动挖矿', value: `${core.manualMines} 次` },
    { label: '转生次数', value: `${core.rebirthCount} 次` },
    { label: '累计线缆', value: `${formatNumber(core.totalCables)} 条` },
    {
      label: '成就',
      value: `${core.achievedCount()} / ${ACHIEVEMENTS.length}`,
    },
  ];
}

// 平行宇宙清单：转生页用来选这一个周目要带上的宇宙
function universeRows(core: GameCore): UniverseRow[] {
  return UNIVERSES.map((universe) => ({
    id: universe.id,
    name: universe.name,
    summary: universe.summary,
    effects: [...universe.effects],
    implemented: universe.implemented,
    owned: core.hasUniverse(universe.id),
  }));
}

// 奥术宇宙的灵气 / 源质读数
function arcaneStats(core: GameCore): ArcaneStats {
  const active = core.hasUniverse('arcane');
  const report = core.lastReport;
  const nodes = modelsOf('arcane').reduce((sum, model) => sum + core.countOf(model.id), 0);
  const demand = core.nodeEssentiaDemandRated();
  const produced = core.hasUniverse('arcane')
    ? essentiaFromPurify(core.purifyPerSecond())
    : ZERO;
  const essentiaNet = produced.minus(demand);

  let note: string;
  if (!active) {
    note = '没有奥术宇宙：灵气节点造不了，机器照常吃电。';
  } else if (nodes === 0) {
    note = '还没有灵气节点：机器没灵气可用，全厂停摆。';
  } else if (essentiaNet.gte(0)) {
    note = '源质够用，灵气节点满出力。';
  } else {
    note = '源质不够：灵气节点按比例降出力（最低 50%），多建净化器。';
  }

  return {
    active,
    visProduced: `${formatNumber(report.visProduced)}/秒`,
    visUsed: `${formatNumber(report.visUsed)}/秒`,
    essentia: formatNumber(core.essentia),
    essentiaNet: `${essentiaNet.gte(0) ? '+' : ''}${formatNumber(essentiaNet, { significantDigits: 3 })}/秒`,
    essentiaPositive: essentiaNet.gte(0),
    nodes,
    note,
  };
}

// 单台机器的消耗与产出。发电机看「出力 / 烧矿 / 效率」，
function abyssStats(core: GameCore): AbyssStats {
  const active = core.hasUniverse('abyss');
  const suppression = core.suppression();
  const corrosion = core.corrosionPerSecond();
  const effective = Decimal.max(
    ZERO,
    core.pollution.minus(30).minus(suppression),
  );
  const perMinute = formatNumber(corrosion.times(60).times(100), { significantDigits: 3 });

  let note: string;
  if (!active) {
    note = '没有深渊宇宙：污染只按普通规则惩罚产出，机器不会因此损坏。';
  } else if (core.pollutionEnabled === false) {
    note = '污染机制已关闭：腐蚀也不生效。';
  } else if (effective.lte(0)) {
    note = '污染没超过中性点，或被抑制器完全抵消：机器不会被腐蚀。';
  } else {
    note = `污染超出中性点的部分还有 ${formatNumber(effective, { significantDigits: 3 })} 点没被抵消，机器正在被腐蚀。`;
  }

  return {
    active,
    pollutionFactor: `×${formatNumber(pollutionDriveFactor(core.pollution), { significantDigits: 3 })}`,
    pollutionFactorPositive: pollutionDriveFactor(core.pollution).gte(1),
    corrosionPerMinute: `${perMinute}%/分钟`,
    suppression: formatNumber(suppression, { significantDigits: 3 }),
    effective: formatNumber(effective, { significantDigits: 3 }),
    note,
  };
}

// 单台机器的消耗与产出。发电机看「出力 / 烧矿 / 效率」，
// 采矿机看「产矿 / 耗电」，制造机看「产币 / 耗电 / 吃矿」，存电装置看容量。
// 超频档位不为 0 时，这里给的是超频后的单台数值。
function singleStats(model: MachineModel, level = 0): { label: string; value: string }[] {
  const speed = overclockSpeedMultiplier(level);
  const energy = overclockEnergyMultiplier(level);
  if (model.category === 'research') {
    if (model.computeRole === 'produce') {
      return [
        { label: '产出算力', value: `${formatNumber(computerComputePerSecond(model.tier))}/秒` },
        { label: '耗电', value: `${formatNumber(computerEnergyEU(model.tier))} EU/t` },
      ];
    }
    return [
      { label: '消耗算力', value: `${formatNumber(labComputeThroughput(model.tier))}/秒` },
      { label: '研究速度', value: `${formatNumber(labComputeThroughput(model.tier))} 进度/秒` },
    ];
  }
  if (model.category === 'generator') {
    const efficiency = model.fuelEfficiency ?? generatorFuelEfficiency(model.tier).toString();
    return [
      {
        label: '出力',
        value: `${formatNumber(generatorOutputEU(model.tier, model.outputFactor))} EU/t`,
      },
      { label: '烧矿', value: `${formatNumber(fuelRateOf(model))}/秒` },
      { label: '燃料效率', value: `${formatNumber(dec(efficiency).times(100))}%` },
    ];
  }
  if (model.category === 'miner') {
    return [
      { label: '产矿', value: `${formatNumber(minerOrePerSecond(model.tier).times(speed))}/秒` },
      { label: '耗电', value: `${formatNumber(minerEnergyEU(model.tier).times(energy))} EU/t` },
    ];
  }
  if (model.category === 'storage') {
    return [{ label: '容量', value: `${formatNumber(batteryCapacityEU(model.tier))} EU` }];
  }
  if (model.category === 'purifier') {
    const rate = decInt(model.tier, 'tier').times(PURIFY_PER_TIER_PER_SECOND);
    return [
      { label: '净化', value: `${formatNumber(rate, { significantDigits: 3 })}%/秒` },
      {
        label: '能压住',
        value: `${formatNumber(purifierMachineCoverage())} 台同级机器`,
      },
      { label: '耗电', value: `${formatNumber(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }))} EU/t` },
    ];
  }
  if (model.category === 'arcane') {
    return [
      { label: '产出灵气', value: `${formatNumber(nodeVisPerSecond(model.tier))}/秒` },
      { label: '吃源质', value: `${NODE_ESSENTIA_PER_SECOND}/秒（喂不满时只出一半）` },
    ];
  }
  if (model.category === 'abyss') {
    return [
      { label: '抵消污染', value: `${formatNumber(suppressionOfTier(model.tier))} 点` },
      { label: '耗电', value: `${formatNumber(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }))} EU/t` },
    ];
  }
  const output = machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier: model.tier }).times(
    model.outputFactor,
  );
  return [
    { label: '产币', value: `${formatNumber(output.times(speed))}/秒` },
    {
      label: '耗电',
      value: `${formatNumber(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }).times(energy))} EU/t`,
    },
    { label: '吃矿', value: `${formatNumber(output.times(speed).div(C.COINS_PER_ORE))}/秒` },
  ];
}

// 某一类机器的合计产能。
function kindStats(core: GameCore, kind: MachineKind): { label: string; value: string }[] {
  let ore = ZERO;
  let eu = ZERO;
  let coins = ZERO;
  let fuel = ZERO;
  let vis = ZERO;
  let essentia = ZERO;
  for (const model of core.unlockedModels(kind)) {
    if (core.countOf(model.id) === 0) continue;
    if (kind === 'miner') {
      ore = ore.plus(core.minerOutputPerSecond(model));
      eu = eu.plus(core.minerEnergyDrain(model));
    } else if (kind === 'generator') {
      eu = eu.plus(core.generatorOutputRated(model));
      fuel = fuel.plus(core.generatorFuelDrain(model));
    } else if (kind === 'machine') {
      const output = core.machineOutputPerSecond(model);
      coins = coins.plus(output);
      eu = eu.plus(core.machineEnergyDrain(model));
      ore = ore.plus(output.div(C.COINS_PER_ORE));
    } else if (kind === 'purifier') {
      eu = eu.plus(core.purifierEnergyDrain(model));
    } else if (kind === 'arcane') {
      vis = vis.plus(nodeVisPerSecond(model.tier).times(core.workingCountOf(model.id)));
      essentia = essentia.plus(nodeEssentiaDemand(decInt(core.workingCountOf(model.id), 'count')));
    } else if (kind === 'abyss') {
      eu = eu.plus(core.purifierEnergyDrain(model));
    }
  }
  if (kind === 'miner') {
    return [
      { label: '产矿', value: `${formatNumber(ore)}/秒` },
      { label: '耗电', value: `${formatNumber(eu)} EU/t` },
    ];
  }
  if (kind === 'generator') {
    return [
      { label: '发电', value: `${formatNumber(eu)} EU/t` },
      { label: '烧矿', value: `${formatNumber(fuel)}/秒` },
    ];
  }
  if (kind === 'storage') {
    return [
      { label: '总容量', value: `${formatNumber(core.batteryCapacity())} EU` },
      { label: '当前存电', value: `${formatNumber(core.storedEU)} EU` },
    ];
  }
  if (kind === 'purifier') {
    return [
      {
        label: '净化',
        value: `${formatNumber(core.purifyPerSecond(), { significantDigits: 3 })}%/秒`,
      },
      { label: '耗电', value: `${formatNumber(eu)} EU/t` },
    ];
  }
  if (kind === 'research') {
    const target = core.researchTargetTier();
    const required = target === null ? ZERO : researchRequired(target);
    return [
      { label: '算力产出', value: `${formatNumber(core.computerComputeRated())}/秒` },
      { label: '算力消耗', value: `${formatNumber(core.labComputeDemand())}/秒` },
      {
        label: '研究进度',
        value:
          target === null
            ? '—'
            : `${formatNumber(core.researchProgress)} / ${formatNumber(required)}`,
      },
    ];
  }
  if (kind === 'arcane') {
    return [
      { label: '灵气产出', value: `${formatNumber(vis)}/秒` },
      { label: '源质需求', value: `${formatNumber(essentia, { significantDigits: 3 })}/秒` },
    ];
  }
  if (kind === 'abyss') {
    return [
      { label: '抵消污染', value: `${formatNumber(core.suppression(), { significantDigits: 3 })} 点` },
      { label: '耗电', value: `${formatNumber(eu)} EU/t` },
    ];
  }
  return [
    { label: '产币', value: `${formatNumber(coins)}/秒` },
    { label: '耗电', value: `${formatNumber(eu)} EU/t` },
    { label: '吃矿', value: `${formatNumber(ore)}/秒` },
  ];
}

function fuelRateOf(model: MachineModel): Decimal {
  return generatorFuelRate(model.tier, {
    outputFactor: model.outputFactor,
    efficiency: model.fuelEfficiency ?? generatorFuelEfficiency(model.tier),
  });
}

// 各矿石等级的产出与消耗（枚/秒）。
function oreRates(core: GameCore): { gross: Decimal; spent: Decimal }[] {
  const gross = Array.from({ length: 14 }, () => ZERO) as Decimal[];
  const spent = Array.from({ length: 14 }, () => ZERO) as Decimal[];
  for (const model of core.unlockedModels('miner')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    const share = core.minerOutputPerSecond(model).div(model.tier);
    for (let ore = 0; ore <= model.tier - 1; ore += 1) gross[ore] = gross[ore]!.plus(share);
  }
  for (const model of core.unlockedModels('generator')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    spent[model.tier - 1] = spent[model.tier - 1]!.plus(core.generatorFuelDrain(model));
  }
  for (const model of core.unlockedModels('machine')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    const output = core.machineOutputPerSecond(model);
    spent[model.tier - 1] = spent[model.tier - 1]!.plus(output.div(C.COINS_PER_ORE));
  }
  return gross.map((value, index) => ({ gross: value, spent: spent[index]! }));
}

// 各 GT 币等级的产出（枚/秒）。
function coinRates(core: GameCore): Decimal[] {
  return Array.from({ length: MAX_TIER }, (_, index) => {
    const tier = index + 1;
    let total = ZERO;
    for (const model of core.modelsAt('machine', tier)) {
      if (core.countOf(model.id) === 0) continue;
      total = total.plus(core.machineOutputPerSecond(model));
    }
    return total;
  });
}

// 电能四格：存电量 / 总产电量 / 总耗电量 / 供电率。后三格各带一张按电压等级排序的下拉表。
function powerStats(core: GameCore): PowerStats {
  const generated: PowerDetailRow[] = [];
  const consumed: PowerDetailRow[] = [];
  let rated = ZERO;
  let demand = ZERO;

  const push = (
    list: PowerDetailRow[],
    model: MachineModel,
    count: number,
    amount: Decimal,
    total: Decimal,
  ): Decimal => {
    list.push({
      tier: model.tier,
      voltage: VOLTAGE_TIERS[model.tier - 1] ?? `T${model.tier}`,
      modelId: model.id,
      kind: model.category,
      name: model.name,
      count,
      amount: `${formatNumber(amount)} EU/t`,
    });
    return total.plus(amount);
  };

  for (const model of core.unlockedModels('generator')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    rated = push(generated, model, n, generatorOutputEU(model.tier, model.outputFactor).times(n), rated);
  }
  for (const model of core.unlockedModels('miner')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    demand = push(consumed, model, n, core.minerEnergyDrain(model), demand);
  }
  for (const model of core.unlockedModels('machine')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    demand = push(consumed, model, n, core.machineEnergyDrain(model), demand);
  }
  for (const model of core.unlockedModels('purifier')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    demand = push(consumed, model, n, core.purifierEnergyDrain(model), demand);
  }
  for (const model of core.unlockedModels('research')) {
    if (model.computeRole !== 'produce') continue;
    const n = core.countOf(model.id);
    if (n === 0) continue;
    demand = push(consumed, model, n, core.computerEnergyDrain(model), demand);
  }

  // 存电装置：每台容量 × 台数，合起来是一个池子
  const stored: PowerDetailRow[] = [];
  let capacity = ZERO;
  for (const model of core.unlockedModels('storage')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    capacity = push(stored, model, n, batteryCapacityEU(model.tier).times(n), capacity);
  }
  const settled = core.lastReport;

  const actualPerSecond = core.lastReport.euGenerated.div(C.SIM_STEP_MS / 1000);
  const starved = rated.gt(0) && actualPerSecond.lt(rated);
  const ratio = core.lastReport.powerRatio;
  const storedNote = (): string => {
    if (capacity.lte(0)) return '还没有存电装置：富余电力直接浪费，缺口只能降载';
    if (settled.euCharged.gt(0)) return `上一拍充入 ${formatNumber(settled.euCharged)} EU`;
    if (settled.euDischarged.gt(0)) return `上一拍放出 ${formatNumber(settled.euDischarged)} EU`;
    return '上一拍没有充放电';
  };

  return {
    stored: {
      value: `${formatNumber(core.storedEU)} / ${formatNumber(capacity)} EU`,
      rows: stored,
      emptyText: '还没有存电装置',
      note: storedNote(),
    },
    generated: {
      value: `${formatNumber(rated)} EU/t`,
      rows: generated,
      emptyText: '还没建发电机',
      ...(starved
        ? {
            note: `缺燃料：额定 ${formatNumber(rated)} EU/t，上一步实际只发出 ${formatNumber(actualPerSecond)} EU/t`,
          }
        : {}),
    },
    consumed: {
      // 奥术宇宙里机器吃的是灵气，耗电这一栏不计；明细仍是各机型的额定值，供参考
      value: core.hasUniverse('arcane') ? '0 EU/t' : `${formatNumber(demand)} EU/t`,
      rows: consumed,
      emptyText: '还没建耗电机器',
      ...(core.hasUniverse('arcane')
        ? { note: '奥术宇宙：机器吃灵气不耗电，下面只是各机型的额定耗电；实际供电看灵气一栏' }
        : {}),
    },
    ratio: `${(ratio * 100).toFixed(0)}%`,
    ratioShort: ratio < 1,
  };
}

// 全厂合计速率：矿石净变化、电力净收支、产币、烧矿。
function productionOf(core: GameCore): {
  oreNet: Decimal;
  euNet: Decimal;
  coins: Decimal;
  fuel: Decimal;
} {
  let oreNet = ZERO;
  let euNet = ZERO;
  let coins = ZERO;
  let fuel = ZERO;
  for (const model of core.unlockedModels('miner')) {
    if (core.countOf(model.id) === 0) continue;
    oreNet = oreNet.plus(core.minerOutputPerSecond(model));
    euNet = euNet.minus(core.minerEnergyDrain(model));
  }
  for (const model of core.unlockedModels('generator')) {
    if (core.countOf(model.id) === 0) continue;
    euNet = euNet.plus(core.generatorOutputRated(model));
    fuel = fuel.plus(core.generatorFuelDrain(model));
  }
  for (const model of core.unlockedModels('machine')) {
    if (core.countOf(model.id) === 0) continue;
    const output = core.machineOutputPerSecond(model);
    coins = coins.plus(output);
    euNet = euNet.minus(core.machineEnergyDrain(model));
    oreNet = oreNet.minus(output.div(C.COINS_PER_ORE));
  }
  for (const model of core.unlockedModels('research')) {
    if (model.computeRole !== 'produce' || core.countOf(model.id) === 0) continue;
    euNet = euNet.minus(core.computerEnergyDrain(model));
  }
  return { oreNet, euNet, coins, fuel };
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} 小时 ${m} 分` : m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
