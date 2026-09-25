// 矿脉贴图与特殊渲染。
//
// 素材：GTNH 的 GT5-Unofficial jar，由 scripts/build-veins.py 生成：
// 石头底与斑点形状沿用已验收的 base/tN.png，动画层逐帧套用原版贴图的帧，
// 光晕直接用原版的 HALO / HALO_FUZZY。
//
// 原版的特殊渲染只给固定几个材料，这里按材料对应到矿脉等级：
//   宇宙中子素 → CosmicNeutroniumRenderer：毛边白光晕（HALO_FUZZY，白色 30% 透明）
//   无尽       → InfinityRenderer：方形光晕 + 60% 透明度的脉动重影
import { VEIN_FX_META, VEIN_META, type VeinTierMeta } from './vein-meta';

const tierFiles = import.meta.glob('../assets/veins/t*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const fxFiles = import.meta.glob('../assets/veins/fx/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function urlsByPattern(files: Record<string, string>, pattern: RegExp): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const [assetPath, url] of Object.entries(files)) {
    const match = assetPath.match(pattern);
    if (match) urls[match[1] as string] = url;
  }
  return urls;
}

const TIER_URLS = urlsByPattern(tierFiles, /t(\d+)\.png$/i);
const FX_URLS = urlsByPattern(fxFiles, /fx\/([^/]+)\.png$/i);

// 原版把特殊渲染绑在材料上，这里换成中文材料名，并标出用哪个渲染
export type VeinFx = 'none' | 'halo' | 'fuzzy';

export interface VeinTierInfo extends VeinTierMeta {
  // 该阶段代表材料
  material: string;
  color: string;
  fx: VeinFx;
}

interface VeinDesign {
  material: string;
  color: string;
  fx: VeinFx;
}

const DESIGN: VeinDesign[] = [
  { material: '锻铁', color: '#c0c0c0', fx: 'none' },
  { material: '铜', color: '#ff8000', fx: 'none' },
  { material: '铝', color: '#6080ff', fx: 'none' },
  { material: '不锈钢', color: '#ffffff', fx: 'none' },
  { material: '钛', color: '#8000ff', fx: 'none' },
  { material: '钨钢', color: '#0020ff', fx: 'none' },
  { material: '钯', color: '#808080', fx: 'none' },
  { material: '硅岩', color: '#202020', fx: 'none' },
  { material: '中子素', color: '#ffffff', fx: 'none' },
  { material: '宇宙中子素', color: '#202020', fx: 'fuzzy' },
  { material: '无尽', color: '#ffffff', fx: 'halo' },
  { material: '秘银', color: '#6080ff', fx: 'none' },
  { material: '伊瑟利姆', color: '#ff8000', fx: 'none' },
  { material: '龙芯', color: '#ff00ff', fx: 'none' },
];

export const VEIN_TIERS: VeinTierInfo[] = VEIN_META.map((meta) => ({
  ...meta,
  ...(DESIGN[meta.tier] as VeinDesign),
}));

export function veinIconUrl(oreTier: number): string | undefined {
  return TIER_URLS[oreTier];
}

export function veinTierInfo(oreTier: number): VeinTierInfo | undefined {
  return VEIN_TIERS[oreTier];
}

// 一轮动画的总时长（毫秒），界面的帧动画按它循环
export function veinLoopMs(info: VeinTierInfo): number {
  return info.frameDurationsMs.reduce((sum, ms) => sum + ms, 0) || 1000;
}

export function haloIconUrl(name: 'halo' | 'haloFuzzy'): string | undefined {
  return FX_URLS[name];
}

export function haloIconFrames(name: 'halo' | 'haloFuzzy'): number {
  return VEIN_FX_META[name]?.frames ?? 1;
}

export function haloIconLoopMs(name: 'halo' | 'haloFuzzy'): number {
  const meta = VEIN_FX_META[name];
  if (!meta) return 1000;
  return meta.frameDurationsMs.reduce((sum, ms) => sum + ms, 0) || 1000;
}
