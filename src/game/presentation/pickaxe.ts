import { PICKAXE_LINE_META, pickaxeEffectNow } from './pickaxe-effects';
import type { PickaxeLineRow, PickaxeStats, Snapshot } from './types';
import { coinName } from '../../numeric/credit';
import { formatNumber } from '../../numeric/format';
import { type PickaxeLine, blastBonus, collectMultiplier } from '../../numeric/pickaxe';
import { oreMaterial } from '../vein-materials';
import { type GameCore } from '../core';
import { modifierRows } from './machines';

export function pickaxeStats(core: GameCore): PickaxeStats {
  const veinTier = core.pickaxeVeinTier();
  const maxVeinTier = core.unlockedVeins.length ? Math.max(...core.unlockedVeins) : 0;

  const lines: PickaxeLineRow[] = PICKAXE_LINE_META.map((meta) => ({
    ...meta,
    ...pickaxeLineText(core, meta.id),
  }));

  return {
    outputPerClick: formatNumber(core.pickaxeOutput()),
    veinTier,
    veinName: oreMaterial(veinTier),
    maxVeinTier,
    maxVeinName: oreMaterial(maxVeinTier),
    lines,
    modifiers: modifierRows(core, 'pickaxe'),
  };
}

function pickaxeLineText(
  core: GameCore,
  line: PickaxeLine,
): Pick<
  PickaxeLineRow,
  | 'level'
  | 'cap'
  | 'iconTier'
  | 'effectNow'
  | 'effectNext'
  | 'canUpgrade'
  | 'locked'
  | 'cost'
  | 'coinName'
  | 'affordable'
> {
  const level = core.pickaxeLevel(line);
  const cap = core.pickaxeCap(line);
  const canUpgrade = core.canUpgradePickaxe(line);
  const iconTier = core.pickaxeLineIconTier(line);
  const locked = cap <= 0;
  const effectNow = pickaxeEffectNow(core, line);
  // 机会已经用满，就不再有下一次升级，价格与币种都留空
  const maxed = level >= cap;
  const cost = maxed ? '' : formatNumber(core.pickaxeUpgradeCostOf(line));
  const coinLabel = maxed ? '' : coinName(core.pickaxeUpgradeCoinTierOf(line));
  // 买得起吗：与机会上限无关，机会不够时也照实显示钱够不够
  const affordable = maxed ? false : core.canAffordPickaxeOf(line);
  // 「下一步效果」看的是机会还有没有剩，和买不买得起无关 ——
  // 币不够只是按钮点不动（title 会说明差多少），玩家仍然该看到升上去能拿到什么
  const hasChance = level < cap;

  if (line === 'vajra') {
    return {
      level,
      cap,
      iconTier,
      effectNow,
      effectNext: hasChance ? `可挖 ${oreMaterial(level + 1)} 矿脉` : '',
      canUpgrade,
      locked,
      cost,
      coinName: coinLabel,
      affordable,
    };
  }
  if (line === 'collect') {
    return {
      level,
      cap,
      iconTier,
      effectNow,
      effectNext: hasChance ? `产出 ×${formatNumber(collectMultiplier(level + 1))}` : '',
      canUpgrade,
      locked,
      cost,
      coinName: coinLabel,
      affordable,
    };
  }
  return {
    level,
    cap,
    iconTier,
    effectNow,
    effectNext: hasChance ? `每次点击 +${formatNumber(blastBonus(core.maxTier, level + 1))}` : '',
    canUpgrade,
    locked,
    cost,
    coinName: coinLabel,
    affordable,
  };
}

export function currentVein(core: GameCore): Snapshot['currentVein'] {
  const oreTier = core.unlockedVeins.length
    ? Math.max(...core.unlockedVeins)
    : 0;
  return { tier: oreTier, name: oreMaterial(oreTier) };
}

// 设置与风险：污染值 + 增长/净化速率 + 电网模式
