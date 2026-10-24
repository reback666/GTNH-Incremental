import { performance } from 'node:perf_hooks';
import { GameCore } from '../src/game/core';
import { baseModelOf, MACHINE_MODELS, PURIFIER_FROM_TIER, type MachineModel } from '../src/game/models';
import { paymentTier } from '../src/numeric/credit';
import { MAX_TIER, VOLTAGE_TIERS, assertTier } from '../src/numeric/voltage';
import { RESEARCH_FROM_TIER } from '../src/numeric/research';
import { Decimal, dec } from '../src/numeric/decimal';
import { minerEnergyEU, minerOrePerSecond } from '../src/numeric/miner';
import { machineEnergy, machineOutput } from '../src/numeric/output';
import { generatorFuelRate, generatorOutputEU, oreEnergyValue } from '../src/numeric/generator';
import { BASE_MACHINE_ENERGY, BASE_MACHINE_OUTPUT, COINS_PER_ORE } from '../src/game/constants';
import { serialize, deserialize, type SaveData } from '../src/game/save';

export type ProgressionStatus = 'complete' | 'simulation-limit' | 'wall-limit';

export interface ProgressionStage {
  voltage: string;
  reachedSeconds: number;
  readySeconds: number | null;
  machines: number;
  pollution: string;
  researches: number;
  counts: Record<string, number>;
}
export interface ProgressionCheckpoint {
  save: SaveData;
  randomState: number;
  seconds: number;
  wallSeconds: number;
  stages: ProgressionStage[];
  reached: number;
  readyAt: number | null;
  firstAutomationSeconds: number | null;
  firstAutomationClicks: number | null;
  purchases: number;
  repairs: number;
  outages: number;
  report: { powerRatio: number; outage: boolean; oreGained: string[]; oreSpent: string[]; coinsGained: string[] };
}
export interface ProgressionOptions {
  resume?: ProgressionCheckpoint;
  maxSeconds?: number;
  maxWallMs?: number;
  seed?: number;
  onProgress?: (event: ProgressionProgress) => void;
}
export interface ProgressionProgress {
  phase: string;
  voltage: string;
  seconds: number;
  wallSeconds: number;
  action: string;
  ore: string;
  coin: string;
  coinPerSecond: string;
  powerRatio: string;
  pollution: string;
}

// 这里只比较同级单独供电的额定收支；真实核验仍以逐秒 tick 为准。
export function tierOreBudget(tier: number) {
  assertTier(tier);
  const miner = baseModelOf('miner', tier);
  const machine = baseModelOf('machine', tier);
  const generator = baseModelOf('generator', tier);
  const efficiency = generator.fuelEfficiency;
  const oreShare = minerOrePerSecond(tier).times(miner.outputFactor).div(tier);
  const manufacturing = machineOutput({ baseOutput: BASE_MACHINE_OUTPUT, tier }).times(machine.outputFactor).div(COINS_PER_ORE);
  const generatorFuel = generatorFuelRate(tier, { outputFactor: generator.outputFactor,
    ...(efficiency === undefined ? {} : { efficiency }) });
  const demand = minerEnergyEU(tier).times(2).plus(machineEnergy({ baseEnergy: BASE_MACHINE_ENERGY, tier }).times(2));
  const fuel = generatorFuel.times(Decimal.min(1, demand.div(generatorOutputEU(tier, generator.outputFactor).times(4)))).times(4);
  return { voltage: VOLTAGE_TIERS[tier - 1]!, oreShare: oreShare.toString(),
    manufacturingPerMachine: manufacturing.toString(), fuelForTwoMinersTwoMachines: fuel.toString(),
    netForTwoMinersTwoMachines: oreShare.times(2).minus(manufacturing.times(2)).minus(fuel).toString(),
    minersForOneMachineIgnoringFuel: manufacturing.div(oreShare).ceil().toNumber() };
}

// 只调用玩家操作；一拍一秒，不用长步长冒充在线或离线结算。
export function verifyProgression(endTier = MAX_TIER, options: ProgressionOptions = {}) {
  assertTier(endTier);
  const maxSeconds = options.maxSeconds ?? 7 * 24 * 3600;
  const maxWallMs = options.maxWallMs ?? 30000;
  if (!Number.isFinite(maxSeconds) || maxSeconds < 0 || !Number.isFinite(maxWallMs) || maxWallMs <= 0) throw new RangeError('Invalid progression budget');
  const started = performance.now();
  const resumed = options.resume;
  let seed = resumed?.randomState ?? ((options.seed ?? 20261024) >>> 0);
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  let core = resumed ? deserialize(resumed.save) : new GameCore();
  if (resumed) Object.assign(core.lastReport, { ...resumed.report,
    oreGained: resumed.report.oreGained.map(dec), oreSpent: resumed.report.oreSpent.map(dec),
    coinsGained: resumed.report.coinsGained.map(dec) });
  core.random = random;
  const stages: ProgressionStage[] = resumed ? [...resumed.stages] : [];
  let elapsed = resumed?.seconds ?? 0;
  let firstAutomationSeconds: number | null = resumed?.firstAutomationSeconds ?? null;
  let firstAutomationClicks: number | null = resumed?.firstAutomationClicks ?? null;
  let action = resumed ? '恢复真实存档，继续累计推进' : '手动开采并以矿石建造起步设备';
  let status: ProgressionStatus = 'complete';
  let lastProgress = started;
  let purchases = resumed?.purchases ?? 0;
  let repairs = resumed?.repairs ?? 0;
  let outages = resumed?.outages ?? 0;
  const emit = (phase: string) => {
    const index = core.maxTier - 1;
    options.onProgress?.({ phase, voltage: VOLTAGE_TIERS[index]!, seconds: elapsed,
      wallSeconds: (resumed?.wallSeconds ?? 0) + (performance.now() - started) / 1000, action, ore: core.ores[index]!.toString(),
      coin: core.coins[index]!.toString(), coinPerSecond: core.lastReport.coinsGained[index]!.toString(),
      powerRatio: String(core.lastReport.powerRatio), pollution: core.pollution.toFixed(4) });
    lastProgress = performance.now();
  };
  const budget = () => {
    if (elapsed >= maxSeconds) { status = 'simulation-limit'; return false; }
    if (performance.now() - started >= maxWallMs) { status = 'wall-limit'; return false; }
    return true;
  };
  const purchase = (model: MachineModel, oreOnly = false) => {
    if (model.tier > core.maxTier || !core.isModelUnlocked(model)) return false;
    // 两种支付均是游戏现有按钮；优先花本级矿石，保留突破与研究所需的上级币。
    if (oreOnly && !core.canAfford(model, 'ore')) return false;
    const pay = core.canAfford(model, 'ore') ? 'ore' : 'coin';
    if (!core.canAfford(model, pay)) return false;
    if (core.buy(model, 1, pay) !== 1) throw new Error(`Purchase failed: ${model.id}`);
    purchases++;
    return true;
  };
  const tick = () => {
    const report = core.tick(1);
    elapsed++;
    if (report.outage) outages++;
    if (firstAutomationSeconds === null && report.oreGained.some(value => value.gt(0))) {
      firstAutomationSeconds = elapsed;
      firstAutomationClicks = core.manualMines;
      emit('首次自动采矿');
    }
    if (performance.now() - lastProgress >= 2000) emit('等待');
  };
  // 按每秒两次点击计时，达到费用即建设；不把十六次点击压成零秒。
  while (core.countOfCategory('machine') === 0 && budget()) {
    if (core.manualMines < 16) for (let click = 0; click < 2; click++) core.manualMine();
    for (const category of ['miner', 'generator', 'machine'] as const) {
      const model = baseModelOf(category, 1);
      if (core.countOf(model.id) === 0 && core.canAfford(model, 'ore')) purchase(model);
    }
    tick();
  }
  let target: MachineModel | null = null;
  let reached = resumed?.reached ?? 0;
  let readyAt: number | null = resumed?.readyAt ?? null;
  const record = () => ({ voltage: VOLTAGE_TIERS[core.maxTier - 1]!, reachedSeconds: reached,
    readySeconds: readyAt, machines: Object.values(core.counts).reduce((sum, count) => sum + count, 0),
    pollution: core.pollution.toFixed(4), researches: core.researchedModels.length, counts: { ...core.counts } });
  const support = () => {
    const tier = core.maxTier;
    const miner = baseModelOf('miner', tier);
    const machine = baseModelOf('machine', tier);
    // 矿脉均分、制造直接耗矿和按需燃料一并计算；不再固定两台采矿机。
    const generators = core.modelsAt('generator', tier).filter(model => core.isModelUnlocked(model) && !model.visPowered);
    const generator = generators.sort((a, b) => Number(b.fuelEfficiency ?? 0) - Number(a.fuelEfficiency ?? 0))[0];
    const machineCount = Math.max(4, core.countOf(machine.id));
    const share = minerOrePerSecond(tier).div(tier).times(core.outputMultiplier());
    const efficiency = dec(generator?.fuelEfficiency ?? '0.65');
    const fuelPerEU = dec('1').div(oreEnergyValue(tier).times(efficiency));
    const netMiner = share.minus(minerEnergyEU(tier).times(fuelPerEU));
    const demandWithoutMiners = machineEnergy({ baseEnergy: BASE_MACHINE_ENERGY, tier }).times(machineCount + (tier >= RESEARCH_FROM_TIER ? 1 : 0));
    const oreNeed = machineOutput({ baseOutput: BASE_MACHINE_OUTPUT, tier }).times(machineCount).div(COINS_PER_ORE)
      .plus(demandWithoutMiners.times(fuelPerEU));
    const wantedMiners = netMiner.gt(0) ? Math.max(1, oreNeed.div(netMiner).times('1.2').ceil().toNumber()) : 64;
    const minerLimit = Math.min(64, wantedMiners);
    const oreShort = core.lastReport.oreGained[tier - 1]!.lte(core.lastReport.oreSpent[tier - 1]!);
    if (core.countOf(miner.id) < minerLimit && (oreShort || core.countOf(miner.id) === 0)) {
      if (purchase(miner, target !== null)) return;
    }
    const shortPower = !core.lastReport.outage && core.lastReport.powerRatio < 0.98;
    if (shortPower) {
      // 库存充裕的旧矿也能供电；只加同级发电机会把缺燃料误当作缺装机。
      const funded = MACHINE_MODELS.filter(model => model.category === 'generator' && model.tier <= tier &&
        !model.visPowered && core.isModelUnlocked(model) && core.countOf(model.id) < 64 &&
        core.canAfford(model, 'ore') && core.ores[model.tier - 1]!.minus(core.orePriceOf(model)).gt(core.generatorFuelRateOf(model).times(120)));
      funded.sort((a, b) => {
        const score = (model: MachineModel) => generatorOutputEU(model.tier, model.outputFactor)
          .times(core.ores[model.tier - 1]!).div(core.orePriceOf(model));
        return score(b).cmp(score(a));
      });
      if (funded[0] && purchase(funded[0], true)) return;
    }
    if (tier >= PURIFIER_FROM_TIER && (core.pollution.gt(10) || core.pollutionDeltaPerSecond().gt(0))) {
      const purifiers = MACHINE_MODELS.filter(model => model.category === 'purifier' && model.tier <= tier &&
        core.isModelUnlocked(model) && core.countOf(model.id) < 64 && core.canAfford(model, 'ore'));
      purifiers.sort((a, b) => core.orePriceOf(a).div(a.tier).cmp(core.orePriceOf(b).div(b.tier)));
      if (purifiers[0] && purchase(purifiers[0], true)) return;
    }
    if (core.countOf(machine.id) < 4 && core.isModelUnlocked(machine)) purchase(machine, true);
  };
  emit('开始');
  while (budget()) {
    const tier = core.maxTier;
    const essentials = [baseModelOf('miner', tier), baseModelOf('generator', tier), baseModelOf('machine', tier)];
    if (tier >= PURIFIER_FROM_TIER) essentials.push(baseModelOf('purifier', tier));
    if (tier >= RESEARCH_FROM_TIER) essentials.push(...core.modelsAt('research', tier).filter(model => !model.requiresUniverse));
    target = essentials.find(model => !core.isModelResearched(model) || core.countOf(model.id) === 0) ?? null;
    if (target && !core.isModelResearched(target)) {
      action = `研究 ${target.id}`;
      if (!core.researchTargetModel() && core.canInvestResearch(target)) {
        if (!core.setResearchTarget(target.id)) throw new Error(`Research investment failed: ${target.id}`);
        emit('研究投资');
      }
    } else if (target) {
      action = `建设 ${target.id}`;
      purchase(target);
    } else {
      if (readyAt === null) { readyAt = elapsed; emit('阶段就绪'); }
      action = tier === endTier ? '目标阶段就绪' : `积攒突破 ${VOLTAGE_TIERS[tier]} 的 GT 币`;
      if (tier === endTier) { stages.push(record()); break; }
      if (core.canUnlock(tier + 1)) {
        stages.push(record());
        if (!core.unlock(tier + 1)) throw new Error('Voltage unlock failed');
        for (const model of MACHINE_MODELS) {
          if (model.category === 'machine' && model.tier < tier && core.countOf(model.id) > 0) core.setStopped(model.id, true);
        }
        core = deserialize(serialize(core));
        core.random = random;
        reached = elapsed;
        readyAt = null;
        emit('电压突破');
        continue;
      }
    }
    if (elapsed % 5 === 0) {
      for (const id of Object.keys(core.faults)) if (core.faultyCountOf(id) > 0) repairs += core.repair(id);
      support();
    }
    tick();
  }
  if (!stages.length || stages.at(-1)!.voltage !== VOLTAGE_TIERS[core.maxTier - 1]) stages.push(record());
  const wallSeconds = (resumed?.wallSeconds ?? 0) + (performance.now() - started) / 1000;
  const checkpoint: ProgressionCheckpoint = { save: serialize(core), randomState: seed, seconds: elapsed, wallSeconds,
    stages: stages.filter(stage => stage.voltage !== VOLTAGE_TIERS[core.maxTier - 1]), reached, readyAt,
    firstAutomationSeconds, firstAutomationClicks, purchases, repairs, outages,
    report: { powerRatio: core.lastReport.powerRatio, outage: core.lastReport.outage,
      oreGained: core.lastReport.oreGained.map(value => value.toString()),
      oreSpent: core.lastReport.oreSpent.map(value => value.toString()),
      coinsGained: core.lastReport.coinsGained.map(value => value.toString()) } };
  emit(status === 'complete' ? '完成' : '预算停止');
  return { status: status as ProgressionStatus, checkpoint, firstAutomationClicks, firstAutomationSeconds, starterClicks: core.manualMines,
    seconds: elapsed, wallSeconds, stages, maxTier: core.maxTier, purchases, repairs, outages,
    ores: core.ores.map(value => value.toString()), coins: core.coins.map(value => value.toString()),
    canMaxRebirth: core.canRebirth('max'), blocker: status === 'complete' ? null : {
      action, ore: core.ores[core.maxTier - 1]!.toString(), coin: core.coins[core.maxTier - 1]!.toString(),
      coinPerSecond: core.lastReport.coinsGained[core.maxTier - 1]!.toString(),
      oreGained: core.lastReport.oreGained[core.maxTier - 1]!.toString(), oreSpent: core.lastReport.oreSpent[core.maxTier - 1]!.toString(),
      powerRatio: String(core.lastReport.powerRatio), research: core.researchTarget,
      target: target ? { id: target.id, paymentVoltage: VOLTAGE_TIERS[paymentTier(target.tier) - 1],
        paymentBalance: core.coins[paymentTier(target.tier) - 1]!.toString(),
        coinPrice: core.priceOf(target).toString(), orePrice: core.orePriceOf(target).toString(),
        researchInvestment: core.researchInvestmentFor(target).toString(),
        researchProgress: core.researchProgressOf(target.id).toString() } : null,
      nextUnlock: core.maxTier < MAX_TIER ? { voltage: VOLTAGE_TIERS[core.maxTier],
        cost: core.unlockCostOf(core.maxTier + 1).toString(), balance: core.coins[core.maxTier - 1]!.toString() } : null,
      budget: tierOreBudget(core.maxTier), minerCap: 64, generatorCap: 64, purifierCap: 64 } };
}
