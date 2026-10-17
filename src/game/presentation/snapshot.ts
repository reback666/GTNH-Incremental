import type { Snapshot } from './types';
import { MAX_TIER } from '../../numeric/voltage';
import { coinName } from '../../numeric/credit';
import { formatNumber } from '../../numeric/format';
import { formatDuration } from '../../numeric/time';
import { oreMaterial } from '../vein-materials';
import { RESEARCH_FROM_TIER } from '../../numeric/research';
import { type GameCore } from '../core';
import { COLUMN_ORDER } from './catalog';
import { pickaxeStats, currentVein } from './pickaxe';
import { machineColumn } from './machines';
import { riskStats, oreRates, coinRates, powerStats } from './resources';
import { researchStats, rebirthStats, achievementStats, statRows } from './progression';
import { universeRows, arcaneStats, siliconStats, abyssStats } from './universes';
import { factoryOverview } from './factory';

export function buildSnapshot(core: GameCore): Snapshot {
  const nextTier = core.maxTier < MAX_TIER ? core.maxTier + 1 : null;
  const oreRate = oreRates(core);
  const coinRate = coinRates(core);
  const columns = COLUMN_ORDER.filter(
    kind => (kind !== 'arcane' || core.hasUniverse('arcane')) &&
      (kind !== 'abyss' || core.hasUniverse('abyss')) &&
      (kind !== 'research' || core.maxTier >= RESEARCH_FROM_TIER),
  ).map(kind => machineColumn(core, kind));
  return {
    // 资源条从高等级排到低等级：最新解锁的矿与币排在最前面
    ores: core.ores
      .slice(0, core.maxTier)
      .map((amount, index) => ({
        tier: index,
        name: oreMaterial(index),
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
      }))
      .reverse(),
    coins: core.coins
      .slice(0, core.maxTier)
      .map((amount, index) => ({
        tier: index + 1,
        name: coinName(index + 1),
        amount: formatNumber(amount),
        value: amount.toString(),
        detail: [{ label: '产出', value: `${formatNumber(coinRate[index]!)}/秒` }],
      }))
      .reverse(),
    columns,
    factory: factoryOverview(core, columns),
    maxTier: core.maxTier,
    playTime: formatDuration(core.playSeconds),
    autosaveSeconds: core.autosaveSeconds,
    totalOre: formatNumber(core.totalOre),
    totalCoins: formatNumber(core.totalCoins),
    power: powerStats(core),
    risk: riskStats(core),
    research: researchStats(core),
    rebirth: rebirthStats(core),
    achievements: achievementStats(core),
    universes: universeRows(core),
    arcane: arcaneStats(core),
    abyss: abyssStats(core),
    silicon: siliconStats(core),
    stats: statRows(core),
    devMode: core.devMode,
    displayMode: core.displayMode,
    uiTheme: core.uiTheme,
    soundEnabled: core.soundEnabled,
    soundMuted: [...core.soundMuted],
    nextTier,
    unlockCost: nextTier === null ? '—' : formatNumber(core.unlockCostOf(nextTier)),
    canUnlock: nextTier !== null && core.canUnlock(nextTier),
    veins: [...core.unlockedVeins],
    pickaxe: pickaxeStats(core),
    currentVein: currentVein(core),
  };
}

// 镐子：三条升级线各自的进度与效果文案
