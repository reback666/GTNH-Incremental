import type { UniverseRow, ArcaneStats, SiliconStats, AbyssStats } from './types';
import { Decimal, ZERO } from '../../numeric/decimal';
import { SILICON_KEEP_PRIORITY } from '../../numeric/silicon';
import { formatNumber } from '../../numeric/format';
import { UNIVERSES } from '../universes';
import { essentiaFromPurify } from '../../numeric/arcane';
import { arcaneOutputBonus } from '../../numeric/arcane';
import { pollutionDriveFactor } from '../../numeric/abyss';
import { type GameCore, type MachineKind } from '../core';
import { MACHINE_MODELS, modelsOf } from '../models';
import { COLUMN_META } from './catalog';

export function universeRows(core: GameCore): UniverseRow[] {
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
export function arcaneStats(core: GameCore): ArcaneStats {
  const active = core.hasUniverse('arcane');
  const report = core.lastReport;
  const nodes = modelsOf('arcane').reduce((sum, model) => sum + core.countOf(model.id), 0);
  const demand = core.nodeEssentiaDemandRated();
  const produced = core.hasUniverse('arcane')
    ? essentiaFromPurify(core.purifyPerSecond())
    : ZERO;
  const essentiaNet = produced.minus(demand);

  const plenty = report.arcanePlenty;
  const magicCount = MACHINE_MODELS.filter(
    (model) => model.visPowered && core.countOf(model.id) > 0,
  ).length;
  const percent = (factor: Decimal) =>
    `+${formatNumber(factor.minus(1).times(100), { significantDigits: 3 })}%`;

  let note: string;
  if (!active) {
    note = '没有奥术宇宙：灵气节点与魔法机器都造不了，机器照常吃电。';
  } else if (magicCount === 0) {
    note = '还没有魔法机器：灵气没人用，也就没有灵气加成。建几台魔法机器（LV~LuV 的采矿机 / 发电机 / 制造机）才吃得上。';
  } else if (nodes === 0) {
    note = '魔法机器没有灵气可用，全部停摆：先建一台灵气节点。';
  } else if (plenty.gte(1)) {
    note = '灵气喂满了：普通机器 +10% 产量、魔法机器 +30%。';
  } else if (essentiaNet.gte(0)) {
    note = '灵气不够喂满全部魔法机器：少建几台魔法机器或多建节点，加成会跟着涨。';
  } else {
    note = '源质不够：灵气节点按比例降出力（最低 50%），多建净化器。';
  }

  return {
    active,
    visProduced: `${formatNumber(report.visProduced)}/秒`,
    visUsed: `${formatNumber(report.visUsed)}/秒`,
    plenty: `${formatNumber(plenty.times(100), { significantDigits: 3 })}%`,
    bonusNormal: percent(arcaneOutputBonus(plenty, false)),
    bonusMagic: percent(arcaneOutputBonus(plenty, true)),
    essentia: formatNumber(core.essentia),
    essentiaNet: `${essentiaNet.gte(0) ? '+' : ''}${formatNumber(essentiaNet, { significantDigits: 3 })}/秒`,
    essentiaPositive: essentiaNet.gte(0),
    nodes,
    note,
  };
}

// 硅基宇宙：三项 AI 功能的状态，以及上一拍它们做了什么
export function siliconStats(core: GameCore): SiliconStats {
  const active = core.hasUniverse('silicon');
  const report = core.lastReport;
  // 说明文案里的停机顺序直接由优先级清单反着生成：加类别时不会再漏掉一句
  const sheddingOrder = [...SILICON_KEEP_PRIORITY]
    .reverse()
    .map((kind) => COLUMN_META[kind].title)
    .join(' → ');
  const did: string[] = [];
  if (report.autoRepairs > 0) did.push(`修复故障机器 ${report.autoRepairs} 台`);
  if (report.autoOverclockUp > 0) did.push(`超频升档 ${report.autoOverclockUp} 次`);
  if (report.autoOverclockDown > 0) did.push(`超频降档 ${report.autoOverclockDown} 次`);
  if (report.sheddedKinds.length > 0) {
    const names = report.sheddedKinds.map(
      (kind) => COLUMN_META[kind as MachineKind]?.title ?? kind,
    );
    did.push(`整组停机（${names.join('、')}）`);
  }

  let note: string;
  if (!active) {
    note = '未拥有硅基宇宙：三项调度均不生效。';
  } else if (did.length > 0) {
    note = `上一拍调度：${did.join('，')}。`;
  } else if (!core.siliconAutoRepair && !core.siliconAutoOverclock && !core.siliconShedding) {
    note = '三项调度均已关闭，AI 不执行任何操作。';
  } else {
    note = '上一拍无调度动作：无故障机器，供电正常。';
  }

  return {
    active,
    autoRepair: core.siliconAutoRepair,
    autoOverclock: core.siliconAutoOverclock,
    shedding: core.siliconShedding,
    sheddingOrder,
    note,
  };
}

// 单台机器的消耗与产出。发电机看「出力 / 烧矿 / 效率」，
export function abyssStats(core: GameCore): AbyssStats {
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

// 单台机器的消耗与产出。发电机看「出力 / 矿物消耗 / 效率」，
// 采矿机看「产矿 / 耗电」，制造机看「产币 / 耗电 / 矿物消耗」，存电装置看容量。
// 超频档位不为 0 时，这里给的是超频后的单台数值。
