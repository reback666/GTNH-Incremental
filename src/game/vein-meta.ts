import { VOLTAGES } from '../content';
import metadata from '../assets/veins/meta.json';

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

const tiers: Record<string, VeinFxMeta> = metadata.tiers;
export const VEIN_META: VeinTierMeta[] = VOLTAGES.map((voltage, index) => ({
  ...(tiers[voltage.ore.texture] ?? { frames: 1, frameDurationsMs: [0], source: '静态' }),
  tier: index,
}));
export const VEIN_FX_META: Record<string, VeinFxMeta> = metadata.fx;
