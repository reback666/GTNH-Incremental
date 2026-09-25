// 矿脉图标。
//
// 素材：GT 的灰阶矿石斑点遮罩（materialicons/<外形>/ore.png），石头底是画出来的。
// 颜色：每个电压等级取 GTNH 该阶段的代表材料，色值来自 GT 源码里材料绑定的染料。
// 彩虹：无尽这类后期材料在 GTNH 里会叠一层 RainbowOverlay（色相随时间循环），
//       这里把遮罩的亮度层级映射到色相带上，再用 CSS 的 hue-rotate 动画让它动起来。
const files = import.meta.glob('../assets/veins/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const URLS: Record<number, string> = {};
for (const [assetPath, url] of Object.entries(files)) {
  const match = assetPath.match(/t(\d+)\.png$/i);
  if (match) URLS[Number(match[1])] = url;
}

export interface VeinTierInfo {
  // 该阶段代表材料
  material: string;
  color: string;
  // 是否像原版一样做彩虹特殊渲染
  rainbow: boolean;
}

export const VEIN_TIERS: VeinTierInfo[] = [
  { material: '锻铁', color: '#c0c0c0', rainbow: false },
  { material: '铜', color: '#ff8000', rainbow: false },
  { material: '铝', color: '#6080ff', rainbow: false },
  { material: '不锈钢', color: '#ffffff', rainbow: false },
  { material: '钛', color: '#800080', rainbow: false },
  { material: '钨钢', color: '#0020ff', rainbow: false },
  { material: '钯', color: '#808080', rainbow: false },
  { material: '硅岩', color: '#202020', rainbow: false },
  { material: '中子素', color: '#ffffff', rainbow: false },
  { material: '宇宙中子素', color: '#202020', rainbow: false },
  { material: '无尽', color: '#ffffff', rainbow: true },
  { material: '秘银', color: '#6080ff', rainbow: false },
  { material: '伊瑟利姆', color: '#ff8000', rainbow: false },
  { material: '龙芯', color: '#ff00ff', rainbow: true },
];

export function veinIconUrl(oreTier: number): string | undefined {
  return URLS[oreTier];
}

export function veinTierInfo(oreTier: number): VeinTierInfo | undefined {
  return VEIN_TIERS[oreTier];
}
