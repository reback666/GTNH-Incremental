import { MAX_TIER, VOLTAGE_TIERS } from '../numeric/voltage';

// 机器分两层：
//   类别（采矿机 / 发电机 / 制造机）
//     └─ 机型：同一个电压等级下可以有若干种，玩家自己选
// 例：LV 的发电机有基础蒸汽轮机、基础内燃发电机、基础燃气轮机三种。
//
// 现有阶段每个机型只服务一个电压等级 —— 家族跨等级时是不同机型
// （基础蒸汽轮机 / 进阶蒸汽轮机 / 涡轮蒸汽轮机是三条独立条目），
// 这样最直观，也方便逐条调数值。

export type MachineCategory = 'miner' | 'generator' | 'machine' | 'storage';
export type BlockKind = 'single' | 'multiblock';

export interface MachineModel {
  id: string;
  name: string;
  category: MachineCategory;
  // 单方块还是多方块。多方块产出高、效率高，但不能按需发电（见 traits）
  block: BlockKind;
  // 适用的电压等级（1 = ULV … 14 = MAX）
  tier: number;
  // 发电机专用：燃料效率。GTNH 实测值，多方块为暂定值
  fuelEfficiency?: string;
  // 相对同等级基准的产出倍率。多方块明显更高
  outputFactor: string;
  // 相对同等级基准的建造成本倍率 —— 效率越高越贵，形成取舍
  costFactor: string;
  traits?: string[];
}

// ── 发电机 ──────────────────────────────────────────────────
// 单方块效率直接取自 GTNH wiki 的三个家族曲线；
// 多方块的效率 wiki 没给具体值，这里按「明显高于同级单方块」暂定。
const GENERATORS: MachineModel[] = [
  { id: 'g-ulv', name: '原始发电机', category: 'generator', block: 'single', tier: 1, fuelEfficiency: '0.85', outputFactor: '1', costFactor: '1' },

  { id: 'g-lv-steam', name: '基础蒸汽轮机', category: 'generator', block: 'single', tier: 2, fuelEfficiency: '0.85', outputFactor: '1', costFactor: '1' },
  { id: 'g-lv-comb', name: '基础内燃发电机', category: 'generator', block: 'single', tier: 2, fuelEfficiency: '0.95', outputFactor: '1', costFactor: '1.2' },
  { id: 'g-lv-gas', name: '基础燃气轮机', category: 'generator', block: 'single', tier: 2, fuelEfficiency: '0.95', outputFactor: '1', costFactor: '1.2' },

  { id: 'g-mv-steam', name: '进阶蒸汽轮机', category: 'generator', block: 'single', tier: 3, fuelEfficiency: '0.75', outputFactor: '1', costFactor: '0.9' },
  { id: 'g-mv-comb', name: '进阶内燃发电机', category: 'generator', block: 'single', tier: 3, fuelEfficiency: '0.90', outputFactor: '1', costFactor: '1.15' },
  { id: 'g-mv-gas', name: '进阶燃气轮机', category: 'generator', block: 'single', tier: 3, fuelEfficiency: '0.90', outputFactor: '1', costFactor: '1.15' },

  { id: 'g-hv-steam', name: '涡轮蒸汽轮机', category: 'generator', block: 'single', tier: 4, fuelEfficiency: '0.66', outputFactor: '1', costFactor: '0.85' },
  { id: 'g-hv-comb', name: '涡轮内燃发电机', category: 'generator', block: 'single', tier: 4, fuelEfficiency: '0.85', outputFactor: '1', costFactor: '1.15' },
  { id: 'g-hv-gas', name: '涡轮燃气轮机', category: 'generator', block: 'single', tier: 4, fuelEfficiency: '0.85', outputFactor: '1', costFactor: '1.15' },
  { id: 'g-hv-mb-steam', name: '大型蒸汽涡轮', category: 'generator', block: 'multiblock', tier: 4, fuelEfficiency: '0.95', outputFactor: '4', costFactor: '4', traits: ['不按需发电', '需要维护'] },

  { id: 'g-ev-comb', name: '涡轮增压内燃发电机', category: 'generator', block: 'single', tier: 5, fuelEfficiency: '0.65', outputFactor: '1', costFactor: '1' },
  { id: 'g-ev-gas', name: '涡轮燃气轮机 II', category: 'generator', block: 'single', tier: 5, fuelEfficiency: '0.60', outputFactor: '1', costFactor: '1' },
  { id: 'g-ev-plasma', name: '等离子发电机 MK-I', category: 'generator', block: 'single', tier: 5, fuelEfficiency: '0.50', outputFactor: '1.2', costFactor: '1.3' },
  { id: 'g-ev-mb-gas', name: '大型燃气涡轮', category: 'generator', block: 'multiblock', tier: 5, fuelEfficiency: '0.85', outputFactor: '4', costFactor: '4', traits: ['不按需发电', '需要维护'] },

  { id: 'g-iv-comb', name: '终极化学能释放者', category: 'generator', block: 'single', tier: 6, fuelEfficiency: '0.50', outputFactor: '1', costFactor: '0.9' },
  { id: 'g-iv-gas', name: '涡轮燃气轮机 III', category: 'generator', block: 'single', tier: 6, fuelEfficiency: '0.50', outputFactor: '1', costFactor: '0.9' },
  { id: 'g-iv-plasma', name: '等离子发电机 MK-II', category: 'generator', block: 'single', tier: 6, fuelEfficiency: '0.60', outputFactor: '1.2', costFactor: '1.3' },
  { id: 'g-iv-mb-steam', name: '特大高压蒸汽涡轮', category: 'generator', block: 'multiblock', tier: 6, fuelEfficiency: '0.90', outputFactor: '4.5', costFactor: '4.5', traits: ['不按需发电', '需要维护'] },

  { id: 'g-luv-mb-gas', name: '特大燃气涡轮', category: 'generator', block: 'multiblock', tier: 7, fuelEfficiency: '0.90', outputFactor: '4.5', costFactor: '4.5', traits: ['不按需发电', '需要维护'] },
  { id: 'g-zpm-mb-plasma', name: '大型等离子涡轮', category: 'generator', block: 'multiblock', tier: 8, fuelEfficiency: '0.95', outputFactor: '5', costFactor: '5', traits: ['不按需发电', '需要维护'] },
  { id: 'g-uv-mb-plasma', name: '特大等离子涡轮', category: 'generator', block: 'multiblock', tier: 9, fuelEfficiency: '0.95', outputFactor: '5.5', costFactor: '5.5', traits: ['不按需发电', '需要维护'] },
  { id: 'g-uiv-mb-dyson', name: '戴森云地面单元', category: 'generator', block: 'multiblock', tier: 12, fuelEfficiency: '0.99', outputFactor: '6', costFactor: '6', traits: ['不按需发电', '需要维护'] },
];

// ── 采矿机 ──────────────────────────────────────────────────
// 每个电压等级一种。LV~HV 的名字沿用 GTNH 的实测条目，
// ULV 与 HV 以上没有官方数据，暂用电压名占位。
const MINER_NAMES: Record<number, string> = {
  1: '原始采矿机',
  2: '基础采矿机',
  3: '优良采矿机',
  4: '进阶采矿机',
};

const MINERS: MachineModel[] = Array.from({ length: MAX_TIER }, (_, index) => {
  const tier = index + 1;
  return {
    id: `m-${tier}`,
    name: MINER_NAMES[tier] ?? `${VOLTAGE_TIERS[index]} 采矿机`,
    category: 'miner' as const,
    block: 'single' as const,
    tier,
    outputFactor: '1',
    costFactor: '1',
  };
});

// ── 制造机 ──────────────────────────────────────────────────
// 每个电压等级暂时只有一种，名字是占位。
// 「同一等级多种制造机、各自在省矿 / 速度之间取舍」还没定，见计划书第二十一章。
const MACHINES: MachineModel[] = Array.from({ length: MAX_TIER }, (_, index) => {
  const tier = index + 1;
  return {
    id: `c-${tier}`,
    name: `${VOLTAGE_TIERS[index]} 制造机`,
    category: 'machine' as const,
    block: 'single' as const,
    tier,
    outputFactor: '1',
    costFactor: '1',
  };
});

// ── 存电装置 ────────────────────────────────────────────────
// 计划书第七章：中期解锁存电装置，富余电力存进电池，发电不足时先放存量。
// 从 MV（tier 3）开始开放 —— 前两级还没有富余电力可存。
export const STORAGE_FROM_TIER = 3;

const STORAGES: MachineModel[] = Array.from({ length: MAX_TIER }, (_, index) => {
  const tier = index + 1;
  return {
    id: `b-${tier}`,
    name: `${VOLTAGE_TIERS[index]} 储电箱`,
    category: 'storage' as const,
    block: 'single' as const,
    tier,
    outputFactor: '1',
    costFactor: '1.5',
    traits: ['可存电'],
  };
}).filter((model) => model.tier >= STORAGE_FROM_TIER);

export const MACHINE_MODELS: MachineModel[] = [...GENERATORS, ...MINERS, ...MACHINES, ...STORAGES];

const BY_ID = new Map(MACHINE_MODELS.map((model) => [model.id, model]));

export function modelById(id: string): MachineModel {
  const model = BY_ID.get(id);
  if (!model) throw new Error(`没有这个机型：${id}`);
  return model;
}

export function modelsOf(category: MachineCategory): MachineModel[] {
  return MACHINE_MODELS.filter((model) => model.category === category);
}

// 基准机型：取该类别下 id 最短的（也就是每级第一个），用于同等级内的倍率基准
export function baseModelOf(category: MachineCategory, tier: number): MachineModel {
  const found = modelsOf(category).find((model) => model.tier === tier);
  if (!found) throw new Error(`${category} 在 tier ${tier} 没有机型`);
  return found;
}

// 只有跑配方的机器能超频：采矿机与制造机。
// 发电机没有配方，原版 GT 也不给发电机超频，所以不给档位。
export function canOverclock(model: MachineModel): boolean {
  return model.category === 'miner' || model.category === 'machine';
}
