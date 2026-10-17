import type { PowerDetailRow, PowerStats, RiskStats } from './types';
import { Decimal, ZERO, dec } from '../../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../../numeric/voltage';
import { coinName } from '../../numeric/credit';
import { formatNumber } from '../../numeric/format';
import { generatorFuelEfficiency, generatorFuelRate } from '../../numeric/generator';
import { batteryCapacityEU } from '../../numeric/storage';
import { COLLAPSE_CHANCE_PER_10_MINUTES, MUTATION_CHANCE_PER_MINUTE, pollutionBand, pollutionBandName } from '../../numeric/pollution';
import { GRID_MODES, gridEnergyMultiplier, gridMode } from '../../numeric/grid';
import { pollutionDriveFactor } from '../../numeric/abyss';
import { type GameCore, type MachineKind } from '../core';
import { type MachineModel } from '../models';
import * as C from '../constants';

export function riskStats(core: GameCore): RiskStats {
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

// ── 各类机器吃到的增益 / 减益 ─────────────────────────────────
// 悬停机器面板的标签时显示：是什么在影响这一类机器、影响多少、谁给的。
// 数值统一写成相对变化（×1.12 → +12%），这样正负一眼能对比。


export function paymentUnit(tier: number): string {
  const paying = Math.max(1, tier - 1);
  return paying === 1 ? '铜币' : coinName(paying);
}

// 成就清单：只显示达成情况与达成时间，判断逻辑在 src/game/achievements.ts
export function fuelRateOf(model: MachineModel): Decimal {
  return generatorFuelRate(model.tier, {
    outputFactor: model.outputFactor,
    efficiency: model.fuelEfficiency ?? generatorFuelEfficiency(model.tier),
  });
}

// 各矿石等级的产出与消耗（枚/秒）。
// 口径和电能格一致：报「上一拍实际」，缺电降载、污染惩罚、灵气不足、停机都算在里面。
// 还没跑过第一拍（刚开局、刚读档）时才回退到额定值，免得读数先闪一下 0。
export function oreRates(core: GameCore): { gross: Decimal; spent: Decimal }[] {
  const step = dec(String(core.lastReport.stepSeconds));
  if (step.gt(0)) {
    return core.lastReport.oreGained.map((gained, index) => ({
      gross: gained.div(step),
      spent: core.lastReport.oreSpent[index]!.div(step),
    }));
  }
  return ratedOreRates(core);
}

export function ratedOreRates(core: GameCore): { gross: Decimal; spent: Decimal }[] {
  const gross = Array.from({ length: MAX_TIER }, () => ZERO) as Decimal[];
  const spent = Array.from({ length: MAX_TIER }, () => ZERO) as Decimal[];
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
// 同样报上一拍实际：变异奖励那一笔也算「产出」，和玩家看到的入库数字对得上。
export function coinRates(core: GameCore): Decimal[] {
  const step = dec(String(core.lastReport.stepSeconds));
  if (step.gt(0)) return core.lastReport.coinsGained.map((gained) => gained.div(step));
  return ratedCoinRates(core);
}

export function ratedCoinRates(core: GameCore): Decimal[] {
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
export function powerStats(core: GameCore): PowerStats {
  const generated: PowerDetailRow[] = [];
  const consumed: PowerDetailRow[] = [];
  let rated = ZERO;
  let demand = ZERO;
  // 电网模式的耗电倍率作用在耗电机器上：明细与合计都按折后值显示
  const gridMul = gridEnergyMultiplier(core.grid);
  // 与模拟同口径：只算真正在耗电的机器。上一拍被 AI 停机调度的类别、
  // 被手动停机的机型、出故障的台数都剔除（工作台数 workingCountOf 已含后两者）
  const settledNow = core.lastReport;
  const shedKinds = new Set<MachineKind>(settledNow.sheddedKinds as MachineKind[]);

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
    rated = push(generated, model, n, core.generatorOutputRated(model), rated);
  }
  // 耗电机器逐类收集：amount 按「真正在跑的台数」计，被停的台数写进 running/stopped。
  // 整类被 AI 停机时 running 为 0，这一行不进合计，但行还留着——界面能看到机器去哪了
  const pushDemand = (
    model: MachineModel,
    drainPerWorking: Decimal,
  ): void => {
    const total = core.countOf(model.id);
    if (total === 0) return;
    const running = shedKinds.has(model.category) ? 0 : core.workingCountOf(model.id);
    const amount = running === 0 ? ZERO : drainPerWorking.times(gridMul);
    consumed.push({
      tier: model.tier,
      voltage: VOLTAGE_TIERS[model.tier - 1] ?? `T${model.tier}`,
      modelId: model.id,
      kind: model.category,
      name: model.name,
      count: total,
      amount: `${formatNumber(amount)} EU/t`,
      running,
      stopped: total - running,
    });
    demand = demand.plus(amount);
  };
  for (const model of core.unlockedModels('miner')) {
    // 魔法机器吃灵气、不接电网，和模拟里的耗电结算保持一致
    if (model.visPowered) continue;
    pushDemand(model, core.minerEnergyDrain(model));
  }
  for (const model of core.unlockedModels('machine')) {
    if (model.visPowered) continue;
    pushDemand(model, core.machineEnergyDrain(model));
  }
  for (const model of core.unlockedModels('purifier')) {
    if (model.visPowered) continue;
    pushDemand(model, core.purifierEnergyDrain(model));
  }
  for (const model of core.unlockedModels('research')) {
    if (model.visPowered) continue;
    if (model.computeRole !== 'produce') continue;
    pushDemand(model, core.computerEnergyDrain(model));
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

  const stepSeconds = dec(String(settled.stepSeconds));
  const hasTick = stepSeconds.gt(0);
  const actualPerSecond = hasTick ? settled.euGenerated.div(stepSeconds) : ZERO;
  const capacityPerSecond = hasTick ? settled.euCapacity.div(stepSeconds) : ZERO;
  // 拿不出额定出力 = 缺燃料；拿得出却发得少 = 按需发电（需求就只有这么多）
  const fuelShort = hasTick && rated.gt(0) && capacityPerSecond.lt(rated);
  const throttled = !fuelShort && capacityPerSecond.gt(0) && actualPerSecond.lt(capacityPerSecond);
  const ratio = settled.powerRatio;
  const generatedNote = fuelShort
    ? `缺燃料：额定 ${formatNumber(rated)} EU/t，燃料只够发 ${formatNumber(capacityPerSecond)} EU/t`
    : throttled
      ? `按需发电：额定 ${formatNumber(rated)} EU/t，这一拍按需求只开了 ${formatNumber(actualPerSecond)} EU/t`
      : '';
  const storedNote = (): string => {
    if (capacity.lte(0)) return '';
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
      value: `${formatNumber(actualPerSecond)} EU/t`,
      rows: generated,
      detailLabel: '额定能力',
      emptyText: '还没建发电机',
      note: `实际发电 ${formatNumber(actualPerSecond)} EU/t；额定能力 ${formatNumber(rated)} EU/t。下表为额定能力。${generatedNote}`, 
    },
    consumed: {
      // 只算接电网的机型：奥术宇宙的魔法机器吃灵气，不计在这一栏
      value: `${formatNumber(demand)} EU/t`,
      rows: consumed,
      emptyText: '还没建耗电机器',
    },
    ratio: `${(ratio * 100).toFixed(0)}%`,
    ratioShort: ratio < 1,
  };
}


