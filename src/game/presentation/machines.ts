import { PICKAXE_LINE_META, pickaxeEffectNow } from './pickaxe-effects';
import type { MachineTierGroup, MachineColumn, ModifierRow } from './types';
import { Decimal, ZERO, dec, decInt } from '../../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../../numeric/voltage';
import { formatNumber } from '../../numeric/format';
import { machineEnergy, machineOutput } from '../../numeric/output';
import { generatorFuelEfficiency, generatorOutputEU } from '../../numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../../numeric/miner';
import { overclockEnergyMultiplier, overclockSpeedMultiplier } from '../../numeric/overclock';
import { faultHint } from '../../numeric/fault';
import { batteryCapacityEU } from '../../numeric/storage';
import { pollutionBandName } from '../../numeric/pollution';
import { gridEnergyMultiplier, gridMode } from '../../numeric/grid';
import { oreMaterial } from '../vein-materials';
import { arcaneOutputBonus, NODE_ESSENTIA_PER_SECOND, nodeEssentiaDemand, nodeOutputFactor, nodeVisPerSecond, visPerMachine } from '../../numeric/arcane';
import { PURIFY_PER_TIER_PER_SECOND, purifierMachineCoverage } from '../../numeric/pollution';
import { pollutionDriveFactor, suppressionOfTier } from '../../numeric/abyss';
import { computerComputePerSecond, computerEnergyEU, labComputeThroughput } from '../../numeric/research';
import { type GameCore, type MachineKind } from '../core';
import { canOverclock, modelsOf, type MachineModel } from '../models';
import * as C from '../constants';
import { TIER_ICON_LIMIT, COLUMN_META } from './catalog';
import { paymentUnit, fuelRateOf } from './resources';

export function modifierRows(core: GameCore, kind: MachineKind | 'pickaxe'): ModifierRow[] {
  const rows: ModifierRow[] = [];
  const add = (effect: string, value: string, source: string, tone: ModifierRow['tone']) => {
    rows.push({ effect, value, source, tone });
  };
  // 倍率 → 「+12% / -20%」
  const pct = (multiplier: Decimal): string => {
    const delta = multiplier.minus(1).times(100);
    return `${delta.gte(0) ? '+' : ''}${formatNumber(delta)}%`;
  };
  // 超过 1 是好事（产出/速度），小于 1 是坏事
  const tone = (multiplier: Decimal): ModifierRow['tone'] =>
    multiplier.gt(1) ? 'good' : multiplier.lt(1) ? 'bad' : 'flat';

  // 镐子不吃电也不吃污染，它的修正就是自己的三条升级线
  if (kind === 'pickaxe') {
    for (const line of PICKAXE_LINE_META) {
      add(
        line.name,
        pickaxeEffectNow(core, line.id),
        '镐子升级线',
        core.pickaxeLevel(line.id) > 0 ? 'good' : 'flat',
      );
    }
    return rows;
  }

  const arcane = core.hasUniverse('arcane');
  const abyss = core.hasUniverse('abyss');
  const report = core.lastReport;

  // ── 电力侧：电网倍率与供电降载 ─────────────────────────
  // 发电机是发电的、存电装置只是池子、灵气节点与抑制器不吃电，都不受这两条影响
  const drawsPower =
    kind !== 'generator' && kind !== 'storage' && kind !== 'arcane' && kind !== 'abyss';
  if (drawsPower && !arcane) {
    const gridMul = gridEnergyMultiplier(core.grid);
    if (!gridMul.eq(1)) {
      add('耗电', pct(gridMul), `电网 · ${gridMode(core.grid).name}`, tone(gridMul));
    }
    const powerRatio = dec(String(report.powerRatio));
    if (powerRatio.lt(1)) {
      add('产出', pct(powerRatio), report.outage ? '电网断电' : '供电不足', 'bad');
    }
  }

  // ── 转生加成树 ─────────────────────────────────────────
  if (kind === 'miner' || kind === 'machine') {
    const speed = kind === 'miner' ? core.minerSpeedBonus() : core.machineSpeedBonus();
    if (!speed.eq(1)) add('速度', pct(speed), '转生 · 加成树', tone(speed));
  }
  if (kind === 'machine') {
    const coins = core.coinOutputBonus();
    if (!coins.eq(1)) add('产币', pct(coins), '转生 · 加成树', tone(coins));
  }
  if (kind === 'generator') {
    const fuel = core.fuelEfficiencyBonus();
    if (!fuel.eq(1)) add('燃料效率', pct(fuel), '转生 · 加成树', tone(fuel));
  }
  if (kind === 'research') {
    const compute = core.computeOutputBonus();
    if (!compute.eq(1)) add('算力产出', pct(compute), '转生 · 加成树（计算机）', tone(compute));
    const speed = core.researchSpeedBonus();
    if (!speed.eq(1)) add('研究速度', pct(speed), '转生 · 加成树（研究站）', tone(speed));
    const cost = core.researchCostFactor();
    if (!cost.eq(1)) add('研究需求', pct(cost), '转生 · 加成树（研究站）', cost.lt(1) ? 'good' : 'bad');
  }
  if (kind === 'generator') {
    const output = core.totalBonusFor('generatorOutput');
    if (!output.eq(1)) add('发电能力', pct(output), '转生 · 加成树', tone(output));
  }
  if (kind === 'storage') {
    const battery = core.totalBonusFor('batteryCapacity');
    if (!battery.eq(1)) add('容量', pct(battery), '转生 · 加成树', tone(battery));
  }
  if (kind === 'purifier') {
    const purify = core.totalBonusFor('purifyBoost');
    if (!purify.eq(1)) add('净化', pct(purify), '转生 · 加成树', tone(purify));
  }
  {
    const saving = core.energyFactor();
    if (drawsPower && !saving.eq(1)) {
      add('耗电', pct(saving), '转生 · 加成树', tone(saving));
    }
  }
  if (kind === 'miner' || kind === 'generator' || kind === 'machine' || kind === 'research') {
    const pollutionFactor = core.pollutionProductionFactor();
    if (!pollutionFactor.eq(1)) {
      add('污染产生', pct(pollutionFactor), '转生 · 加成树', tone(pollutionFactor));
    }
  }

  // ── 平行宇宙 ───────────────────────────────────────────
  if (kind === 'miner' || kind === 'machine') {
    if (abyss) {
      // 深渊宇宙：污染变成燃料，中性点默认 30%（「深渊·中性点」节点移到 25%）
      const neutral = core.abyssNeutralPoint();
      const drive = pollutionDriveFactor(core.pollution, core.pollutionNeutralShift());
      add(
        '产出',
        pct(drive),
        `深渊宇宙 · 污染 ${formatNumber(core.pollution)}%（${formatNumber(neutral)}% 中性）`,
        tone(drive),
      );
    } else {
      const pollution = core.outputMultiplier();
      if (!pollution.eq(1)) {
        add('产出', pct(pollution), `污染 · ${pollutionBandName(core.pollution)}`, tone(pollution));
      }
    }
  }
  // 奥术宇宙：灵气喂得越满，产量加成越高（普通机器 +10%、魔法机器 +30%）
  if (arcane && (kind === 'miner' || kind === 'generator' || kind === 'machine')) {
    const plenty = report.arcanePlenty;
    const source = `奥术宇宙 · 灵气充裕度 ${formatNumber(plenty.times(100), { significantDigits: 3 })}%`;
    add('产量（电力机器）', pct(arcaneOutputBonus(plenty, false)), source, 'good');
    add('产量（魔法机器）', pct(arcaneOutputBonus(plenty, true)), source, 'good');
  }
  // 硅基宇宙：AI 接管维护、超频与停机调度
  if (core.hasUniverse('silicon')) {
    if (core.siliconAutoRepair) add('维护', '自动', '硅基宇宙 · AI 自动维护', 'good');
    if (core.siliconAutoOverclock && (kind === 'miner' || kind === 'machine')) {
      add('超频', '自动升降档', '硅基宇宙 · AI 自动超频', 'good');
    }
    if (core.siliconShedding && (kind === 'miner' || kind === 'machine' || kind === 'purifier')) {
      add('缺电时', '可能整组停机', '硅基宇宙 · AI 按优先级停机', 'flat');
    }
  }

  // ── 超频与故障（逐机型设置，这里汇总） ─────────────────
  if (kind === 'miner' || kind === 'machine') {
    const levels = modelsOf(kind).map((model) =>
      canOverclock(model) ? core.overclockOf(model.id) : 0,
    );
    const opened = levels.filter((level) => level > 0).length;
    if (opened > 0) {
      const top = Math.max(...levels);
      add(
        '速度 / 耗电',
        `+${top * 60}% / ×${2 ** top}`,
        `超频 · ${opened} 个机型在开（最高 ${top} 档）`,
        'flat',
      );
    }
  }
  if (
    (kind === 'miner' || kind === 'machine') &&
    core.hasRebirthEffect('faultReduction')
  ) {
    add('故障率', pct(core.faultFactor()), '转生 · 加成树', 'good');
  }
  if (abyss && kind !== 'abyss' && core.hasRebirthEffect('corrosionReduction')) {
    add('腐蚀损伤', pct(core.corrosionFactor()), '转生 · 加成树', 'good');
  }
  const faulty = modelsOf(kind).reduce((sum, model) => sum + core.faultyCountOf(model.id), 0);
  if (faulty > 0) add('停机', `${faulty} 台`, '故障未维护', 'bad');

  // ── 各类机器自己的那条 ─────────────────────────────────
  if (kind === 'generator') {
    const rated = modelsOf('generator').reduce(
      (sum, model) => sum.plus(core.generatorOutputRated(model)),
      ZERO,
    );
    const step = dec(String(report.stepSeconds));
    const capacity = step.gt(0) ? report.euCapacity.div(step) : rated;
    // 拿不出额定发电率 = 缺燃料；拿得出却发得少 = 发电机按需发电，不是故障
    if (rated.gt(0) && capacity.lt(rated)) {
      add('发电率', pct(capacity.div(rated)), '矿石不够烧', 'bad');
    }
  }
  if (kind === 'purifier') {
    if (!core.pollutionEnabled) {
      add('提示', '污染机制已关闭', '设置', 'flat');
    } else {
      const purify = core.purifyPerSecond();
      add('净化量', `${formatNumber(purify.times(100))}%/秒`, '', 'good');
      if (abyss) add('副作用', '不抵消深渊腐蚀', '污染在这里是燃料', 'flat');
    }
  }
  if (kind === 'research' && report.computeWasted.gt(0)) {
    add('浪费算力', formatNumber(report.computeWasted), '研究站吃不下', 'bad');
  }
  if (kind === 'arcane') {
    const need = core.nodeEssentiaDemandRated();
    if (need.gt(0)) {
      const factor = nodeOutputFactor(report.essentiaUsed, need);
      if (factor.lt(1)) {
        add('出力', pct(factor), '源质没喂满（最低仍有一半）', 'bad');
      }
    }
  }
  if (kind === 'abyss') {
    const points = core.suppression();
    if (points.gt(0)) add('抵消污染', `${formatNumber(points)} 点`, '腐蚀抑制器', 'good');
  }
  if (kind === 'storage') {
    const capacity = core.batteryCapacity();
    if (capacity.gt(0)) add('容量', `${formatNumber(capacity)} EU`, '存电装置合计', 'good');
    if (report.euCharged.gt(0)) add('充电', `${formatNumber(report.euCharged)} EU/秒`, '上一拍', 'flat');
    if (report.euDischarged.gt(0)) {
      add('放电', `${formatNumber(report.euDischarged)} EU/秒`, '上一拍', 'flat');
    }
  }

  return rows;
}

// 镐子三条升级线的固定信息。清单、面板、悬停提示都读这一份。
export function machineColumn(core: GameCore, kind: MachineKind): MachineColumn {
  const meta = COLUMN_META[kind];
  // 上一拍被硅基 AI 整组停机的类别：这些类别的机器这一拍全都不干活
  const shedKinds = new Set<MachineKind>(core.lastReport.sheddedKinds as MachineKind[]);
  // 先按等级分桶（一次遍历），再逐级取：比每个等级都去品类清单里筛一遍便宜
  const buckets = new Map<number, MachineModel[]>();
  for (const model of modelsOf(kind)) {
    if (!core.universeSatisfied(model)) continue;
    const list = buckets.get(model.tier);
    if (list) list.push(model);
    else buckets.set(model.tier, [model]);
  }
  const tiers: MachineTierGroup[] = [];
  for (let tier = 1; tier <= MAX_TIER; tier += 1) {
    // 没解锁对应平行宇宙的机型（魔法机器、灵气节点、腐蚀抑制器）整个不出现，
    // 和「标签按进度出现」同一个规矩：没到那一步就不占位置
    const models = buckets.get(tier);
    if (models === undefined) continue;
    const payment = paymentUnit(tier);
    tiers.push({
      tier,
      voltage: VOLTAGE_TIERS[tier - 1] ?? `T${tier}`,
      oreLabel: oreMaterial(tier - 1),
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
          researched: core.isModelResearched(model),
          unlocked: core.isModelUnlocked(model),
          visPowered: model.visPowered === true,
          single: singleStats(model, level),
          count,
          // 真正干活的台数与停机台数（手动停机 + 故障 + 被 AI 调度停机）
          running: shedKinds.has(kind) ? 0 : core.workingCountOf(model.id),
          idle: shedKinds.has(kind) ? count : count - core.workingCountOf(model.id),
          stopped: core.isStopped(model.id),
          stoppable: model.category !== 'storage',
          overclock: level,
          overclockable,
          faulty: core.faultyCountOf(model.id),
          // 停机机型的故障率按「恢复运行后」算，提示才有意义
          faultHint: faultHint(level, Math.max(0, count - core.faultyCountOf(model.id))),
          icons: Math.min(count, TIER_ICON_LIMIT),
          overflow: Math.max(0, count - TIER_ICON_LIMIT),
          price: formatNumber(core.coinPriceOf(model)),
          refund: formatNumber(core.refundOf(model)),
          oreRefund: formatNumber(core.refundOf(model, 'ore')),
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
    modifiers: modifierRows(core, kind),
  };
}

// 算力（流量）与当前研究目标。
// 上报的是「上一拍」的实际数据，和电能四格同一个口径。
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
    const output = {
      label: '发电率',
      value: `${formatNumber(generatorOutputEU(model.tier, model.outputFactor))} EU/t`,
    };
    // 魔法发电机不烧矿，直接吃灵气发电
    if (model.visPowered) {
      return [
        output,
        { label: '灵气消耗', value: `${formatNumber(visPerMachine(model.tier).times(energy))}/秒` },
      ];
    }
    return [
      output,
      { label: '矿物消耗', value: `${formatNumber(fuelRateOf(model))}/秒` },
      { label: '燃料效率', value: `${formatNumber(dec(efficiency).times(100))}%` },
    ];
  }
  if (model.category === 'miner') {
    const output = {
      label: '产矿',
      value: `${formatNumber(minerOrePerSecond(model.tier).times(speed).times(model.outputFactor))}/秒`,
    };
    return model.visPowered
      ? [output, { label: '灵气消耗', value: `${formatNumber(minerEnergyEU(model.tier).times(energy))}/秒` }]
      : [output, { label: '耗电', value: `${formatNumber(minerEnergyEU(model.tier).times(energy))} EU/t` }];
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
  const power = model.visPowered
    ? {
        label: '灵气消耗',
        value: `${formatNumber(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }).times(energy))}/秒`,
      }
    : {
        label: '耗电',
        value: `${formatNumber(machineEnergy({ baseEnergy: C.BASE_MACHINE_ENERGY, tier: model.tier }).times(energy))} EU/t`,
      };
  return [
    { label: '产币', value: `${formatNumber(output.times(speed))}/秒` },
    power,
    { label: '矿物消耗', value: `${formatNumber(output.times(speed).div(C.COINS_PER_ORE))}/秒` },
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
  // 电网模式直接改耗电机器的耗电：界面上的耗电读数也用折后值，和模拟一致
  const gridMul = gridEnergyMultiplier(core.grid);
  for (const model of core.unlockedModels(kind)) {
    if (core.countOf(model.id) === 0) continue;
    if (kind === 'miner') {
      ore = ore.plus(core.minerOutputPerSecond(model));
      eu = eu.plus(core.minerEnergyDrain(model).times(gridMul));
    } else if (kind === 'generator') {
      eu = eu.plus(core.generatorOutputRated(model));
      fuel = fuel.plus(core.generatorFuelDrain(model));
    } else if (kind === 'machine') {
      const output = core.machineOutputPerSecond(model);
      coins = coins.plus(output);
      eu = eu.plus(core.machineEnergyDrain(model).times(gridMul));
      ore = ore.plus(output.div(C.COINS_PER_ORE));
    } else if (kind === 'purifier') {
      eu = eu.plus(core.purifierEnergyDrain(model).times(gridMul));
    } else if (kind === 'arcane') {
      vis = vis.plus(nodeVisPerSecond(model.tier).times(core.workingCountOf(model.id)));
      essentia = essentia.plus(nodeEssentiaDemand(decInt(core.workingCountOf(model.id), 'count')));
    } else if (kind === 'abyss') {
      eu = eu.plus(core.purifierEnergyDrain(model).times(gridMul));
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
      { label: '实际发电', value: `${formatNumber(core.lastReport.stepSeconds > 0 ? core.lastReport.euGenerated.div(core.lastReport.stepSeconds) : ZERO)} EU/t` },
      { label: '额定能力', value: `${formatNumber(eu)} EU/t` },
      { label: '矿物消耗', value: `${formatNumber(fuel)}/秒` },
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
    const target = core.researchTargetModel();
    const required = target === null ? ZERO : core.researchRequiredFor(target);
    return [
      { label: '算力产出', value: `${formatNumber(core.computerComputeRated())}/秒` },
      { label: '算力消耗', value: `${formatNumber(core.labComputeDemand())}/秒` },
      { label: '算力浪费', value: `${formatNumber(core.lastReport.computeWasted)}/秒` },
      {
        label: '研究进度',
        value:
          target === null
            ? '—'
            : `${formatNumber(core.researchProgressOf(target.id))} / ${formatNumber(required)}`,
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
    { label: '矿物消耗', value: `${formatNumber(ore)}/秒` },
  ];
}

