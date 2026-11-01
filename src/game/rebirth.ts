import { Decimal, ONE, ZERO, dec, type DecimalInput } from '../numeric/decimal';
import type { UniverseId } from './universes';
import type { AchievementIcon } from './achievements';

// 永久加成树「时空星图」（计划书第五章 + docs/redesign-plan.md M1）。
//
// 时空线缆的唯一常规用途是买这棵树上的节点。树从中心「时空锚点」向外放射出九条支线，
// 节点一次性买断、永久生效。数据分两张表：
//   - REBIRTH_EFFECTS：每种效果的名字、显示方式、图标（加新效果只改这里 + 接入点）
//   - REBIRTH_BRANCHES：每条支线的走向与各层效果（加新支线只改这里）
// 节点由支线表生成：id 形如 `speed-2a`（第 2 层 a 链），老存档的 id 保持不变。
// 数值做小（一档 4%~10%），靠层数与转生次数累积，不做一步到位的大跳。

export type RebirthEffectKind =
  | 'allMachineSpeed'
  | 'minerSpeed'
  | 'machineSpeed'
  | 'coinOutput'
  | 'fuelEfficiency'
  | 'researchSpeed'
  | 'computeOutput'
  | 'researchCost'
  | 'generatorOutput'
  | 'energySaving'
  | 'batteryCapacity'
  | 'softLoading'
  | 'pollutionReduction'
  | 'purifyBoost'
  | 'faultReduction'
  | 'corrosionReduction'
  | 'industryDeepen'
  | 'arcaneBonusUp'
  | 'abyssNeutral'
  | 'siliconMisjudge'
  | 'manualOutput'
  | 'pickaxeCost'
  | 'outageReduction'
  | 'siphonReduction'
  | 'cableGain'
  | 'offlineHours';

export interface RebirthEffect {
  // 节点名与「已生效的加成」里的标签
  name: string;
  // 单个节点的数值（加成为正；reduce 类表示减免比例）
  amount: string;
  // 显示方式：percent = ±百分比；hours = +N 小时；fixed = 写死的一句（离散规则开关）
  format: 'percent' | 'hours' | 'fixed';
  reduce?: boolean;
  fixedText?: string;
  // 第几层的节点图标（层号 1..4，越外层用越高电压的贴图）
  icon: (layer: number) => AchievementIcon;
}

const model = (id: string): AchievementIcon => ({ kind: 'model', id });
const sprite = (name: Extract<AchievementIcon, { kind: 'sprite' }>['sprite']): AchievementIcon => ({ kind: 'sprite', sprite: name });

export const REBIRTH_EFFECTS: Record<RebirthEffectKind, RebirthEffect> = {
  allMachineSpeed: { name: '全机器速度', amount: '0.04', format: 'percent', icon: (l) => model(`m-${l + 1}`) },
  minerSpeed: { name: '采矿机速度', amount: '0.04', format: 'percent', icon: (l) => model(`m-${l + 1}`) },
  machineSpeed: { name: '制造机速度', amount: '0.04', format: 'percent', icon: (l) => model(`c-${l + 1}`) },
  coinOutput: { name: 'GT 币产出', amount: '0.06', format: 'percent', icon: () => sprite('coin') },
  fuelEfficiency: {
    name: '燃料效率',
    amount: '0.05',
    format: 'percent',
    icon: (l) => model(['g-lv-steam', 'g-mv-steam', 'g-hv-mb-steam', 'g-iv-mb-steam'][l - 1]!),
  },
  researchSpeed: { name: '研究速度', amount: '0.08', format: 'percent', icon: () => sprite('clock') },
  computeOutput: { name: '算力产出', amount: '0.08', format: 'percent', icon: (l) => model(`x-${l + 6}`) },
  researchCost: { name: '研究需求', amount: '0.08', format: 'percent', reduce: true, icon: (l) => model(`r-${l + 6}`) },
  generatorOutput: { name: '发电能力', amount: '0.05', format: 'percent', icon: () => model('g-iv-plasma') },
  energySaving: { name: '全厂耗电', amount: '0.04', format: 'percent', reduce: true, icon: () => sprite('lightning') },
  batteryCapacity: { name: '存电容量', amount: '0.2', format: 'percent', icon: () => model('b-7') },
  softLoading: { name: '缺电惩罚', amount: '0.5', format: 'fixed', fixedText: '缺电惩罚 -50%', icon: () => sprite('grid') },
  pollutionReduction: { name: '污染产生', amount: '0.08', format: 'percent', reduce: true, icon: () => sprite('pollution') },
  purifyBoost: { name: '净化效果', amount: '0.1', format: 'percent', icon: () => model('p-5') },
  faultReduction: { name: '故障率', amount: '0.1', format: 'percent', reduce: true, icon: () => sprite('wrench') },
  corrosionReduction: { name: '腐蚀损伤', amount: '0.25', format: 'percent', reduce: true, icon: () => model('s-3') },
  industryDeepen: { name: '工业 · 并联加深', amount: '0.01', format: 'fixed', fixedText: '边际增长 1.05→1.04', icon: () => model('c-6') },
  arcaneBonusUp: { name: '奥术 · 充裕上限', amount: '0.1', format: 'fixed', fixedText: '充裕上限 +10%', icon: () => model('n-5') },
  abyssNeutral: { name: '深渊 · 中性点', amount: '5', format: 'fixed', fixedText: '中性点 30%→25%', icon: () => model('s-5') },
  siliconMisjudge: { name: '硅基 · 误判率', amount: '0.03', format: 'fixed', fixedText: '误判率 5%→2%', icon: () => model('x-10') },
  // ── 采掘支线：手动挖矿与镐子 ──
  manualOutput: { name: '手动挖矿产量', amount: '0.25', format: 'percent', icon: (l) => ({ kind: 'pickaxe', line: 'collect', tier: l + 1 }) },
  pickaxeCost: { name: '镐子升级价格', amount: '0.08', format: 'percent', reduce: true, icon: (l) => ({ kind: 'pickaxe', line: 'blast', tier: l + 1 }) },
  // ── 电网支线：断电概率与黑市抽成 ──
  outageReduction: { name: '断电概率', amount: '0.2', format: 'percent', reduce: true, icon: () => sprite('grid') },
  siphonReduction: { name: '黑市抽成', amount: '0.2', format: 'percent', reduce: true, icon: () => sprite('thief') },
  // ── 时序支线：转生结算与离线补算 ──
  cableGain: { name: 'MAX 线缆结算', amount: '0.05', format: 'percent', icon: () => sprite('cable') },
  offlineHours: { name: '离线补算上限', amount: '6', format: 'hours', icon: () => sprite('clock') },
};

export type RebirthBranchId =
  | 'speed'
  | 'economy'
  | 'power'
  | 'research'
  | 'mining'
  | 'stable'
  | 'timeline'
  | 'grid'
  | 'universe';

// 单链支线：每层一个效果（可带宇宙门控）；双链支线：第 1 层一个根，之后分 a / b 两条平行链
type Step = RebirthEffectKind | { effect: RebirthEffectKind; universe: UniverseId };
interface BranchSpec {
  id: RebirthBranchId;
  name: string;
  color: string;
  icon: AchievementIcon;
  root?: RebirthEffectKind;
  lanes: Step[][];
}

// 顺时针排列（第一条朝正上方）；双链与单链尽量交替，避免相邻两条的平行链挤在一起
export const REBIRTH_BRANCHES: BranchSpec[] = [
  { id: 'speed', name: '速度', color: '#5fd38d', icon: model('m-3'), root: 'allMachineSpeed', lanes: [['minerSpeed', 'minerSpeed', 'minerSpeed'], ['machineSpeed', 'machineSpeed', 'machineSpeed']] },
  { id: 'power', name: '电力', color: '#ffd84a', icon: sprite('lightning'), lanes: [['generatorOutput', 'energySaving', 'batteryCapacity', 'softLoading']] },
  { id: 'economy', name: '经济', color: '#f0c24b', icon: sprite('coin'), root: 'coinOutput', lanes: [['coinOutput', 'coinOutput', 'coinOutput'], ['fuelEfficiency', 'fuelEfficiency', 'fuelEfficiency']] },
  { id: 'grid', name: '电网', color: '#4fd6e0', icon: sprite('grid'), lanes: [['outageReduction', 'siphonReduction', 'outageReduction', 'siphonReduction']] },
  { id: 'research', name: '研究', color: '#6fa8ff', icon: model('r-7'), root: 'researchSpeed', lanes: [['computeOutput', 'computeOutput', 'computeOutput'], ['researchCost', 'researchCost', 'researchCost']] },
  { id: 'stable', name: '稳定', color: '#b48cff', icon: model('p-3'), lanes: [['pollutionReduction', 'purifyBoost', 'faultReduction', 'corrosionReduction']] },
  { id: 'mining', name: '采掘', color: '#e08a4f', icon: { kind: 'pickaxe', line: 'vajra', tier: 3 }, root: 'manualOutput', lanes: [['manualOutput', 'manualOutput', 'manualOutput'], ['pickaxeCost', 'pickaxeCost', 'pickaxeCost']] },
  {
    id: 'universe',
    name: '宇宙',
    color: '#ff7eb6',
    icon: sprite('universe'),
    lanes: [[
      { effect: 'industryDeepen', universe: 'industry' },
      { effect: 'arcaneBonusUp', universe: 'arcane' },
      { effect: 'abyssNeutral', universe: 'abyss' },
      { effect: 'siliconMisjudge', universe: 'silicon' },
    ]],
  },
  { id: 'timeline', name: '时序', color: '#e8e8f8', icon: sprite('cable'), root: 'cableGain', lanes: [['cableGain', 'cableGain', 'cableGain'], ['offlineHours', 'offlineHours', 'offlineHours']] },
];

export interface RebirthNode {
  id: string;
  branch: RebirthBranchId;
  layer: number;
  name: string;
  effect: RebirthEffectKind;
  amount: string;
  // 价格（条时空线缆）
  cost: string;
  requires: string[];
  // 需要拥有该平行宇宙才能买（宇宙支线专用）
  requireUniverse?: UniverseId;
  icon: AchievementIcon;
  // 星图坐标（画布 REBIRTH_CANVAS_SIZE 见方，根在正中心）
  x: number;
  y: number;
}

// 层价格：第一格 1 条、第二格 2 条、第三格 6 条、最外一格 12 条
export const LAYER_COST: Record<number, string> = { 1: '1', 2: '2', 3: '6', 4: '12' };

// ── 放射布局 ────────────────────────────────────────────────
// 九条支线每 40° 一根；双链支线的两条链按角度左右各偏一点（越往外间距越大，不会互相挤）。
// 屏幕角度：0° 指向右、90° 指向下。
const CANVAS_SIZE = 1040;
const CENTER = CANVAS_SIZE / 2;
const RADII: Record<number, number> = { 1: 140, 2: 255, 3: 360, 4: 460 };
const LANE_SPREAD = 10;

export const REBIRTH_CANVAS_SIZE = CANVAS_SIZE;
export const REBIRTH_ROOT = { name: '时空锚点', x: CENTER, y: CENTER } as const;

function place(angle: number, layer: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return {
    x: Math.round(CENTER + Math.cos(rad) * RADII[layer]!),
    y: Math.round(CENTER + Math.sin(rad) * RADII[layer]!),
  };
}

function makeNode(
  branch: BranchSpec,
  layer: number,
  suffix: string,
  step: Step,
  requires: string[],
  angle: number,
): RebirthNode {
  const effect = typeof step === 'string' ? step : step.effect;
  const info = REBIRTH_EFFECTS[effect];
  return {
    id: `${branch.id}-${layer}${suffix}`,
    branch: branch.id,
    layer,
    name: info.name,
    effect,
    amount: info.amount,
    cost: LAYER_COST[layer]!,
    requires,
    ...(typeof step === 'string' ? {} : { requireUniverse: step.universe }),
    icon: info.icon(layer),
    ...place(angle, layer),
  };
}

function buildNodes(): RebirthNode[] {
  const out: RebirthNode[] = [];
  REBIRTH_BRANCHES.forEach((branch, index) => {
    const angle = 270 + index * (360 / REBIRTH_BRANCHES.length);
    if (branch.root === undefined) {
      let parent: string[] = [];
      branch.lanes[0]!.forEach((step, i) => {
        const node = makeNode(branch, i + 1, '', step, parent, angle);
        out.push(node);
        parent = [node.id];
      });
      return;
    }
    const root = makeNode(branch, 1, '', branch.root, [], angle);
    out.push(root);
    branch.lanes.forEach((lane, laneIndex) => {
      const suffix = 'ab'[laneIndex]!;
      const laneAngle = angle + (laneIndex === 0 ? -LANE_SPREAD : LANE_SPREAD);
      let parent = [root.id];
      lane.forEach((step, i) => {
        const node = makeNode(branch, i + 2, suffix, step, parent, laneAngle);
        out.push(node);
        parent = [node.id];
      });
    });
  });
  return out;
}

export const REBIRTH_NODES: RebirthNode[] = buildNodes();
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

const effectCache = new WeakMap<readonly string[], { ids: string[]; totals: Map<RebirthEffectKind, Decimal> }>();

// 购买会原地修改节点列表；核对内容后复用所有效果的合计，旧周目可随核心一起回收。
export function effectTotal(owned: readonly string[], kind: RebirthEffectKind): Decimal {
  let cached = effectCache.get(owned);
  if (!cached || cached.ids.length !== owned.length || cached.ids.some((id, index) => id !== owned[index])) {
    const ids = new Set(owned);
    const totals = new Map<RebirthEffectKind, Decimal>();
    for (const node of REBIRTH_NODES) {
      if (ids.has(node.id)) totals.set(node.effect, (totals.get(node.effect) ?? ZERO).plus(dec(node.amount)));
    }
    cached = { ids: [...owned], totals };
    effectCache.set(owned, cached);
  }
  return cached.totals.get(kind) ?? ZERO;
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
