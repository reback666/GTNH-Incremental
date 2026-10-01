import { Decimal, ONE, ZERO, dec, type DecimalInput } from '../numeric/decimal';
import type { UniverseId } from './universes';

// 永久加成树「时空星图」（计划书第五章 + docs/转生拓展大纲.md M1）。
//
// 时空线缆的唯一用途是买这棵树上的节点。树从中心根节点「时空锚点」向四周放射出
// 六条支线（速度 / 经济 / 研究 / 电力 / 稳定 / 宇宙），老三条各有两层分叉，
// 新三条是一条直线；每条链最外再往上一层。节点是一次性买断的，买过就永久生效。
//
// 数值都做小（一档 4%~8%），靠层数与转生次数累积，不做一步到位的大跳。

export type RebirthEffectKind =
  // 采矿机与制造机都加速
  | 'allMachineSpeed'
  | 'minerSpeed'
  | 'machineSpeed'
  | 'coinOutput'
  // 发电机燃料效率（效率越高越省矿）
  | 'fuelEfficiency'
  // 研究：进度/算力、算力产量、解锁所需进度
  | 'researchSpeed'
  | 'computeOutput'
  | 'researchCost'
  // ── 电力支线 ──
  // 发电能力（发电机与魔法发电机的额定出力）
  | 'generatorOutput'
  // 全厂耗电（接电网的机器，灵气侧不受影响）
  | 'energySaving'
  // 存电装置总容量
  | 'batteryCapacity'
  // 缺电降载造成的产出缺口减半（停电的整厂停摆不受影响）
  | 'softLoading'
  // ── 稳定支线 ──
  // 污染产生
  | 'pollutionReduction'
  // 净化器效果（源质副产同步增强）
  | 'purifyBoost'
  // 超频故障率
  | 'faultReduction'
  // 深渊腐蚀的损坏速率（没带深渊宇宙时待机，买了永远生效）
  | 'corrosionReduction'
  // ── 宇宙支线（离散规则强化，数值含义见各自节点）──
  // 工业：边际成本增长 1.05^k → 1.04^k
  | 'industryDeepen'
  // 奥术：灵气充裕度的产量加成上限 +10 个百分点
  | 'arcaneBonusUp'
  // 深渊：污染驱动产出的中性点 30% → 25%
  | 'abyssNeutral'
  // 硅基：AI 误判率 5% → 2%
  | 'siliconMisjudge';

export interface RebirthNode {
  id: string;
  branch: 'speed' | 'economy' | 'research' | 'power' | 'stable' | 'universe';
  layer: number;
  name: string;
  // 效果类型与数值（正数是加成；researchCost / energySaving 等是减免）
  effect: RebirthEffectKind;
  amount: string;
  // 价格（条时空线缆）
  cost: string;
  requires: string[];
  // 需要拥有该平行宇宙才能买（宇宙支线专用）
  requireUniverse?: UniverseId;
  // 树上的坐标，界面按它摆放节点（放射布局，画布 960×960）
  x: number;
  y: number;
}

// 根节点不花钱，转生后自动点亮，只作为六条支线的起点
export const REBIRTH_ROOT = { name: '时空锚点', x: 480, y: 480 } as const;

// 层价格：往里第一格 1 条、分叉那一格 2 条、第三格 6 条、最外一格 12 条
export const LAYER_COST: Record<number, string> = { 1: '1', 2: '2', 3: '6', 4: '12' };

// ── 放射布局（六辐条对称）──────────────────────────────────
// 画布 960×960，根在正中心；六条支线各占一根辐条，恰好每 60° 一根
// （上 / 右上 / 右下 / 下 / 左下 / 左上）。带分叉的老三支线在第一层之后
// 分成两条平行链（沿辐条方向排开，横向各偏移一格），不再乱扇形。
// 屏幕角度：0° 指向右、90° 指向下。
const CANVAS_SIZE = 960;
const CENTER = CANVAS_SIZE / 2;
const RADII: Record<number, number> = { 1: 130, 2: 225, 3: 320, 4: 415 };
const SPOKE_ANGLE: Record<RebirthNode['branch'], number> = {
  speed: 270,
  power: 330,
  economy: 30,
  stable: 90,
  research: 150,
  universe: 210,
};
const LANE_OFFSET = 120; // 平行链的中心距

function spokePos(
  branch: RebirthNode['branch'],
  layer: number,
  lane: -1 | 0 | 1 = 0,
): { x: number; y: number } {
  const rad = (SPOKE_ANGLE[branch] * Math.PI) / 180;
  const r = RADII[layer]!;
  const lateral = lane * LANE_OFFSET;
  return {
    x: Math.round(CENTER + Math.cos(rad) * r - Math.sin(rad) * lateral),
    y: Math.round(CENTER + Math.sin(rad) * r + Math.cos(rad) * lateral),
  };
}

export const REBIRTH_CANVAS_SIZE = CANVAS_SIZE;

export const REBIRTH_NODES: RebirthNode[] = [
  // ── 速度支线（上，采矿机 / 制造机两条平行链）──────────────
  {
    id: 'speed-1',
    branch: 'speed',
    layer: 1,
    name: '机器速度',
    effect: 'allMachineSpeed',
    amount: '0.04',
    cost: LAYER_COST[1]!,
    requires: [],
    ...spokePos('speed', 1),
  },
  {
    id: 'speed-2a',
    branch: 'speed',
    layer: 2,
    name: '采矿机速度',
    effect: 'minerSpeed',
    amount: '0.04',
    cost: LAYER_COST[2]!,
    requires: ['speed-1'],
    ...spokePos('speed', 2, -1),
  },
  {
    id: 'speed-2b',
    branch: 'speed',
    layer: 2,
    name: '制造机速度',
    effect: 'machineSpeed',
    amount: '0.04',
    cost: LAYER_COST[2]!,
    requires: ['speed-1'],
    ...spokePos('speed', 2, 1),
  },
  {
    id: 'speed-3a',
    branch: 'speed',
    layer: 3,
    name: '采矿机速度',
    effect: 'minerSpeed',
    amount: '0.04',
    cost: LAYER_COST[3]!,
    requires: ['speed-2a'],
    ...spokePos('speed', 3, -1),
  },
  {
    id: 'speed-3b',
    branch: 'speed',
    layer: 3,
    name: '制造机速度',
    effect: 'machineSpeed',
    amount: '0.04',
    cost: LAYER_COST[3]!,
    requires: ['speed-2b'],
    ...spokePos('speed', 3, 1),
  },
  {
    id: 'speed-4a',
    branch: 'speed',
    layer: 4,
    name: '采矿机速度',
    effect: 'minerSpeed',
    amount: '0.04',
    cost: LAYER_COST[4]!,
    requires: ['speed-3a'],
    ...spokePos('speed', 4, -1),
  },
  {
    id: 'speed-4b',
    branch: 'speed',
    layer: 4,
    name: '制造机速度',
    effect: 'machineSpeed',
    amount: '0.04',
    cost: LAYER_COST[4]!,
    requires: ['speed-3b'],
    ...spokePos('speed', 4, 1),
  },

  // ── 经济支线（右下，产币 / 燃料效率两条平行链）────────────
  {
    id: 'economy-1',
    branch: 'economy',
    layer: 1,
    name: 'GT 币产出',
    effect: 'coinOutput',
    amount: '0.06',
    cost: LAYER_COST[1]!,
    requires: [],
    ...spokePos('economy', 1),
  },
  {
    id: 'economy-2a',
    branch: 'economy',
    layer: 2,
    name: 'GT 币产出',
    effect: 'coinOutput',
    amount: '0.06',
    cost: LAYER_COST[2]!,
    requires: ['economy-1'],
    ...spokePos('economy', 2, -1),
  },
  {
    id: 'economy-2b',
    branch: 'economy',
    layer: 2,
    name: '发电机燃料效率',
    effect: 'fuelEfficiency',
    amount: '0.05',
    cost: LAYER_COST[2]!,
    requires: ['economy-1'],
    ...spokePos('economy', 2, 1),
  },
  {
    id: 'economy-3a',
    branch: 'economy',
    layer: 3,
    name: 'GT 币产出',
    effect: 'coinOutput',
    amount: '0.06',
    cost: LAYER_COST[3]!,
    requires: ['economy-2a'],
    ...spokePos('economy', 3, -1),
  },
  {
    id: 'economy-3b',
    branch: 'economy',
    layer: 3,
    name: '发电机燃料效率',
    effect: 'fuelEfficiency',
    amount: '0.05',
    cost: LAYER_COST[3]!,
    requires: ['economy-2b'],
    ...spokePos('economy', 3, 1),
  },
  {
    id: 'economy-4a',
    branch: 'economy',
    layer: 4,
    name: 'GT 币产出',
    effect: 'coinOutput',
    amount: '0.06',
    cost: LAYER_COST[4]!,
    requires: ['economy-3a'],
    ...spokePos('economy', 4, -1),
  },
  {
    id: 'economy-4b',
    branch: 'economy',
    layer: 4,
    name: '发电机燃料效率',
    effect: 'fuelEfficiency',
    amount: '0.05',
    cost: LAYER_COST[4]!,
    requires: ['economy-3b'],
    ...spokePos('economy', 4, 1),
  },

  // ── 研究支线（左下，算力 / 研究需求两条平行链）────────────
  {
    id: 'research-1',
    branch: 'research',
    layer: 1,
    name: '研究速度',
    effect: 'researchSpeed',
    amount: '0.08',
    cost: LAYER_COST[1]!,
    requires: [],
    ...spokePos('research', 1),
  },
  {
    id: 'research-2a',
    branch: 'research',
    layer: 2,
    name: '计算机算力',
    effect: 'computeOutput',
    amount: '0.08',
    cost: LAYER_COST[2]!,
    requires: ['research-1'],
    ...spokePos('research', 2, -1),
  },
  {
    id: 'research-2b',
    branch: 'research',
    layer: 2,
    name: '研究需求',
    effect: 'researchCost',
    amount: '0.08',
    cost: LAYER_COST[2]!,
    requires: ['research-1'],
    ...spokePos('research', 2, 1),
  },
  {
    id: 'research-3a',
    branch: 'research',
    layer: 3,
    name: '计算机算力',
    effect: 'computeOutput',
    amount: '0.08',
    cost: LAYER_COST[3]!,
    requires: ['research-2a'],
    ...spokePos('research', 3, -1),
  },
  {
    id: 'research-3b',
    branch: 'research',
    layer: 3,
    name: '研究需求',
    effect: 'researchCost',
    amount: '0.08',
    cost: LAYER_COST[3]!,
    requires: ['research-2b'],
    ...spokePos('research', 3, 1),
  },
  {
    id: 'research-4a',
    branch: 'research',
    layer: 4,
    name: '计算机算力',
    effect: 'computeOutput',
    amount: '0.08',
    cost: LAYER_COST[4]!,
    requires: ['research-3a'],
    ...spokePos('research', 4, -1),
  },
  {
    id: 'research-4b',
    branch: 'research',
    layer: 4,
    name: '研究需求',
    effect: 'researchCost',
    amount: '0.08',
    cost: LAYER_COST[4]!,
    requires: ['research-3b'],
    ...spokePos('research', 4, 1),
  },

  // ── 电力支线（右上，一条直线）────────────────────────────
  {
    id: 'power-1',
    branch: 'power',
    layer: 1,
    name: '发电能力',
    effect: 'generatorOutput',
    amount: '0.05',
    cost: LAYER_COST[1]!,
    requires: [],
    ...spokePos('power', 1),
  },
  {
    id: 'power-2',
    branch: 'power',
    layer: 2,
    name: '全厂耗电',
    effect: 'energySaving',
    amount: '0.04',
    cost: LAYER_COST[2]!,
    requires: ['power-1'],
    ...spokePos('power', 2),
  },
  {
    id: 'power-3',
    branch: 'power',
    layer: 3,
    name: '存电容量',
    effect: 'batteryCapacity',
    amount: '0.2',
    cost: LAYER_COST[3]!,
    requires: ['power-2'],
    ...spokePos('power', 3),
  },
  {
    id: 'power-4',
    branch: 'power',
    layer: 4,
    name: '降载缓冲',
    effect: 'softLoading',
    amount: '0.5',
    cost: LAYER_COST[4]!,
    requires: ['power-3'],
    ...spokePos('power', 4),
  },

  // ── 稳定支线（下，一条直线）──────────────────────────────
  {
    id: 'stable-1',
    branch: 'stable',
    layer: 1,
    name: '污染产生',
    effect: 'pollutionReduction',
    amount: '0.08',
    cost: LAYER_COST[1]!,
    requires: [],
    ...spokePos('stable', 1),
  },
  {
    id: 'stable-2',
    branch: 'stable',
    layer: 2,
    name: '净化效果',
    effect: 'purifyBoost',
    amount: '0.1',
    cost: LAYER_COST[2]!,
    requires: ['stable-1'],
    ...spokePos('stable', 2),
  },
  {
    id: 'stable-3',
    branch: 'stable',
    layer: 3,
    name: '故障率',
    effect: 'faultReduction',
    amount: '0.1',
    cost: LAYER_COST[3]!,
    requires: ['stable-2'],
    ...spokePos('stable', 3),
  },
  {
    id: 'stable-4',
    branch: 'stable',
    layer: 4,
    name: '腐蚀损伤',
    effect: 'corrosionReduction',
    amount: '0.25',
    cost: LAYER_COST[4]!,
    requires: ['stable-3'],
    ...spokePos('stable', 4),
  },

  // ── 宇宙支线（左上，一条直线，需要拥有对应宇宙才能买）────
  {
    id: 'universe-1',
    branch: 'universe',
    layer: 1,
    name: '工业 · 并联加深',
    effect: 'industryDeepen',
    amount: '0.01',
    cost: LAYER_COST[1]!,
    requires: [],
    requireUniverse: 'industry',
    ...spokePos('universe', 1),
  },
  {
    id: 'universe-2',
    branch: 'universe',
    layer: 2,
    name: '奥术 · 充裕上限',
    effect: 'arcaneBonusUp',
    amount: '0.1',
    cost: LAYER_COST[2]!,
    requires: ['universe-1'],
    requireUniverse: 'arcane',
    ...spokePos('universe', 2),
  },
  {
    id: 'universe-3',
    branch: 'universe',
    layer: 3,
    name: '深渊 · 中性点',
    effect: 'abyssNeutral',
    amount: '5',
    cost: LAYER_COST[3]!,
    requires: ['universe-2'],
    requireUniverse: 'abyss',
    ...spokePos('universe', 3),
  },
  {
    id: 'universe-4',
    branch: 'universe',
    layer: 4,
    name: '硅基 · 误判率',
    effect: 'siliconMisjudge',
    amount: '0.03',
    cost: LAYER_COST[4]!,
    requires: ['universe-3'],
    requireUniverse: 'silicon',
    ...spokePos('universe', 4),
  },
];

const BY_ID = new Map(REBIRTH_NODES.map((node) => [node.id, node]));

export function rebirthNodeById(id: string): RebirthNode | undefined {
  return BY_ID.get(id);
}

// 前置节点是否都买过了
export function prerequisitesMet(owned: readonly string[], node: RebirthNode): boolean {
  return node.requires.every((id) => owned.includes(id));
}

// 能不能买：没买过、前置齐、线缆够；宇宙支线还要求已拥有对应宇宙
export function canBuyNode(
  owned: readonly string[],
  node: RebirthNode,
  cables: DecimalInput,
  universes: readonly string[] = [],
): boolean {
  if (owned.includes(node.id)) return false;
  if (!prerequisitesMet(owned, node)) return false;
  if (node.requireUniverse !== undefined && !universes.includes(node.requireUniverse)) {
    return false;
  }
  return dec(cables).gte(dec(node.cost));
}

// 某一类效果的累计加成（0.04 + 0.04 = 0.08 这种）
export function effectTotal(owned: readonly string[], kind: RebirthEffectKind): Decimal {
  let total = ZERO;
  for (const node of REBIRTH_NODES) {
    if (node.effect !== kind || !owned.includes(node.id)) continue;
    total = total.plus(dec(node.amount));
  }
  return total;
}

// 加成倍率：1 + 累计值
export function bonusMultiplier(owned: readonly string[], kind: RebirthEffectKind): Decimal {
  return ONE.plus(effectTotal(owned, kind));
}

// 研究需求的减免倍率：1 - 累计值，最低留 20%（不让减免把需求抹平）
export function researchCostMultiplier(owned: readonly string[]): Decimal {
  return Decimal.max(dec('0.2'), ONE.minus(effectTotal(owned, 'researchCost')));
}

// 采矿机 / 制造机的速度倍率
export function minerSpeedMultiplier(owned: readonly string[]): Decimal {
  return ONE
    .plus(effectTotal(owned, 'allMachineSpeed'))
    .plus(effectTotal(owned, 'minerSpeed'));
}

export function machineSpeedMultiplier(owned: readonly string[]): Decimal {
  return ONE
    .plus(effectTotal(owned, 'allMachineSpeed'))
    .plus(effectTotal(owned, 'machineSpeed'));
}
