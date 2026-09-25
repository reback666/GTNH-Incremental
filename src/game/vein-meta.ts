// 由 scripts/build-veins.py 生成，不要手改。
// 数据来自 GTNH 的 GT5-Unofficial jar：帧数与每帧时长取自贴图自带的 mcmeta。

export interface VeinTierMeta {
  tier: number;
  frames: number;
  frameDurationsMs: number[];
  source: string;
}

export interface VeinFxMeta {
  frames: number;
  frameDurationsMs: number[];
  source: string;
}

export const VEIN_META: VeinTierMeta[] = [
  { tier: 0, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 1, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 2, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 3, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 4, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 5, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 6, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 7, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 8, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 9, frames: 3, frameDurationsMs: [150, 150, 150], source: 'CUSTOM/cosmicneutronium/ore_OVERLAY.png' },
  { tier: 10, frames: 31, frameDurationsMs: [150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150], source: 'CUSTOM/infinity/block1.png' },
  { tier: 11, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 12, frames: 1, frameDurationsMs: [0], source: '静态' },
  { tier: 13, frames: 18, frameDurationsMs: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200], source: 'CUSTOM/draconium/ore_OVERLAY.png' },
];

export const VEIN_FX_META: Record<string, VeinFxMeta> = {
  halo: { frames: 1, frameDurationsMs: [50], source: 'HALO.png' },
  haloFuzzy: { frames: 8, frameDurationsMs: [50, 50, 50, 50, 50, 50, 50, 50], source: 'HALO_FUZZY.png' },
};
