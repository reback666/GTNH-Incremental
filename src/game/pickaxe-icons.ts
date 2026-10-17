// 镐子三条升级线的图标，由 scripts/build-pickaxe-icons.py 生成：
// - vajra（金刚杵，材质包贴图）：全部电压都是竖排动画条带（32×1056，33 拍 × 50ms，
//   与材质包 mcmeta 序列一致），本体流动、发光曲线随等级换电压色
// - collect（连锁采集，IC2 电动钻头）：两段式——左下机体保持原版不上色，
//   右上角的金属钻头随等级换电压色；满级钻头跟无尽矿石流动（32×992 条带）
// - blast：满级前静态 32×32（整体按电压上色），满级是 32×992 的 31 帧
//   动画条带（150ms/帧）——无尽矿石材质的流动渲染
// 文件名是「线-电压等级」。
import type { PickaxeLine } from '../numeric/pickaxe';
import { MAX_TIER } from '../numeric/voltage';
import { VOLTAGES } from '../content';

export const PICKAXE_MAX_TIER = MAX_TIER;

// 该图标是不是动画条带（决定界面用矿脉动画结构还是普通 <img>）
export function pickaxeIconIsStrip(line: PickaxeLine, tier: number): boolean {
  if (line === 'vajra') return true;
  return VOLTAGES[tier - 1]?.textureKey === VOLTAGES[PICKAXE_MAX_TIER - 1].textureKey;
}

// 条带动画参数（与生成脚本约定一致）：帧数、每帧毫秒
export function pickaxeStripMeta(line: PickaxeLine): { frames: number; frameMs: number } {
  if (line === 'vajra') return { frames: 33, frameMs: 50 };
  return { frames: 31, frameMs: 150 };
}

const files = import.meta.glob('../assets/pickaxe/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// 贴图里的线名（连锁采集的底图是钻头，连锁爆破是炸药）
const FILE_NAME: Record<PickaxeLine, string> = {
  vajra: 'vajra',
  collect: 'drill',
  blast: 'blast',
};

export function pickaxeIconUrl(line: PickaxeLine, tier: number): string | undefined {
  const key = VOLTAGES[tier - 1]?.textureKey;
  return files[`../assets/pickaxe/${FILE_NAME[line]}-${key}.png`];
}
