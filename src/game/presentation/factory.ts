import type { MachineColumn, FactoryOverview } from './types';
import { MAX_TIER } from '../../numeric/voltage';
import { type GameCore } from '../core';

export function factoryOverview(core: GameCore, columns: MachineColumn[]): FactoryOverview {
  const report = core.lastReport;
  const facilities = columns.map(column => {
    const owned = column.tiers.flatMap(group => group.models.map(model => ({ ...model, tier: group.tier })))
      .filter(model => model.count > 0);
    const running = owned.reduce((sum, model) => sum + model.running, 0);
    const faulty = owned.reduce((sum, model) => sum + model.faulty, 0);
    const representative = owned.sort((a, b) => b.tier - a.tier)[0];
    const activity = (() => {
      if (!running || !report.stepSeconds) return 0;
      if (column.kind === 'generator') return report.euGenerated.gt(0) ? 1 : 0;
      if (column.kind === 'miner') return report.oreGained.some(value => value.gt(0)) ? (report.powerRatio || 1) : 0;
      if (column.kind === 'machine') return report.coinsGained.some(value => value.gt(0)) ? (report.powerRatio || 1) : 0;
      if (column.kind === 'storage') return report.euCharged.gt(0) || report.euDischarged.gt(0) ? 1 : 0;
      if (column.kind === 'research') return report.computeProduced.gt(0) ? (report.powerRatio || 1) : 0;
      if (column.kind === 'arcane') return report.visProduced.gt(0) ? 1 : 0;
      return report.powerRatio;
    })();
    return { machines: owned.map(model => ({ modelId: model.id, tier: model.tier, count: model.count, running: model.running })), kind: column.kind, name: column.title, count: column.count, running, faulty,
      tier: representative?.tier ?? core.maxTier,
      modelId: representative?.id ?? column.tiers[0]?.models[0]?.id ?? '', activity };
  });
  const capacity = core.batteryCapacity();
  const next = core.maxTier < MAX_TIER ? core.maxTier + 1 : null;
  const progress = next === null ? 1 : Math.min(1,
    core.coins[core.maxTier - 1]!.div(core.unlockCostOf(next)).toNumber());
  return {
    facilities,
    machineCount: facilities.reduce((sum, facility) => sum + facility.count, 0),
    runningCount: facilities.filter(facility => facility.kind !== 'storage')
      .reduce((sum, facility) => sum + (facility.activity > 0 ? facility.running : 0), 0),
    faultyCount: facilities.reduce((sum, facility) => sum + facility.faulty, 0),
    powerRatio: report.powerRatio,
    batteryRatio: capacity.gt(0) ? Math.min(1, core.storedEU.div(capacity).toNumber()) : 0,
    pollution: core.pollution.toNumber(),
    nextTierProgress: Math.max(0, progress),
  };
}
