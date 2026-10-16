import type { ResearchStats, RebirthStats, AchievementStats } from './types';
import { ZERO, dec } from '../../numeric/decimal';
import { VOLTAGE_TIERS } from '../../numeric/voltage';
import { formatNumber } from '../../numeric/format';
import { formatDuration } from '../../numeric/time';
import { ACHIEVEMENTS } from '../achievements';
import { universeById } from '../universes';
import { REBIRTH_NODES, REBIRTH_ROOT, type RebirthEffectKind } from '../rebirth';
import { CHALLENGES, challengeById } from '../challenges';
import { RESEARCH_FROM_TIER, researchRemaining } from '../../numeric/research';
import { type GameCore } from '../core';
import * as C from '../constants';

export function researchStats(core: GameCore): ResearchStats {
  const report = core.lastReport;
  const target = core.researchTargetModel();
  const required = target === null ? ZERO : core.researchRequiredFor(target);
  const progress = target === null ? ZERO : core.researchProgressOf(target.id);
  const remaining = researchRemaining(progress, required);
  const targetName = target?.name ?? '';
  const targetTierName = target === null ? '' : (VOLTAGE_TIERS[target.tier - 1] ?? `T${target.tier}`);
  const used = report.computeUsed;

  const percent =
    target !== null && required.gt(0)
      ? Math.min(100, progress.div(required).times(100).toNumber())
      : 0;

  const pending = core.researchOptions().filter((model) => model.id !== target?.id);

  let note: string;
  if (target === null && pending.length === 0) {
    note = '';
  } else if (target === null) {
    note = '还没选研究项目：从下面的列表里挑一台机器，算力才会往它上面投。';
  } else {
    note = `正在研究 ${targetName}：工程进度 ${formatNumber(progress)} / ${formatNumber(required)}。`;
  }

  return {
    unlocked: core.maxTier >= RESEARCH_FROM_TIER,
    hasTarget: target !== null,
    targetName,
    targetTierName,
    progress: formatNumber(progress),
    required: target === null ? '—' : formatNumber(required),
    percent,
    eta: target !== null && used.gt(0) ? formatDuration(remaining.div(used).toNumber()) : '—',
    note,
    pending: pending.map((model) => {
      const need = core.researchRequiredFor(model);
      const have = core.researchProgressOf(model.id);
      return {
        id: model.id,
        name: model.name,
        tierName: VOLTAGE_TIERS[model.tier - 1] ?? `T${model.tier}`,
        voltageReady: model.tier <= core.maxTier,
        progress: formatNumber(have),
        required: formatNumber(need),
        percent: need.gt(0) ? Math.min(100, have.div(need).times(100).toNumber()) : 0,
      };
    }),
  };
}

const EFFECT_LABEL: Record<RebirthEffectKind, string> = {
  allMachineSpeed: '全机器速度',
  minerSpeed: '采矿机速度',
  machineSpeed: '制造机速度',
  coinOutput: 'GT 币产出',
  fuelEfficiency: '燃料效率',
  researchSpeed: '研究速度',
  computeOutput: '算力产出',
  researchCost: '研究需求',
  generatorOutput: '发电能力',
  energySaving: '全厂耗电',
  batteryCapacity: '存电容量',
  softLoading: '缺电惩罚',
  pollutionReduction: '污染产生',
  purifyBoost: '净化效果',
  faultReduction: '故障率',
  corrosionReduction: '腐蚀损伤',
  industryDeepen: '工业 · 并联加深',
  arcaneBonusUp: '奥术 · 充裕上限',
  abyssNeutral: '深渊 · 中性点',
  siliconMisjudge: '硅基 · 误判率',
};

// 减免类效果在「已生效的加成」里显示成负数
const NEGATIVE_EFFECTS = new Set<RebirthEffectKind>([
  'researchCost',
  'energySaving',
  'pollutionReduction',
  'faultReduction',
  'corrosionReduction',
]);

// 离散 / 特殊效果不走「±百分比」的通用格式，一条一句写死
const FIXED_EFFECT_TEXT: Partial<Record<RebirthEffectKind, string>> = {
  softLoading: '缺电惩罚 -50%',
  industryDeepen: '边际增长 1.05→1.04',
  arcaneBonusUp: '充裕上限 +10%',
  abyssNeutral: '中性点 30%→25%',
  siliconMisjudge: '误判率 5%→2%',
};

function effectText(kind: RebirthEffectKind, amount: string): string {
  const fixed = FIXED_EFFECT_TEXT[kind];
  if (fixed) return fixed;
  const percent = formatNumber(dec(amount).times(100));
  const sign = NEGATIVE_EFFECTS.has(kind) ? '-' : '+';
  return `${EFFECT_LABEL[kind]} ${sign}${percent}%`;
}

export function rebirthStats(core: GameCore): RebirthStats {
  const maxCables = core.maxRouteCables();
  const owned = core.rebirthNodes;
  const activeChallenge =
    core.activeChallenge === null ? null : (challengeById(core.activeChallenge) ?? null);
  return {
    cables: formatNumber(core.cables),
    count: core.rebirthCount,
    runEU: formatNumber(core.runEU),
    maxCables: maxCables === null ? '—' : formatNumber(maxCables),
    canRebirth: core.canRebirth('max'),
    riftPending: core.riftPending(),
    riftClosed: core.riftOffered,
    pendingUniverse: core.pendingUniverse ?? '',
    pendingUniverseName:
      core.pendingUniverse === null
        ? ''
        : (universeById(core.pendingUniverse)?.name ?? core.pendingUniverse),
    universes: core.universes.map((id) => universeById(id)?.name ?? id),
    activeChallengeName: activeChallenge ? activeChallenge.name : '',
    activeChallengeDesc: activeChallenge ? activeChallenge.desc : '',
    activeChallengeBonus:
      activeChallenge === null ? '' : `×${activeChallenge.bonus}`,
    activeChallengeFailed: core.activeChallenge === null ? false : core.challengeViolated,
    activeChallengeFirstDone:
      core.activeChallenge === null
        ? false
        : core.completedChallenges.includes(core.activeChallenge),
    pendingChallengeName:
      core.pendingChallenge === null
        ? ''
        : (challengeById(core.pendingChallenge)?.name ?? core.pendingChallenge),
    planckOwned: core.planckAnchor,
    planckBuyable: !core.planckAnchor && core.cables.gte(dec(C.PLANCK_ANCHOR_COST)),
    historyRows: core.runHistory.map((entry) => ({
      run: entry.run,
      route: entry.route === 'rift' ? '裂缝' : 'MAX',
      universe: entry.universe === '' ? '—' : (universeById(entry.universe)?.name ?? entry.universe),
      challenge:
        entry.challenge === ''
          ? '—'
          : (challengeById(entry.challenge)?.name ?? entry.challenge),
      challengeNote:
        entry.challenge === ''
          ? '—'
          : entry.challengePassed
            ? `×${challengeById(entry.challenge)?.bonus ?? ''} 通过`
            : '已失效',
      cables: formatNumber(dec(entry.cables)),
      duration: formatDuration(entry.seconds),
      voltage: VOLTAGE_TIERS[entry.maxTier - 1] ?? 'ULV',
    })),
    challengeRows: CHALLENGES.map((challenge) => ({
      id: challenge.id,
      name: challenge.name,
      desc: challenge.desc,
      bonus: `×${challenge.bonus}`,
      firstDone: core.completedChallenges.includes(challenge.id),
      eligible: core.canPickChallenge(challenge.id),
      requireUniverseName:
        challenge.requireUniverse === undefined
          ? ''
          : (universeById(challenge.requireUniverse)?.name ?? challenge.requireUniverse),
      selected: core.pendingChallenge === challenge.id,
    })),
    root: { ...REBIRTH_ROOT },
    nodes: REBIRTH_NODES.map((node) => ({
      id: node.id,
      layer: node.layer,
      x: node.x,
      y: node.y,
      name: node.name,
      effectText: effectText(node.effect, node.amount),
      cost: formatNumber(dec(node.cost)),
      requires: [...node.requires],
      requireUniverse: node.requireUniverse ?? '',
      requireUniverseName:
        node.requireUniverse === undefined
          ? ''
          : (universeById(node.requireUniverse)?.name ?? node.requireUniverse),
      owned: owned.includes(node.id),
      buyable: core.canBuyRebirthNode(node.id),
    })),
    bonuses: (Object.keys(EFFECT_LABEL) as RebirthEffectKind[])
      .filter((kind) => FIXED_EFFECT_TEXT[kind] === undefined)
      .map((kind) => {
        const total = REBIRTH_NODES.filter(
          (node) => node.effect === kind && owned.includes(node.id),
        ).reduce((sum, node) => sum.plus(dec(node.amount)), ZERO);
        const sign = NEGATIVE_EFFECTS.has(kind) ? '-' : '+';
        return {
          label: EFFECT_LABEL[kind],
          value: `${sign}${formatNumber(total.times(100))}%`,
        };
      }),
  };
}

export function achievementStats(core: GameCore): AchievementStats {
  const rows = ACHIEVEMENTS.map((achievement) => {
    const at = core.achieved[achievement.id];
    return {
      id: achievement.id,
      name: achievement.name,
      desc: achievement.desc,
      achieved: at !== undefined,
      at: at === undefined ? '' : formatDuration(at),
      icon: achievement.icon,
    };
  });
  return { rows, done: rows.filter((row) => row.achieved).length, total: rows.length };
}

// 累计统计：跨周目累加的那些数
export function statRows(core: GameCore): { label: string; value: string }[] {
  return [
    { label: '已玩时长', value: formatDuration(core.playSeconds) },
    { label: '最高电压', value: VOLTAGE_TIERS[core.peakTier - 1] ?? 'ULV' },
    { label: '累计发电', value: `${formatNumber(core.totalEU)} EU` },
    { label: '累计矿石', value: formatNumber(core.totalOre) },
    { label: '累计产币', value: formatNumber(core.totalCoins) },
    { label: '累计耗矿', value: formatNumber(core.totalOreSpent) },
    { label: '累计建机', value: `${core.builtMachines} 台` },
    { label: '手动挖矿', value: `${core.manualMines} 次` },
    { label: '转生次数', value: `${core.rebirthCount} 次` },
    { label: '累计线缆', value: `${formatNumber(core.totalCables)} 条` },
    {
      label: '成就',
      value: `${core.achievedCount()} / ${ACHIEVEMENTS.length}`,
    },
  ];
}

// 平行宇宙清单：转生页用来选这一个周目要带上的宇宙
