import { defineStore } from 'pinia';
import { Decimal, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER } from '../numeric/voltage';
import { coinName, oreName } from '../numeric/credit';
import { formatNumber } from '../numeric/format';
import { machineEnergy, machineOutput } from '../numeric/output';
import { generatorFuelRate, generatorOutputEU } from '../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../numeric/miner';
import { type GameCore, type MachineKind, type PayWith } from './core';
import { getCore, resetCore, setCore } from './engine';
import * as C from './constants';
import { clearStorage, loadFromStorage, saveToStorage } from './save';

export interface ResourceRow {
  tier: number;
  name: string;
  amount: string; // 显示用（3 位有效数字 + 后缀）
  value: string; // 原始值，供界面判断涨跌方向
}

export interface MachineTierRow {
  tier: number;
  unlocked: boolean;
  count: number;
  price: string;
  orePrice: string;
  affordable: boolean;
  oreAffordable: boolean;
  unit: string;
}

export interface MachineColumn {
  kind: MachineKind;
  title: string;
  hint: string;
  count: number;
  icons: number; // 要画几个图标
  overflow: number; // 超出上限的台数，用 +N 表示
  tiers: MachineTierRow[];
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
  nextTier: number | null;
  unlockCost: string;
  canUnlock: boolean;
  veins: number[];
}

// 每列最多画这么多个机器图标，再多就折叠成 +N。
// 后期每级几十台，全画会把页面拖垮。
export const ICON_LIMIT = 48;

const COLUMN_META: Record<MachineKind, { title: string; hint: string }> = {
  miner: { title: '采矿机', hint: '放在矿脉上自动产矿，是整条循环的入口。' },
  generator: { title: '发电机', hint: '烧本级矿石发电，供给采矿机与制造机。' },
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
    buy(kind: MachineKind, tier: number, count: number, payWith: PayWith = 'coin'): number {
      const bought = getCore().buy(kind, tier, count, payWith);
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

function buildSnapshot(core: GameCore): Snapshot {
  const report = core.lastReport;
  const nextTier = core.maxTier < MAX_TIER ? core.maxTier + 1 : null;
  const rate = productionOf(core);
  return {
    ores: core.ores.slice(0, core.maxTier).map((amount, index) => ({
      tier: index,
      name: oreName(index),
      amount: formatNumber(amount),
      value: amount.toString(),
    })),
    coins: core.coins.slice(0, core.maxTier).map((amount, index) => ({
      tier: index + 1,
      name: coinName(index + 1),
      amount: formatNumber(amount),
      value: amount.toString(),
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
    nextTier,
    unlockCost: nextTier === null ? '—' : formatNumber(core.unlockCostOf(nextTier)),
    canUnlock: nextTier !== null && core.canUnlock(nextTier),
    veins: [...core.unlockedVeins],
  };
}

function machineColumn(core: GameCore, kind: MachineKind): MachineColumn {
  const meta = COLUMN_META[kind];
  const tiers: MachineTierRow[] = [];
  let count = 0;
  for (let tier = 1; tier <= MAX_TIER; tier += 1) {
    const owned = core.countOf(kind, tier);
    count += owned;
    tiers.push({
      tier,
      unlocked: tier <= core.maxTier,
      count: owned,
      price: formatNumber(core.coinPriceOf(kind, tier)),
      orePrice: formatNumber(core.orePriceOf(kind, tier)),
      affordable: tier <= core.maxTier && core.canAfford(kind, tier, 'coin'),
      oreAffordable: tier <= core.maxTier && core.canAfford(kind, tier, 'ore'),
      unit: tier === 1 ? '铜币' : coinName(tier - 1),
    });
  }
  return {
    kind,
    title: meta.title,
    hint: meta.hint,
    count,
    icons: Math.min(count, ICON_LIMIT),
    overflow: Math.max(0, count - ICON_LIMIT),
    tiers,
    stats: kindStats(core, kind),
  };
}

// 某一类机器的合计产能。
function kindStats(core: GameCore, kind: MachineKind): { label: string; value: string }[] {
  let ore = ZERO;
  let eu = ZERO;
  let coins = ZERO;
  let fuel = ZERO;
  for (let tier = 1; tier <= core.maxTier; tier += 1) {
    const n = core.countOf(kind, tier);
    if (n === 0) continue;
    if (kind === 'miner') {
      ore = ore.plus(minerOrePerSecond(tier).times(n));
      eu = eu.plus(minerEnergyEU(tier).times(n));
    } else if (kind === 'generator') {
      eu = eu.plus(generatorOutputEU(tier).times(n));
      fuel = fuel.plus(generatorFuelRate(tier).times(n));
    } else {
      const output = machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier }).times(n);
      coins = coins.plus(output);
      eu = eu.plus(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier }).times(n));
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
  for (let tier = 1; tier <= core.maxTier; tier += 1) {
    const m = core.countOf('miner', tier);
    const g = core.countOf('generator', tier);
    const k = core.countOf('machine', tier);
    if (m > 0) {
      oreNet = oreNet.plus(minerOrePerSecond(tier).times(m));
      euNet = euNet.minus(minerEnergyEU(tier).times(m));
    }
    if (g > 0) {
      euNet = euNet.plus(generatorOutputEU(tier).times(g));
      fuel = fuel.plus(generatorFuelRate(tier).times(g));
    }
    if (k > 0) {
      const output = machineOutput({ baseOutput: C.BASE_MACHINE_OUTPUT, tier }).times(k);
      coins = coins.plus(output);
      euNet = euNet.minus(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier }).times(k));
      oreNet = oreNet.minus(output.div(C.COINS_PER_ORE));
    }
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

export { dec, Decimal, ZERO };
