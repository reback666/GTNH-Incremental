import { defineStore } from 'pinia';
import { Decimal, ZERO, dec } from '../numeric/decimal';
import { MAX_TIER } from '../numeric/voltage';
import { coinName, oreName } from '../numeric/credit';
import { formatNumber } from '../numeric/format';
import { type GameCore, type MachineKind, type PayWith } from './core';
import { getCore, resetCore, setCore } from './engine';
import * as C from './constants';
import { clearStorage, loadFromStorage, saveToStorage } from './save';

export interface ResourceRow {
  tier: number;
  name: string;
  amount: string;
}

export interface MachineRow {
  tier: number;
  unlocked: boolean;
  count: number;
  price: string;
  orePrice: string;
  affordable: boolean;
  oreAffordable: boolean;
  unit: string;
}

export interface Snapshot {
  ores: ResourceRow[];
  coins: ResourceRow[];
  machines: Record<MachineKind, MachineRow[]>;
  maxTier: number;
  powerGenerated: string;
  powerConsumed: string;
  powerRatio: number;
  powerShort: boolean;
  playTime: string;
  totalOre: string;
  totalCoins: string;
  nextTier: number | null;
  unlockCost: string;
  canUnlock: boolean;
  veins: number[];
}

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
  return {
    ores: core.ores.slice(0, core.maxTier).map((amount, index) => ({
      tier: index,
      name: oreName(index),
      amount: formatNumber(amount),
    })),
    coins: core.coins.slice(0, core.maxTier).map((amount, index) => ({
      tier: index + 1,
      name: coinName(index + 1),
      amount: formatNumber(amount),
    })),
    machines: {
      miner: machineRows(core, 'miner'),
      generator: machineRows(core, 'generator'),
      machine: machineRows(core, 'machine'),
    },
    maxTier: core.maxTier,
    powerGenerated: formatNumber(report.euGenerated),
    powerConsumed: formatNumber(report.euConsumed),
    powerRatio: report.powerRatio,
    powerShort: report.powerRatio < 1,
    playTime: formatDuration(core.playSeconds),
    totalOre: formatNumber(core.totalOre),
    totalCoins: formatNumber(core.totalCoins),
    nextTier,
    unlockCost: nextTier === null ? '—' : formatNumber(core.unlockCostOf(nextTier)),
    canUnlock: nextTier !== null && core.canUnlock(nextTier),
    veins: [...core.unlockedVeins],
  };
}

function machineRows(core: GameCore, kind: MachineKind): MachineRow[] {
  const rows: MachineRow[] = [];
  for (let tier = 1; tier <= MAX_TIER; tier += 1) {
    rows.push({
      tier,
      unlocked: tier <= core.maxTier,
      count: core.countOf(kind, tier),
      price: formatNumber(core.coinPriceOf(kind, tier)),
      orePrice: formatNumber(core.orePriceOf(kind, tier)),
      affordable: tier <= core.maxTier && core.canAfford(kind, tier, 'coin'),
      oreAffordable: tier <= core.maxTier && core.canAfford(kind, tier, 'ore'),
      unit: tier === 1 ? '铜币' : coinName(tier - 1),
    });
  }
  return rows;
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} 小时 ${m} 分` : m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

export { dec, Decimal, ZERO };
