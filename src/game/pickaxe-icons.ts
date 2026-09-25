// 镐子（金刚杵）图标：14 级电压各一张，由 scripts/build-pickaxe-icons.py 生成。
// 文件名是电压等级序号（v-1 = ULV 色，v-14 = MAX 的彩虹）。
const files = import.meta.glob('../assets/pickaxe/v-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const URLS: Record<number, string> = {};
for (const [assetPath, url] of Object.entries(files)) {
  const match = assetPath.match(/v-(\d+)\.png$/i);
  if (match) URLS[Number(match[1])] = url;
}

export function pickaxeIconUrl(tier: number): string | undefined {
  return URLS[tier];
}

export const PICKAXE_ICON_COUNT = Object.keys(URLS).length;
