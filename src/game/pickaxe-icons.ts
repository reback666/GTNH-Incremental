// 镐子三条升级线的图标，由 scripts/build-pickaxe-icons.py 生成：
// - vajra（金刚杵，材质包贴图）：**全部 14 级都是竖排动画条带**（32×1056，33 拍 × 50ms，
//   与材质包 mcmeta 序列一致），本体流动、发光曲线随等级换电压色
// - collect（连锁采集，IC2 电动钻头）：两段式——左下机体保持原版不上色，
//   右上角的金属钻头随等级换电压色；满级（14）钻头跟无尽矿石流动（32×992 条带）
// - blast：1~13 级静态 32×32（整体按电压上色），满级（14）是 32×992 的 31 帧
//   动画条带（150ms/帧）——无尽矿石材质的流动渲染
// 文件名是「线-电压等级」。
import type { PickaxeLine } from '../numeric/pickaxe';

export const PICKAXE_MAX_TIER = 14;

// 该图标是不是动画条带（决定界面用矿脉动画结构还是普通 <img>）
export function pickaxeIconIsStrip(line: PickaxeLine, tier: number): boolean {
  if (line === 'vajra') return true;
  return tier >= PICKAXE_MAX_TIER;
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

// 线 id →（电压等级 → 图标地址）
const URLS: Record<string, Record<number, string>> = {};
for (const [assetPath, url] of Object.entries(files)) {
  const match = assetPath.match(/([a-z]+)-(\d+)\.png$/i);
  if (!match) continue;
  const line = match[1] as string;
  URLS[line] = URLS[line] ?? {};
  URLS[line]![Number(match[2])] = url;
}

// 贴图里的线名（连锁采集的底图是钻头，连锁爆破是炸药）
const FILE_NAME: Record<PickaxeLine, string> = {
  vajra: 'vajra',
  collect: 'drill',
  blast: 'blast',
};

export function pickaxeIconUrl(line: PickaxeLine, tier: number): string | undefined {
  return URLS[FILE_NAME[line]]?.[tier];
}
