// 镐子三条升级线的图标：1~13 级是静态 32×32（按电压上色），
// 满级（14）是**竖排 31 帧的动画条带**（32×992）——无尽矿石材质的流动渲染，
// 由 scripts/build-pickaxe-icons.py 生成，与无尽矿脉贴图同源同节奏（150ms/帧）。
// 文件名是「线-电压等级」（vajra-1 = 金刚杵的 ULV 色，vajra-14 = 金刚杵的满级动画条带）。
import type { PickaxeLine } from '../numeric/pickaxe';

// 界面渲染满级条带时要用这两个参数搭帧动画（与 scripts/build-pickaxe-icons.py 约定一致）
export const PICKAXE_MAX_TIER = 14;
export const PICKAXE_STRIP = { frames: 31, frameMs: 150 };

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
