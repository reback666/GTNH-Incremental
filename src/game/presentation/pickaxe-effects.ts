import { oreMaterial } from '../vein-materials';
import type { GameCore } from '../core';
import { type PickaxeLine, collectMultiplier, blastBonus } from '../../numeric/pickaxe';
import { formatNumber } from '../../numeric/format';

export const PICKAXE_LINE_META: { id: PickaxeLine; name: string; hint: string }[] = [
  { id: 'vajra', name: '金刚杵', hint: '决定镐子能挖到哪一级矿脉，从 LV 起每个电压给 1 次机会' },
  {
    id: 'collect',
    name: '连锁采集',
    hint: '每次点击的产出翻倍，结算在连锁爆破之后',
  },
  {
    id: 'blast',
    name: '连锁爆破',
    hint: '每次点击额外加一笔矿石，每笔的数值在机会产生时就按当时的电压定死',
  },
];

export function pickaxeEffectNow(core: GameCore, line: PickaxeLine): string {
  const level = core.pickaxeLevel(line);
  if (line === 'vajra') return `可挖 ${oreMaterial(level)} 矿脉`;
  if (line === 'collect') {
    return level > 0 ? `产出 ×${formatNumber(collectMultiplier(level))}` : '尚未升级';
  }
  return level > 0 ? `每次点击 +${formatNumber(blastBonus(core.maxTier, level))}` : '尚未升级';
}

