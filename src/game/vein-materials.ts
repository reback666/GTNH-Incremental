// 各矿脉等级的代表材料与特殊渲染（原版把特殊渲染绑在材料上，这里按材料对应到矿脉等级）。
//
// 单独放一份纯数据：矿脉面板（veins.ts，要 import 贴图）与资源条都读它，
// 材料名只有这一个来源——矿石的显示名就是这里的材料名（见 oreMaterial），
// 不会出现两处叫法对不上的情况。
export type VeinFx = 'none' | 'halo' | 'fuzzy';

export interface VeinMaterial {
  material: string;
  fx: VeinFx;
}

export const VEIN_MATERIALS: readonly VeinMaterial[] = [
  { material: '锻铁', fx: 'none' },
  { material: '铜', fx: 'none' },
  { material: '铝', fx: 'none' },
  { material: '不锈钢', fx: 'none' },
  { material: '钛', fx: 'none' },
  { material: '钨钢', fx: 'none' },
  { material: '钯', fx: 'none' },
  { material: '硅岩', fx: 'none' },
  { material: '中子素', fx: 'none' },
  { material: '宇宙中子素', fx: 'fuzzy' },
  { material: '无尽', fx: 'halo' },
  { material: '龙芯', fx: 'none' },
  { material: '海珀珍', fx: 'none' },
  { material: '时空', fx: 'none' },
];

// 矿石的显示名：直接用这一级的材料名（锻铁、铜、……），不再带 T0 / T1 这类等级代称。
// 表 14 级齐全，越界只是兜底、正常不会走到。
export function oreMaterial(oreTier: number): string {
  return VEIN_MATERIALS[oreTier]?.material ?? `T${oreTier} 矿石`;
}
