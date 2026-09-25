import { defineStore } from 'pinia';
import { Decimal, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../numeric/voltage';
import { coinName, oreName } from '../numeric/credit';
import { formatNumber } from '../numeric/format';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelEfficiency, generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { type GameCore, type MachineKind, type PayWith } from './core';
import { modelsOf, type BlockKind, type MachineModel } from './models';
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

export interface MachineModelRow {
  id: string;
  name: string;
  block: BlockKind;
  traits: string[];
  // 单台的消耗与产出，鼠标移到机器名上时显示
  single: { label: string; value: string }[];
  count: number;
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
  nextTier: number | null;
  unlockCost: string;
  canUnlock: boolean;
  veins: number[];
}

// 每一级、每个机型最多画这么多个图标，再多就折叠成 +N。
export const TIER_ICON_LIMIT = 24;

const COLUMN_META: Record<MachineKind, { title: string; hint: string }> = {
  miner: { title: '采矿机', hint: '放在矿脉上自动产矿，是整条循环的入口。' },
  generator: { title: '发电机', hint: '烧本级矿石发电。同等级有多种机型，效率高的更贵。' },
  machine: { title: '制造机', hint: '吃本级矿石与电力，直接产出本级 GT 币。' },
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
  return ['miner', 'generator', 'machine']
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
    columns: (['miner', 'generator', 'machine'] as MachineKind[]).map((kind) =>
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
    nextTier,
    unlockCost: nextTier === null ? '—' : formatNumber(core.unlockCostOf(nextTier)),
    canUnlock: nextTier !== null && core.canUnlock(nextTier),
    veins: [...core.unlockedVeins],
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
        return {
          id: model.id,
          name: model.name,
          block: model.block,
          traits: model.traits ?? [],
          single: singleStats(model),
          count,
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
// 采矿机看「产矿 / 耗电」，制造机看「产币 / 耗电 / 吃矿」。
function singleStats(model: MachineModel): { label: string; value: string }[] {
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
      { label: '产矿', value: `${formatNumber(minerOrePerSecond(model.tier))}/秒` },
      { label: '耗电', value: `${formatNumber(minerEnergyEU(model.tier))} EU/t` },
    ];
  }
  const output = machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier: model.tier }).times(
    model.outputFactor,
  );
  return [
    { label: '产币', value: `${formatNumber(output)}/秒` },
    {
      label: '耗电',
      value: `${formatNumber(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }))} EU/t`,
    },
    { label: '吃矿', value: `${formatNumber(output.div(C.COINS_PER_ORE))}/秒` },
  ];
}

// 某一类机器的合计产能。
function kindStats(core: GameCore, kind: MachineKind): { label: string; value: string }[] {
  let ore = ZERO;
  let eu = ZERO;
  let coins = ZERO;
  let fuel = ZERO;
  for (const model of core.unlockedModels(kind)) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    if (kind === 'miner') {
      ore = ore.plus(minerOrePerSecond(model.tier).times(n));
      eu = eu.plus(minerEnergyEU(model.tier).times(n));
    } else if (kind === 'generator') {
      eu = eu.plus(generatorOutputEU(model.tier, model.outputFactor).times(n));
      fuel = fuel.plus(fuelRateOf(model).times(n));
    } else {
      const output = machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier: model.tier })
        .times(model.outputFactor)
        .times(n);
      coins = coins.plus(output);
      eu = eu.plus(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }).times(n));
      ore = ore.plus(output.div(C.COINS_PER_ORE));
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
    const share = minerOrePerSecond(model.tier).times(n).div(model.tier);
    for (let ore = 0; ore <= model.tier - 1; ore += 1) gross[ore] = gross[ore]!.plus(share);
  }
  for (const model of core.unlockedModels('generator')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    spent[model.tier - 1] = spent[model.tier - 1]!.plus(fuelRateOf(model).times(n));
  }
  for (const model of core.unlockedModels('machine')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    const output = machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier: model.tier })
      .times(model.outputFactor)
      .times(n);
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
      const n = core.countOf(model.id);
      if (n === 0) continue;
      total = total.plus(
        machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier }).times(model.outputFactor).times(n),
      );
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
    demand = push(consumed, model, n, minerEnergyEU(model.tier).times(n), demand);
  }
  for (const model of core.unlockedModels('machine')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    demand = push(
      consumed,
      model,
      n,
      machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }).times(n),
      demand,
    );
  }

  const actualPerSecond = core.lastReport.euGenerated.div(C.SIM_STEP_MS / 1000);
  const starved = rated.gt(0) && actualPerSecond.lt(rated);
  const ratio = core.lastReport.powerRatio;

  return {
    stored: {
      value: '0 EU',
      rows: [],
      emptyText: '还没有存电装置',
      note: '存电装置属于中期内容，数值层还没实现（计划书第七章）',
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
    const n = core.countOf(model.id);
    if (n === 0) continue;
    oreNet = oreNet.plus(minerOrePerSecond(model.tier).times(n));
    euNet = euNet.minus(minerEnergyEU(model.tier).times(n));
  }
  for (const model of core.unlockedModels('generator')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    euNet = euNet.plus(generatorOutputEU(model.tier, model.outputFactor).times(n));
    fuel = fuel.plus(fuelRateOf(model).times(n));
  }
  for (const model of core.unlockedModels('machine')) {
    const n = core.countOf(model.id);
    if (n === 0) continue;
    const output = machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier: model.tier })
      .times(model.outputFactor)
      .times(n);
    coins = coins.plus(output);
    euNet = euNet.minus(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }).times(n));
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
