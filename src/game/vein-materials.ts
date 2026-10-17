// 矿脉面板和资源条共用从内容配置派生的材料列表，名称不在界面中另写一份。
import { VOLTAGES } from '../content';
import type { VeinFx } from '../content/types';
export type { VeinFx } from '../content/types';

export interface VeinMaterial {
  material: string;
  fx: VeinFx;
}

export const VEIN_MATERIALS: readonly VeinMaterial[] = VOLTAGES.map(({ ore }) => ({
  material: ore.material,
  fx: ore.fx,
}));

// 矿石的显示名：直接用这一级的材料名（锻铁、铜、……），不再带 T0 / T1 这类等级代称。
// 表覆盖全部电压等级，越界只是兜底、正常不会走到。
export function oreMaterial(oreTier: number): string {
  return VEIN_MATERIALS[oreTier]?.material ?? `T${oreTier} 矿石`;
}
