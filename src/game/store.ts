import { defineStore } from 'pinia';
import { Decimal, ZERO, dec } from '../numeric/decimal';
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
import { GRID_MODES, gridMode, isGridUnlocked, type GridMode } from '../numeric/grid';
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
    unlockLabel: string;
  }[];
  outage: boolean;
  siphoned: string;
}

export interface MachineModelRow {
  id: string;
  name: string;
  block: BlockKind;
  traits: string[];
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
  nextTier: number | null;
  unlockCost: string;
  canUnlock: boolean;
  veins: number[];
  // 当前最高等级的矿脉（界面中间那张图），贴图与特效由 veins.ts 按 tier 查
  currentVein: { tier: number; name: string };
}

// 每一级、每个机型最多画这么多个图标，再多就折叠成 +N。
export const TIER_ICON_LIMIT = 24;

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
    setPollutionEnabled(enabled: boolean): void {
      getCore().setPollutionEnabled(enabled);
      this.refresh();
      this.save();
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
  return ['miner', 'generator', 'machine', 'storage']
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
    columns: (['miner', 'generator', 'machine', 'storage', 'purifier'] as MachineKind[]).map((kind) =>
      machineColumn(core, kind),
    ),
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
  return {
    pollution: `${formatNumber(core.pollution, { significantDigits: 4 })}%`,
    pollutionRaw: core.pollution.toString(),
    band: pollutionBand(core.pollution),
    bandName: core.pollutionEnabled
      ? pollutionBandName(core.pollution)
      : '污染机制已关闭：不增长，也不产生任何影响',
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
      unlocked: isGridUnlocked(item.id, core.maxTier),
      unlockLabel: `${VOLTAGE_TIERS[item.unlockTier - 1] ?? '?'} 解锁`,
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

function paymentUnit(tier: number): string {
  const paying = Math.max(1, tier - 1);
  return paying === 1 ? '铜币' : coinName(paying);
}

// 单台机器的消耗与产出。发电机看「出力 / 烧矿 / 效率」，
// 采矿机看「产矿 / 耗电」，制造机看「产币 / 耗电 / 吃矿」，存电装置看容量。
// 超频档位不为 0 时，这里给的是超频后的单台数值。
function singleStats(model: MachineModel, level = 0): { label: string; value: string }[] {
  const speed = overclockSpeedMultiplier(level);
  const energy = overclockEnergyMultiplier(level);
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
      value: `${formatNumber(demand)} EU/t`,
      rows: consumed,
      emptyText: '还没建耗电机器',
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
  return { oreNet, euNet, coins, fuel };
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} 小时 ${m} 分` : m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
