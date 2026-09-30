// 各矿脉等级的代表材料与特殊渲染（原版把特殊渲染绑在材料上，这里按材料对应到矿脉等级）。
//
// 单独放一份纯数据：矿脉面板（veins.ts，要 import 贴图）与资源条都读它，
// 材料名只有这一个来源，不会出现「面板叫锻铁、资源条叫 T0 矿石」这种对不上的情况。
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
