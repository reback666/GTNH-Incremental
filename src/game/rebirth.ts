import { Decimal, ONE, ZERO, dec, type DecimalInput } from '../numeric/decimal';

// 永久加成树（计划书第五章）。
//
// 时空线缆的唯一用途是买这棵树上的节点。树从一个根节点「时空锚点」向外分三条支线
// （速度 / 经济 / 研究），每条支线先一格主干，再分叉成两个方向，各再往下一层。
// 节点是一次性买断的，买过就永久生效，跨周目保留。
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
  | 'researchCost';

export interface RebirthNode {
  id: string;
  branch: 'speed' | 'economy' | 'research';
  layer: number;
  name: string;
  // 效果类型与数值（正数是加成；researchCost 是减免）
  effect: RebirthEffectKind;
  amount: string;
  // 价格（条时空线缆）
  cost: string;
  requires: string[];
  // 树上的坐标，界面按它摆放节点（容器 660×330）
  x: number;
  y: number;
}

// 根节点不花钱，转生后自动点亮，只作为三条支线的起点
export const REBIRTH_ROOT = { name: '时空锚点', x: 330, y: 22 } as const;

// 层价格：往里第一格 1 条、分叉那一格 2 条、最外一格 6 条
export const LAYER_COST: Record<number, string> = { 1: '1', 2: '2', 3: '6' };

const SPEED_X = 110;
const ECONOMY_X = 330;
const RESEARCH_X = 550;
const LAYER_Y: Record<number, number> = { 1: 92, 2: 168, 3: 262 };
const SPREAD = 52;

export const REBIRTH_NODES: RebirthNode[] = [
  // ── 速度支线 ──────────────────────────────────────────────
  {
    id: 'speed-1',
    branch: 'speed',
    layer: 1,
    name: '机器速度',
    effect: 'allMachineSpeed',
    amount: '0.04',
    cost: LAYER_COST[1]!,
    requires: [],
    x: SPEED_X,
    y: LAYER_Y[1]!,
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
    x: SPEED_X - SPREAD,
    y: LAYER_Y[2]!,
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
    x: SPEED_X + SPREAD,
    y: LAYER_Y[2]!,
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
    x: SPEED_X - SPREAD,
    y: LAYER_Y[3]!,
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
    x: SPEED_X + SPREAD,
    y: LAYER_Y[3]!,
  },

  // ── 经济支线 ──────────────────────────────────────────────
  {
    id: 'economy-1',
    branch: 'economy',
    layer: 1,
    name: 'GT 币产出',
    effect: 'coinOutput',
    amount: '0.06',
    cost: LAYER_COST[1]!,
    requires: [],
    x: ECONOMY_X,
    y: LAYER_Y[1]!,
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
    x: ECONOMY_X - SPREAD,
    y: LAYER_Y[2]!,
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
    x: ECONOMY_X + SPREAD,
    y: LAYER_Y[2]!,
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
    x: ECONOMY_X - SPREAD,
    y: LAYER_Y[3]!,
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
    x: ECONOMY_X + SPREAD,
    y: LAYER_Y[3]!,
  },

  // ── 研究支线 ──────────────────────────────────────────────
  {
    id: 'research-1',
    branch: 'research',
    layer: 1,
    name: '研究速度',
    effect: 'researchSpeed',
    amount: '0.08',
    cost: LAYER_COST[1]!,
    requires: [],
    x: RESEARCH_X,
    y: LAYER_Y[1]!,
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
    x: RESEARCH_X - SPREAD,
    y: LAYER_Y[2]!,
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
    x: RESEARCH_X + SPREAD,
    y: LAYER_Y[2]!,
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
    x: RESEARCH_X - SPREAD,
    y: LAYER_Y[3]!,
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
    x: RESEARCH_X + SPREAD,
    y: LAYER_Y[3]!,
  },
];

const BY_ID = new Map(REBIRTH_NODES.map((node) => [node.id, node]));

export function rebirthNodeById(id: string): RebirthNode | undefined {
  return BY_ID.get(id);
}

export function isNodeOwned(owned: readonly string[], id: string): boolean {
  return owned.includes(id);
}

// 前置节点是否都买过了
export function prerequisitesMet(owned: readonly string[], node: RebirthNode): boolean {
  return node.requires.every((id) => owned.includes(id));
}

// 能不能买：没买过、前置齐、线缆够
export function canBuyNode(
  owned: readonly string[],
  node: RebirthNode,
  cables: DecimalInput,
): boolean {
  if (isNodeOwned(owned, node.id)) return false;
  if (!prerequisitesMet(owned, node)) return false;
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
