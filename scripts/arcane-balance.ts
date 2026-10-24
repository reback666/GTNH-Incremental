import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { GameCore } from '../src/game/core';
import { ArcaneExpedition, type ArcaneCommand } from '../src/game/arcane-expedition';
import { baseModelOf, MACHINE_MODELS, type MachineModel } from '../src/game/models';
import { coinValueInTier1 } from '../src/numeric/credit';
import { Decimal, dec, ZERO } from '../src/numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../src/numeric/voltage';

export type ArcaneBalanceScenarioId = 'nodes' | 'machines';
export interface ArcaneBalanceOptions {
  seconds?: number;
  seed?: number;
  onProgress?: (event: { scenario: ArcaneBalanceScenarioId; arm: string; second: number; totalSeconds: number }) => void;
}
export interface ArcaneBalancePayment {
  second: number;
  phase: 'industry' | 'prerequisite' | 'investment';
  item: string;
  coinsByTier: string[];
  oresByTier: string[];
  coinValueULV: string;
}
export interface ArcaneBalanceSnapshot {
  maxTier: number;
  universes: string[];
  grid: string;
  coinsByTier: string[];
  oresByTier: string[];
  counts: Record<string, number>;
  pollution: string;
  storedEU: string;
  essentia: string;
  arcaneSeed: number;
  research: number;
  nodes: { id: string; size: number; cultivations: number; location: string }[];
  vis: string;
}
export interface ArcaneBalanceArm {
  id: string;
  label: string;
  start: ArcaneBalanceSnapshot;
  investmentStart: ArcaneBalanceSnapshot;
  end: ArcaneBalanceSnapshot;
  payments: ArcaneBalancePayment[];
  costs: {
    industryByTier: string[];
    prerequisiteByTier: string[];
    investmentByTier: string[];
    allByTier: string[];
    incrementalBudgetULV: string;
    incrementalSpentULV: string;
    incrementalUnspentULV: string;
  };
  totals: {
    seconds: number;
    tickCalls: number;
    coinsGainedByTier: string[];
    walletIncomeByTier: string[];
    walletReconciliationByTier: string[];
    oreGainedByTier: string[];
    oreSpentByTier: string[];
    oreReconciliationByTier: string[];
    euGenerated: string;
    euConsumed: string;
    visProduced: string;
    visUsed: string;
    essentiaUsed: string;
    pollutionPeak: string;
    pollutionEnd: string;
    pollutionPointSeconds: string;
    outageSeconds: number;
    underpoweredSeconds: number;
    meanPowerRatio: string;
    magicLimitedSeconds: number;
    emptyOreSecondsByTier: number[];
    cultivationBusySeconds: number;
    cultivationCompleted: number;
    cultivationFinishedAtSecond: number | null;
  };
}
export interface ArcaneBalanceComparison {
  arm: string;
  reference: string;
  fromSecond: number;
  additionalCostByTier: string[];
  additionalCostULV: string;
  additionalIncomeByTier: string[];
  additionalIncomeULV: string;
  netWalletDifferenceByTier: string[];
  netWalletDifferenceULV: string;
  firstValuePaybackSecond: number | null;
  sustainedValuePaybackSecond: number | null;
  paymentWalletPaybackSecond: number | null;
  tailWindowSeconds: number;
  tailAdditionalIncomeULVPerSecond: string;
  tailLinearValuePaybackSecond: string | null;
  cultivationWindowIncomeGapULV: string;
  cultivationWindowVisGap: string;
}
export interface ArcaneBalanceScenario {
  id: ArcaneBalanceScenarioId;
  label: string;
  seed: number;
  seconds: number;
  preparationSeconds: number;
  investmentAtSecond: number;
  incrementalBudgetULV: string;
  fixture: ArcaneBalanceSnapshot;
  initialConditions: string[];
  arms: ArcaneBalanceArm[];
  comparisons: ArcaneBalanceComparison[];
}
export interface ArcaneBalanceReport {
  schemaVersion: 1;
  seed: number;
  observationSeconds: number;
  scenarios: ArcaneBalanceScenario[];
  conventions: string[];
  limitations: string[];
}

const ARCANE_MATERIAL_LIMITATION = '实体节点复用已确认的n-1原生图标；支架/培养台/花园/祭坛完整原生素材仍缺。';

const vector = () => Array.from({ length: MAX_TIER }, () => ZERO);
const strings = (values: Decimal[]) => values.map(value => value.toString());
const weights = Array.from({ length: MAX_TIER }, (_, i) => coinValueInTier1(i + 1));
const valueULV = (values: Decimal[]) => values.reduce((sum, value, i) => sum.plus(value.times(weights[i]!)), ZERO);
const difference = (a: Decimal[], b: Decimal[]) => a.map((value, i) => value.minus(b[i]!));
const sumPayments = (payments: ArcaneBalancePayment[], phase?: ArcaneBalancePayment['phase']) =>
  payments.filter(payment => !phase || payment.phase === phase).reduce((sum, payment) =>
    sum.map((value, i) => value.plus(payment.coinsByTier[i]!)), vector());

function optionsOf(options: ArcaneBalanceOptions) {
  const seconds = options.seconds ?? 14400;
  const seed = options.seed ?? 20261024;
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new RangeError('seconds 必须为 1～86400 的整数');
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff) throw new RangeError('seed 必须为 1～4294967295 的整数');
  return { seconds, seed };
}

function randomOf(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function snapshot(core: GameCore): ArcaneBalanceSnapshot {
  return {
    maxTier: core.maxTier, universes: [...core.universes], grid: core.grid,
    coinsByTier: strings(core.coins), oresByTier: strings(core.ores), counts: { ...core.counts },
    pollution: core.pollution.toString(), storedEU: core.storedEU.toString(), essentia: core.essentia.toString(),
    arcaneSeed: core.arcaneExpedition.state.seed, research: core.arcaneExpedition.state.research,
    nodes: core.arcaneExpedition.state.nodes.map(node => ({ id: node.id, size: node.size, cultivations: node.cultivations, location: node.location })),
    vis: core.arcaneExpedition.visOutput(core.arcaneContext()).toString(),
  };
}

function fixture(seed: number) {
  const core = new GameCore();
  // 已解锁 MV 和奥术的工业实验台；这些初始资产没有被声称来自新档推进。
  core.maxTier = 3;
  core.unlockedVeins = [0, 1, 2];
  core.universes = ['arcane'];
  core.coins = vector(); core.coins[0] = dec('60000'); core.coins[1] = dec('20000');
  core.ores = vector(); core.ores[0] = dec('500'); core.ores[1] = dec('500');
  core.essentia = ZERO;
  core.arcaneExpedition = new ArcaneExpedition({ seed });
  core.random = randomOf(seed);
  return core;
}

function magicMachine() {
  const model = MACHINE_MODELS.find(model => model.category === 'machine' && model.tier === 2 && model.visPowered);
  if (!model) throw new Error('缺少真实 LV 魔法制造机');
  return model;
}

class Experiment {
  readonly payments: ArcaneBalancePayment[] = [];
  second = 0;
  constructor(readonly core: GameCore) {}

  transact(phase: ArcaneBalancePayment['phase'], item: string, action: () => boolean) {
    const coins = [...this.core.coins], ores = [...this.core.ores];
    if (!action()) throw new Error(`${item} 在第 ${this.second} 秒执行失败`);
    const paid = difference(coins, this.core.coins), orePaid = difference(ores, this.core.ores);
    if (paid.some(value => value.lt(0)) || orePaid.some(value => value.lt(0))) throw new Error(`${item} 出现非预期退款`);
    this.payments.push({ second: this.second, phase, item, coinsByTier: strings(paid), oresByTier: strings(orePaid), coinValueULV: valueULV(paid).toString() });
  }

  buy(model: MachineModel, phase: ArcaneBalancePayment['phase']) {
    this.transact(phase, model.name, () => this.core.buy(model, 1, 'coin') === 1);
  }

  act(command: ArcaneCommand, phase: ArcaneBalancePayment['phase']) {
    this.transact(phase, JSON.stringify(command), () => this.core.arcaneExpedition.act(command, this.core.arcaneContext()));
  }

  industry() {
    for (const [category, tier, count] of [
      ['miner', 1, 1], ['generator', 1, 1], ['machine', 1, 1],
      ['miner', 2, 2], ['generator', 2, 5], ['machine', 2, 1], ['purifier', 2, 2],
    ] as const) {
      for (let i = 0; i < count; i++) this.buy(baseModelOf(category, tier), 'industry');
    }
  }

  nodeAndStand(phase: ArcaneBalancePayment['phase']) {
    this.act({ type: 'buy-node', tier: 2 }, phase);
    this.act({ type: 'buy-stand', tier: 2 }, phase);
    this.installLast(phase);
  }

  installLast(phase: ArcaneBalancePayment['phase']) {
    const node = this.core.arcaneExpedition.state.nodes.at(-1)!;
    const stand = this.core.arcaneExpedition.state.stands.at(-1)!;
    this.act({ type: 'install', nodeId: node.id, standId: stand.id }, phase);
  }

  prerequisites() {
    this.act({ type: 'research', id: 'A0' }, 'prerequisite');
    this.nodeAndStand('prerequisite'); this.nodeAndStand('prerequisite');
    this.buy(magicMachine(), 'prerequisite');
    this.act({ type: 'research', id: 'A1' }, 'prerequisite');
  }
}

function electricity(core: GameCore) {
  let demand = ZERO, capacity = ZERO;
  for (const model of MACHINE_MODELS) {
    if (model.tier > core.maxTier || model.visPowered || core.workingCountOf(model.id) === 0) continue;
    if (model.category === 'generator') capacity = capacity.plus(core.generatorOutputRated(model));
    if (model.category === 'miner') demand = demand.plus(core.minerEnergyDrain(model));
    if (model.category === 'machine') demand = demand.plus(core.machineEnergyDrain(model));
    if (model.category === 'purifier') demand = demand.plus(core.purifierEnergyDrain(model));
  }
  return { demand, capacity };
}

function invest(experiment: Experiment, scenario: ArcaneBalanceScenarioId, arm: string, budget: Decimal) {
  const { core } = experiment;
  if (scenario === 'nodes') {
    if (arm === 'expand') experiment.nodeAndStand('investment');
    if (arm === 'cultivate') {
      experiment.act({ type: 'build-bench', tier: 2 }, 'investment');
      experiment.act({ type: 'enqueue', benchId: core.arcaneExpedition.state.benches[0]!.id,
        nodeId: core.arcaneExpedition.state.nodes[0]!.id, task: { kind: 'cultivate' }, count: 10 }, 'investment');
    }
  } else if (arm === 'ordinary') {
    const machine = baseModelOf('machine', 2), generator = baseModelOf('generator', 2);
    // 固定策略：逐台添制造机，额定电力不够时先配一台同级基础发电机。
    // 不搜索最优机型，也不把未花的预算扣掉。
    while (true) {
      const { demand, capacity } = electricity(core);
      const unitDemand = core.machineEnergyDrain(machine).div(core.workingCountOf(machine.id));
      const needsGenerator = capacity.lt(demand.plus(unitDemand));
      const nextCost = core.priceOf(machine).plus(needsGenerator ? core.priceOf(generator) : ZERO);
      const spent = valueULV(sumPayments(experiment.payments, 'investment'));
      if (spent.plus(nextCost).gt(budget)) break;
      if (needsGenerator) experiment.buy(generator, 'investment');
      experiment.buy(machine, 'investment');
    }
  } else if (arm === 'magic') {
    experiment.act({ type: 'research', id: 'A0' }, 'investment');
    experiment.buy(magicMachine(), 'investment');
    while (true) {
      const options = core.arcaneExpedition.view(core.arcaneContext()).buildOptions;
      const node = options.find(option => option.command.type === 'buy-node' && option.command.tier === 2)!;
      const stand = options.find(option => option.command.type === 'buy-stand' && option.command.tier === 2 && !option.command.enclosed)!;
      const nextCost = dec(node.costs[0]!.amount).plus(stand.costs[0]!.amount);
      const spent = valueULV(sumPayments(experiment.payments, 'investment'));
      if (spent.plus(nextCost).gt(budget) || core.arcaneExpedition.visOutput(core.arcaneContext()).gte(core.magicVisDemand())) break;
      experiment.nodeAndStand('investment');
    }
  }
  if (valueULV(sumPayments(experiment.payments, 'investment')).gt(budget)) throw new Error('方案超出共同追加预算');
}

interface Trace {
  wallets: Decimal[][];
  income: Decimal[];
  vis: Decimal[];
  busy: boolean[];
}

function runArm(scenario: ArcaneBalanceScenarioId, id: string, label: string, options: ArcaneBalanceOptions) {
  const { seed, seconds } = optionsOf(options);
  const core = fixture(seed), experiment = new Experiment(core);
  const initial = snapshot(core);
  experiment.industry();
  const start = snapshot(core);
  const preparation = scenario === 'nodes' ? 1200 : 0;
  const totalSeconds = preparation + seconds;
  const budget = core.arcaneContext().firstMachineCost(2).times(scenario === 'nodes' ? 2 : 6);
  if (scenario === 'nodes' && id !== 'industry') experiment.prerequisites();
  let investmentStart = start;
  let coinsGained = vector(), oreGained = vector(), oreSpent = vector();
  let euGenerated = ZERO, euConsumed = ZERO, visProduced = ZERO, visUsed = ZERO, essentiaUsed = ZERO;
  let pollutionPeak = core.pollution, pollutionPointSeconds = ZERO, ratioSum = ZERO;
  let outageSeconds = 0, underpoweredSeconds = 0, magicLimitedSeconds = 0, cultivationBusySeconds = 0;
  let cultivationFinishedAtSecond: number | null = null;
  const emptyOreSeconds = Array.from({ length: MAX_TIER }, () => 0);
  const trace: Trace = { wallets: [], income: [], vis: [], busy: [] };
  for (let second = 0; second < totalSeconds; second++) {
    experiment.second = second;
    if (second === preparation) {
      investmentStart = snapshot(core);
      if (scenario === 'nodes' && id !== 'industry' && core.arcaneExpedition.state.research !== 1) {
        throw new Error('1200 秒共同准备期内 A1 未完成；应报告该场景无效，不能强行解锁');
      }
      invest(experiment, scenario, id, budget);
    }
    const beforeCoins = [...core.coins];
    const busy = core.arcaneExpedition.state.benches.some(bench => !bench.paused && bench.jobs.length > 0);
    const report = core.tick(1);
    const income = difference(core.coins, beforeCoins);
    coinsGained = coinsGained.map((value, i) => value.plus(report.coinsGained[i]!));
    oreGained = oreGained.map((value, i) => value.plus(report.oreGained[i]!));
    oreSpent = oreSpent.map((value, i) => value.plus(report.oreSpent[i]!));
    euGenerated = euGenerated.plus(report.euGenerated); euConsumed = euConsumed.plus(report.euConsumed);
    visProduced = visProduced.plus(report.visProduced); visUsed = visUsed.plus(report.visUsed);
    essentiaUsed = essentiaUsed.plus(report.essentiaUsed);
    pollutionPeak = Decimal.max(pollutionPeak, core.pollution);
    pollutionPointSeconds = pollutionPointSeconds.plus(core.pollution);
    ratioSum = ratioSum.plus(String(report.powerRatio));
    if (report.outage) outageSeconds++;
    if (report.powerRatio < 1) underpoweredSeconds++;
    if ([...core.lastVisRatios.entries()].some(([modelId, ratio]) => core.countOf(modelId) > 0 && ratio.lt(1))) magicLimitedSeconds++;
    for (let i = 0; i < MAX_TIER; i++) if (core.ores[i]!.isZero()) emptyOreSeconds[i]++;
    if (busy) cultivationBusySeconds++;
    if (id === 'cultivate' && core.arcaneExpedition.state.nodes[0]!.cultivations === 10 && cultivationFinishedAtSecond === null) {
      cultivationFinishedAtSecond = second + 1;
    }
    trace.wallets.push([...core.coins]); trace.income.push(valueULV(income));
    trace.vis.push(report.visProduced); trace.busy.push(busy);
    if ((second + 1) % 3600 === 0) options.onProgress?.({ scenario, arm: id, second: second + 1, totalSeconds });
  }
  const end = snapshot(core);
  const industry = sumPayments(experiment.payments, 'industry');
  const prerequisite = sumPayments(experiment.payments, 'prerequisite');
  const investment = sumPayments(experiment.payments, 'investment');
  const costsAfterStart = prerequisite.map((value, i) => value.plus(investment[i]!));
  const walletIncome = difference(core.coins, start.coinsByTier.map(dec)).map((value, i) => value.plus(costsAfterStart[i]!));
  const spent = valueULV(investment);
  const arm: ArcaneBalanceArm = {
    id, label, start, investmentStart, end, payments: experiment.payments,
    costs: { industryByTier: strings(industry), prerequisiteByTier: strings(prerequisite), investmentByTier: strings(investment),
      allByTier: strings(sumPayments(experiment.payments)), incrementalBudgetULV: budget.toString(),
      incrementalSpentULV: spent.toString(), incrementalUnspentULV: budget.minus(spent).toString() },
    totals: { seconds: totalSeconds, tickCalls: totalSeconds, coinsGainedByTier: strings(coinsGained), walletIncomeByTier: strings(walletIncome),
      walletReconciliationByTier: strings(difference(walletIncome, coinsGained)), oreGainedByTier: strings(oreGained), oreSpentByTier: strings(oreSpent),
      oreReconciliationByTier: strings(core.ores.map((value, i) => value.minus(start.oresByTier[i]!).minus(oreGained[i]!).plus(oreSpent[i]!))),
      euGenerated: euGenerated.toString(), euConsumed: euConsumed.toString(), visProduced: visProduced.toString(), visUsed: visUsed.toString(),
      essentiaUsed: essentiaUsed.toString(), pollutionPeak: pollutionPeak.toString(), pollutionEnd: core.pollution.toString(),
      pollutionPointSeconds: pollutionPointSeconds.toString(), outageSeconds, underpoweredSeconds, meanPowerRatio: ratioSum.div(totalSeconds).toString(),
      magicLimitedSeconds, emptyOreSecondsByTier: emptyOreSeconds, cultivationBusySeconds,
      cultivationCompleted: core.arcaneExpedition.state.nodes.reduce((sum, node) => sum + node.cultivations, 0), cultivationFinishedAtSecond },
  };
  return { arm, trace, initial };
}

function compare(arm: ReturnType<typeof runArm>, reference: ReturnType<typeof runArm>, fromSecond: number): ArcaneBalanceComparison {
  const a = arm.arm, b = reference.arm;
  const cost = difference(sumPayments(a.payments), sumPayments(b.payments));
  const income = difference(a.totals.walletIncomeByTier.map(dec), b.totals.walletIncomeByTier.map(dec));
  const net = difference(a.end.coinsByTier.map(dec), b.end.coinsByTier.map(dec));
  let first: number | null = null, lastNegative = fromSecond, walletPayback: number | null = null;
  let busyIncomeGap = ZERO, busyVisGap = ZERO;
  for (let i = fromSecond; i < arm.trace.wallets.length; i++) {
    const delta = difference(arm.trace.wallets[i]!, reference.trace.wallets[i]!);
    if (valueULV(delta).gte(0)) { if (first === null) first = i + 1; }
    else lastNegative = i + 1;
    if (walletPayback === null && cost.some(value => value.gt(0)) && delta.every((value, tier) => cost[tier]!.lte(0) || value.gte(0))) walletPayback = i + 1;
    if (arm.trace.busy[i]) {
      busyIncomeGap = busyIncomeGap.plus(reference.trace.income[i]!.minus(arm.trace.income[i]!));
      busyVisGap = busyVisGap.plus(reference.trace.vis[i]!.minus(arm.trace.vis[i]!));
    }
  }
  const window = Math.min(600, arm.trace.income.length - fromSecond);
  let tail = ZERO;
  for (let i = arm.trace.income.length - window; i < arm.trace.income.length; i++) tail = tail.plus(arm.trace.income[i]!.minus(reference.trace.income[i]!));
  tail = tail.div(window);
  const netValue = valueULV(net);
  const positiveCost = valueULV(cost).gt(0);
  const queuesFinished = [a, b].every(result => result.id !== 'cultivate' || result.totals.cultivationCompleted === 10);
  return {
    arm: a.id, reference: b.id, fromSecond, additionalCostByTier: strings(cost), additionalCostULV: valueULV(cost).toString(),
    additionalIncomeByTier: strings(income), additionalIncomeULV: valueULV(income).toString(),
    netWalletDifferenceByTier: strings(net), netWalletDifferenceULV: netValue.toString(),
    firstValuePaybackSecond: positiveCost ? first : null, sustainedValuePaybackSecond: positiveCost && netValue.gte(0) ? lastNegative + 1 : null,
    paymentWalletPaybackSecond: positiveCost ? walletPayback : null,
    tailWindowSeconds: window, tailAdditionalIncomeULVPerSecond: tail.toString(),
    tailLinearValuePaybackSecond: positiveCost && queuesFinished && netValue.lt(0) && tail.gt(0) ? dec(String(arm.trace.income.length)).plus(netValue.neg().div(tail)).toString() : null,
    cultivationWindowIncomeGapULV: busyIncomeGap.toString(), cultivationWindowVisGap: busyVisGap.toString(),
  };
}

/** 真实工业实验台数据；导入不执行、不读写存档或 docs。金额全部为 Decimal 的十进制字符串。 */
export function runArcaneBalanceScenario(id: ArcaneBalanceScenarioId, options: ArcaneBalanceOptions = {}): ArcaneBalanceScenario {
  if (id !== 'nodes' && id !== 'machines') throw new RangeError('未知奥术平衡场景');
  const { seconds, seed } = optionsOf(options);
  const specs = id === 'nodes'
    ? [['industry', '仅工业基准'], ['hold', 'A1 三节点保持运行'], ['expand', '新增标准节点与支架'], ['cultivate', '首节点稳定培养十次']] as const
    : [['industry', '不追加投资'], ['ordinary', '普通制造机与必要发电机'], ['magic', 'A0、魔法制造机与节点支架']] as const;
  const runs = specs.map(([arm, label]) => runArm(id, arm, label, options));
  const comparisons = runs.slice(1).map(arm => compare(arm, runs[0]!, 0));
  if (id === 'nodes') {
    comparisons.push(compare(runs[2]!, runs[1]!, 1200), compare(runs[3]!, runs[1]!, 1200), compare(runs[3]!, runs[2]!, 1200));
  } else comparisons.push(compare(runs[2]!, runs[1]!, 0));
  const fixtureData = runs[0]!.initial;
  if (runs.some(run => JSON.stringify(run.initial) !== JSON.stringify(fixtureData) || JSON.stringify(run.arm.start) !== JSON.stringify(runs[0]!.arm.start))) {
    throw new Error('对照初始资产不一致');
  }
  return {
    id, label: id === 'nodes' ? '同预算扩建与培养' : '同预算魔法与普通制造', seed,
    seconds: seconds + (id === 'nodes' ? 1200 : 0), preparationSeconds: id === 'nodes' ? 1200 : 0,
    investmentAtSecond: id === 'nodes' ? 1200 : 0, incrementalBudgetULV: runs[0]!.arm.costs.incrementalBudgetULV,
    fixture: fixtureData,
    initialConditions: [
      '明确给定已达 MV、奥术已激活的测试初始条件；不代表从零挣得这些资产或已验证主线通关。',
      '初始只有 ULV 币 60000、LV 币 20000、T0/T1 矿各 500；其他钱包、库存、源质及电池为零；运行中不注资。',
      '先真实付币建设 ULV 矿机/发电机/制造机各一台、LV 矿机两台/基础发电机五台/制造机一台/净化器两台。',
      '普通电网、污染开启、固定随机种子；零超频、零转生加成；不关闭随机事件，不自动扩建或缴费。',
      id === 'nodes' ? '三个奥术方案真实支付 A0、两颗标准节点、两副支架、一台魔法制造机和 A1；共同准备 1200 秒，追加预算为 2 C_LV。' : '追加预算为 6 C_LV。普通方案逐台购制造机并补足额定电力；魔法方案先买 A0 和一台魔法制造机，再按预算添标准节点及支架。',
      '投资只在第 0 秒或准备期结束时发生；其后只逐秒结算，不拿后续收入继续购买。未用预算留在真实原钱包。',
    ],
    arms: runs.map(run => run.arm), comparisons,
  };
}

export function runArcaneBalance(options: ArcaneBalanceOptions = {}): ArcaneBalanceReport {
  const { seed, seconds } = optionsOf(options);
  return { schemaVersion: 1, seed, observationSeconds: seconds,
    scenarios: [runArcaneBalanceScenario('nodes', options), runArcaneBalanceScenario('machines', options)],
    conventions: [
      '币、矿、电与收益使用真实 GameCore；一拍严格 tick(1)，节点设施只调用 act；所有费用来自原钱包实际扣款差。',
      'coinValueULV 按现有 coinValueInTier1 折算，仅作统一估值，不代表币种可以互换；另列付款币种钱包实际回本。',
      '净钱包差=实际新增产币−实际新增建设费用；不把矿石库存或设备残值当现金。耗矿包含燃料和制造直接耗矿，另列库存进出与对账。',
      '研究、节点、支架、培养台、十次培养逐项列实付；共同前置成本在总投资对工业基准中计入，在追加投资比较中相消。',
      '电量沿用核心 euGenerated/euConsumed 的累计单位，不额外乘 20；污染报告期末、峰值及百分点秒积分。',
      `当前真实 LV 魔法制造机 ${magicMachine().id} 的基础产出系数为 ${magicMachine().outputFactor}；本验证不采用规划文档中尚未进入原核心的替代公式。`,
      '培养窗口收入差按相同期不培养对照的真实产币计算，包含节点停供及培养台用电，已经计入净钱包差，不能再重复扣除。',
      '回本秒数从同一工业起点计时，追加投资比较需减去准备期才是投资后的等待秒数。首次回本允许其后再次跌破零；持续回本只证明之后截至观测期末均不为负。',
      '追加费用不为正的方案不定义回本；培养未完成不外推回本。其余尾段线性外推也不属于实测回本。',
    ],
    limitations: [
      '只验证给定 MV 工业实验台、LV 标准普通节点和现有实际魔法机参数；不是从零主线、A0–A6 通关或最优投资路线证明。',
      '两方案拥有相同可用追加预算，实际花费因整台设备不可分而不同；保留未用余额，不伪造等额支出。',
      '当前方案未搜索调查、丰饶/血仪式、修复、调谐、升阶、饕餮同化、附魔、不同矿脉配置与高压机型的收益。',
      '单个固定种子的停电与污染事件只是该路径实证，不代表统计平均；长期外推可能被库存、污染、故障和后续操作改变。',
      ARCANE_MATERIAL_LIMITATION,
    ],
  };
}

export function renderArcaneBalance(report: ArcaneBalanceReport): string {
  const fmt = (value: string) => dec(value).toSignificantDigits(8).toString();
  const tiers = (values: string[]) => values.flatMap((value, i) => dec(value).isZero() ? [] : [`${VOLTAGE_TIERS[i]} ${fmt(value)}`]).join('；') || '0';
  const lines = ['## P5.5 奥术真实结算对照', '', `固定种子 ${report.seed}；追加投资后观测 ${report.observationSeconds} 秒。`, '',
    ...report.conventions.map(text => `- ${text}`), ''];
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.label}`, '', ...scenario.initialConditions.map(text => `- ${text}`), '',
      `各方案总共逐秒结算 ${scenario.seconds} 秒，追加投资时点 ${scenario.investmentAtSecond} 秒，追加预算 ${scenario.incrementalBudgetULV} ULV 币。`, '',
      '| 方案 | 共同工业实付 | 奥术前置实付 | 追加实付 / 剩余 ULV | 实际产币 | 实际耗矿 | 发电 / 用电 | 污染峰值 / 期末 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const arm of scenario.arms) lines.push(`| ${arm.label} | ${tiers(arm.costs.industryByTier)} | ${tiers(arm.costs.prerequisiteByTier)} | ${arm.costs.incrementalSpentULV} / ${arm.costs.incrementalUnspentULV} | ${tiers(arm.totals.walletIncomeByTier)} | ${tiers(arm.totals.oreSpentByTier)} | ${fmt(arm.totals.euGenerated)} / ${fmt(arm.totals.euConsumed)} | ${fmt(arm.totals.pollutionPeak)} / ${fmt(arm.totals.pollutionEnd)} |`);
    lines.push('', '| 对照（方案 − 基准） | 追加费用估值 | 新增实际产币估值 | 期末净钱包差 | 首次 / 持续估值回本秒 | 付款币种回本秒 | 尾段收入差/秒 | 尾段线性外推回本秒（非实测） |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const comparison of scenario.comparisons) lines.push(`| ${comparison.arm} − ${comparison.reference} | ${fmt(comparison.additionalCostULV)} | ${fmt(comparison.additionalIncomeULV)} | ${fmt(comparison.netWalletDifferenceULV)} | ${comparison.firstValuePaybackSecond ?? '未观测'} / ${comparison.sustainedValuePaybackSecond ?? '未观测'} | ${comparison.paymentWalletPaybackSecond ?? '未观测'} | ${fmt(comparison.tailAdditionalIncomeULVPerSecond)} | ${comparison.tailLinearValuePaybackSecond === null ? '无' : fmt(comparison.tailLinearValuePaybackSecond)} |`);
    const cultivated = scenario.arms.find(arm => arm.id === 'cultivate');
    const cultivation = scenario.comparisons.find(comparison => comparison.arm === 'cultivate' && comparison.reference === 'hold');
    if (cultivated && cultivation) lines.push('', `培养完成 ${cultivated.totals.cultivationCompleted}/10 次，队列占用 ${cultivated.totals.cultivationBusySeconds} 秒，十次完成于第 ${cultivated.totals.cultivationFinishedAtSecond ?? '未完成'} 秒；占用期间相对保持运行少产 ${fmt(cultivation.cultivationWindowIncomeGapULV)} ULV 等值币、少供 ${fmt(cultivation.cultivationWindowVisGap)} 灵气。`);
    lines.push('');
  }
  lines.push('### 覆盖边界', '', ...report.limitations.map(text => `- ${text}`), '');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const read = (key: string) => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  for (const arg of args) if (arg !== '--json' && !/^--(?:seconds|seed)=\d+$/.test(arg)) throw new Error(`未知参数：${arg}`);
  const seconds = read('seconds'), seed = read('seed');
  const report = runArcaneBalance({ ...(seconds ? { seconds: Number(seconds) } : {}), ...(seed ? { seed: Number(seed) } : {}),
    onProgress: event => process.stderr.write(`${event.scenario}/${event.arm} ${event.second}/${event.totalSeconds} 秒\n`) });
  process.stdout.write(args.includes('--json') ? JSON.stringify(report, null, 2) + '\n' : renderArcaneBalance(report));
}
