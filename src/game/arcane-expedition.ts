import { Decimal, ZERO, ONE, dec, pow } from '../numeric/decimal';
import { MAX_TIER, VOLTAGE_TIERS } from '../numeric/voltage';

export interface ArcaneContext {
  active: boolean;
  maxTier: number;
  firstMachineCost(tier: number): Decimal;
  energyEU(tier: number): Decimal;
  canPay(tier: number, amount: Decimal): boolean;
  pay(tier: number, amount: Decimal): boolean;
  // 集成方可显式退款；未提供时 pay 必须接受负数，表示向同一结算币种退回。
  refund?(tier: number, amount: Decimal): void;
}

export const ARCANE_ASPECTS = [
  { id: 'air', name: '风', effect: '调查工时降低' },
  { id: 'earth', name: '地', effect: '魔法采矿供给提高' },
  { id: 'fire', name: '火', effect: '魔法制造产能提高' },
  { id: 'water', name: '水', effect: '质量修复工时降低' },
  { id: 'order', name: '秩序', effect: '灵气需求降低' },
  { id: 'entropy', name: '混沌', effect: '丰饶培养大幅增长概率提高' },
] as const;
export type ArcaneAspect = typeof ARCANE_ASPECTS[number]['id'];
export type ArcaneSpectrum = Record<ArcaneAspect, string>;
export const ARCANE_TYPES = [
  { id: 'standard', name: '标准', factor: '1', effect: '稳定供能' },
  { id: 'pure', name: '纯净', factor: '0.95', effect: '同级及以下修复工时 ×0.85' },
  { id: 'sinister', name: '凶险', factor: '0.90', effect: '同级及以下研究工时 ×0.90' },
  { id: 'tainted', name: '污染', factor: '0.85', effect: '需要封闭支架，可净化' },
  { id: 'unstable', name: '震荡', factor: '0.90', effect: '同级及以下丰饶 +5 概率增加 2 个百分点' },
  { id: 'hungry', name: '饕餮', factor: '0.70', effect: '最多五次受控同化，魔法产能每次 +2%' },
] as const;
export type ArcaneNodeType = typeof ARCANE_TYPES[number]['id'];
export const ARCANE_QUALITIES = [
  { id: 'fading', name: '凋零', factor: '0.5' },
  { id: 'pale', name: '苍白', factor: '0.75' },
  { id: 'normal', name: '普通', factor: '1' },
  { id: 'bright', name: '明亮', factor: '1.25' },
] as const;
export type ArcaneQuality = typeof ARCANE_QUALITIES[number]['id'];
export const ARCANE_REGIONS = [
  { id: 'plains', name: '平原荒野', tier: 2, research: 0, types: [70, 10, 8, 5, 6, 1], aspects: [20, 25, 15, 15, 15, 10] },
  { id: 'forest', name: '魔法森林', tier: 3, research: 0, types: [40, 35, 5, 5, 13, 2], aspects: [15, 20, 10, 30, 20, 5] },
  { id: 'twilight', name: '暮色遗迹', tier: 4, research: 0, types: [45, 15, 15, 5, 15, 5], aspects: [20, 20, 10, 15, 20, 15] },
  { id: 'nether', name: '下界遗址', tier: 5, research: 0, types: [35, 3, 20, 12, 23, 7], aspects: [10, 15, 35, 5, 10, 25] },
  { id: 'outer', name: '外域遗迹', tier: 7, research: 5, types: [20, 5, 25, 15, 25, 10], aspects: [15, 10, 10, 10, 20, 35] },
] as const;
export type ArcaneRegion = typeof ARCANE_REGIONS[number]['id'];
export const ARCANE_RESEARCH = [
  { id: 'A0', name: '魔导入门', tier: 2, cost: '1', seconds: 0, requires: '奥术宇宙已激活', unlock: '固定节点、平原调查' },
  { id: 'A1', name: '稳定与搬运', tier: 3, cost: '2', seconds: 900, requires: '本轮已评估 3 颗节点', unlock: '稳妥封装、培养、调谐、升阶' },
  { id: 'A2', name: '充能并网', tier: 4, cost: '4', seconds: 1800, requires: '安装至少 3 颗，规模合计至少 200', unlock: '中继效率 100%、候选扩容、净化' },
  { id: 'A3', name: '注魔矩阵', tier: 5, cost: '6', seconds: 3600, requires: '本轮已评估 5 颗节点', unlock: 'I 级附魔、花园共生' },
  { id: 'A4', name: '节点培养进阶', tier: 6, cost: '8', seconds: 5400, requires: '已评估 8 颗，一颗培养至少 5 次', unlock: '明亮改造、饕餮定向与同化、II 级附魔' },
  { id: 'A5', name: '高阶节点理论', tier: 7, cost: '12', seconds: 7200, requires: '一颗培养至少 8 次，安装至少两种类型', unlock: '外域调查、血仪式、第四调查点' },
  { id: 'A6', name: 'KAMI 主题终章', tier: 8, cost: '20', seconds: 10800, requires: '已评估 10 颗，安装规模合计至少 600', unlock: 'III 级工业附魔、宇宙终章' },
] as const;
export type ArcaneResearchId = typeof ARCANE_RESEARCH[number]['id'] | 'garden' | 'blood';
export type ArcaneTarget = { kind: 'type'; value: ArcaneNodeType } | { kind: 'aspect'; value: ArcaneAspect };
export type ArcaneTask =
  | { kind: 'safe-pack' | 'repair' | 'cultivate' | 'purify' | 'upgrade-node' }
  | { kind: 'abundant'; blood?: boolean }
  | { kind: 'attune'; aspect: ArcaneAspect }
  | { kind: 'assimilate'; donorId: string };

export interface ArcaneNode {
  id: string;
  tier: number;
  type: ArcaneNodeType;
  quality: ArcaneQuality;
  size: number;
  baseAspects: ArcaneSpectrum;
  attunement: ArcaneAspect | null;
  cultivations: number;
  assimilations: number;
  protected: boolean;
  location: 'candidate' | 'packing' | 'jar' | 'installed';
  standId: string | null;
  surveyId: string | null;
}
export interface ArcaneStand { id: string; tier: number; enclosed: boolean }
export interface ArcaneUpgrade { work: string; targetTier: number }
export interface ArcaneSurvey {
  id: string; tier: number; nodeTier: number; region: ArcaneRegion;
  target: ArcaneTarget | null; misses: number; work: string; paused: boolean;
  candidates: string[]; upgrade: ArcaneUpgrade | null;
}
export interface ArcaneJob {
  id: string; nodeId: string; task: ArcaneTask; tier: number; paid: string;
  totalWork: string; work: string; started: boolean; returnStandId: string | null;
  outcome: number | null; chanceFive: string | null;
}
export interface ArcaneBench {
  id: string; tier: number; paused: boolean; jobs: ArcaneJob[]; upgrade: ArcaneUpgrade | null;
}
export interface ArcaneResearchJob {
  id: ArcaneResearchId; tier: number; paid: string; totalWork: string; work: string; paused: boolean;
}
export interface ArcaneCodex {
  types: ArcaneNodeType[]; qualities: ArcaneQuality[]; aspects: ArcaneAspect[];
  regions: ArcaneRegion[]; research: ArcaneResearchId[];
}
export interface ArcaneState {
  version: 1; seed: number; nextId: number; research: number; firstNodeGranted: boolean;
  evaluated: number; nodes: ArcaneNode[]; stands: ArcaneStand[]; surveys: ArcaneSurvey[];
  benches: ArcaneBench[]; researchJob: ArcaneResearchJob | null;
  garden: boolean; blood: boolean; directPurchases: Record<string, number>;
  codex: ArcaneCodex; discoveries: number; completedJobs: number; notices: string[];
}
export type ArcaneCommand =
  | { type: 'research'; id: ArcaneResearchId }
  | { type: 'buy-node' | 'build-survey' | 'build-bench'; tier: number }
  | { type: 'buy-stand'; tier: number; enclosed?: boolean }
  | { type: 'enclose-stand'; standId: string }
  | { type: 'install'; nodeId: string; standId: string }
  | { type: 'uninstall'; nodeId: string }
  | { type: 'protect'; nodeId: string; value: boolean }
  | { type: 'discard' | 'pack'; nodeIds: string[] }
  | { type: 'configure-survey'; surveyId: string; region: ArcaneRegion; tier: number; target: ArcaneTarget | null }
  | { type: 'upgrade-survey' | 'upgrade-bench'; id: string }
  | { type: 'pause'; facility: 'survey' | 'bench' | 'research'; id: string; value: boolean }
  | { type: 'enqueue'; benchId: string; nodeId: string; task: ArcaneTask; count?: number }
  | { type: 'cancel-job'; benchId: string; jobId: string };

export interface ArcaneNetwork {
  vis: Decimal;
  aspects: Record<ArcaneAspect, Decimal>;
  fireMultiplier: Decimal; earthMultiplier: Decimal; demandMultiplier: Decimal;
  surveyTimeFactor: Decimal; repairTimeFactor: Decimal;
  pureMaxTier: number; sinisterMaxTier: number; unstableMaxTier: number;
  hungryAssimilationsByTier: number[];
  magicMultiplierByTier: Decimal[];
  enchantmentLevel: number;
}
export interface ArcanePrice { tier: number; amount: string }
export interface ArcaneActionView {
  label: string; command: ArcaneCommand; costs: ArcanePrice[]; enabled: boolean; reason: string;
}
export interface ArcaneJobOption extends ArcaneActionView {
  nodeId: string; seconds: string; gains: string; chanceFive: string | null;
  batches: { count: number; amount: string; seconds: string; enabled: boolean }[];
}
export interface ArcaneNodeView extends ArcaneNode {
  typeName: string; qualityName: string; tierName: string; aspectsText: string;
  output: string; potentialOutput: string; status: string; busy: boolean;
  stopWarning: string; actions: ArcaneActionView[];
}
export interface ArcaneView {
  active: boolean; research: number; evaluated: number; vis: string; energy: string;
  aspects: { id: ArcaneAspect; name: string; share: string; effect: string }[];
  network: { fireMultiplier: string; earthMultiplier: string; demandMultiplier: string; enchantmentLevel: number };
  researchOptions: (ArcaneActionView & { id: ArcaneResearchId; requires: string; unlock: string; seconds: number; completed: boolean })[];
  researchJob: (ArcaneResearchJob & { name: string }) | null;
  buildOptions: ArcaneActionView[];
  regions: { id: ArcaneRegion; name: string; unlocked: boolean }[];
  targets: { label: string; target: ArcaneTarget | null }[];
  tiers: { tier: number; name: string }[];
  surveys: (ArcaneSurvey & { capacity: number; limit: number; duration: number; status: string; upgradeAction: ArcaneActionView })[];
  nodes: ArcaneNodeView[];
  stands: ArcaneStand[];
  benches: (ArcaneBench & { options: ArcaneJobOption[]; upgradeAction: ArcaneActionView })[];
  codex: ArcaneCodex; discoveries: number; completedJobs: number; notices: string[];
}

const aspects = ARCANE_ASPECTS.map(a => a.id);
const nodeTypes = ARCANE_TYPES.map(t => t.id);
const qualities = ARCANE_QUALITIES.map(q => q.id);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const integer = (value: unknown, min: number, max: number, fallback = min): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
const tierValid = (tier: number, max = MAX_TIER): boolean => Number.isInteger(tier) && tier >= 2 && tier <= Math.min(MAX_TIER, max);
const tierName = (tier: number): string => VOLTAGE_TIERS[tier - 1] ?? String(tier);
const amountText = (value: unknown, fallback = '0'): string => {
  if (typeof value !== 'string' || value.length > 160 || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return fallback;
  const d = dec(value);
  return d.isFinite() && d.gte(0) ? d.toString() : fallback;
};
function spectrum(values?: unknown): ArcaneSpectrum {
  const data = record(values);
  const ds = aspects.map(a => dec(amountText(data[a])));
  if (ds.some(d => d.lt('0.1') || d.gt('0.45')) || !ds.reduce((s, d) => s.plus(d), ZERO).minus(1).abs().lt('1e-30')) {
    const equal = ONE.div(6);
    return Object.fromEntries(aspects.map((a, i) => [a, (i === 5 ? ONE.minus(equal.times(5)) : equal).toString()])) as ArcaneSpectrum;
  }
  ds[5] = ONE.minus(ds.slice(0, 5).reduce((s, d) => s.plus(d), ZERO));
  return Object.fromEntries(aspects.map((a, i) => [a, ds[i].toString()])) as ArcaneSpectrum;
}
export function arcaneNodeAspects(node: ArcaneNode): ArcaneSpectrum {
  return Object.fromEntries(aspects.map(a => [a, dec(node.baseAspects[a]).plus(node.attunement ? (a === node.attunement ? '0.1' : '-0.02') : '0').toString()])) as ArcaneSpectrum;
}
const typeMeta = (type: ArcaneNodeType) => ARCANE_TYPES.find(t => t.id === type)!;
const qualityMeta = (quality: ArcaneQuality) => ARCANE_QUALITIES.find(q => q.id === quality)!;
const sizeLimit = (node: ArcaneNode): number => node.type === 'hungry' ? 260 : 160;
const isGrowth = (task: ArcaneTask): boolean => task.kind === 'cultivate' || task.kind === 'abundant';
const researchMeta = (id: ArcaneResearchId) => id === 'garden'
  ? { id, name: '花园共生', tier: 5, cost: '2', seconds: 2700, requires: '完成 A3', unlock: '水与地份额合计至少 40% 时，规模培养工时 ×0.85' }
  : id === 'blood'
    ? { id, name: '血仪式', tier: 7, cost: '4', seconds: 3600, requires: '完成 A5', unlock: '丰饶培养可逐次额外付费，结果 +1' }
    : ARCANE_RESEARCH.find(r => r.id === id)!;
const taskName = (task: ArcaneTask): string => ({ 'safe-pack': '稳妥封装', repair: '质量修复', cultivate: '稳定培养', abundant: '丰饶培养', attune: '要素调谐', 'upgrade-node': '节点升阶', purify: '污染净化', assimilate: '受控同化' })[task.kind];

function initialState(): ArcaneState {
  return { version: 1, seed: 20261024, nextId: 1, research: -1, firstNodeGranted: false, evaluated: 0,
    nodes: [], stands: [], surveys: [], benches: [], researchJob: null, garden: false, blood: false,
    directPurchases: {}, codex: { types: [], qualities: [], aspects: [], regions: [], research: [] },
    discoveries: 0, completedJobs: 0, notices: [] };
}

interface Quote { tier: number; paid: Decimal; seconds: Decimal; gains: string }

export class ArcaneExpedition {
  state: ArcaneState;

  constructor(raw?: unknown) {
    this.state = initialState();
    if (raw !== undefined) this.restore(raw);
  }

  private id(prefix: string): string { return `${prefix}-${this.state.nextId++}`; }
  private random(): number {
    this.state.seed = (Math.imul(this.state.seed, 1664525) + 1013904223) >>> 0;
    return this.state.seed / 4294967296;
  }
  private weighted(weights: readonly number[]): number {
    let x = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
    return weights.length - 1;
  }
  private notice(text: string): void { this.state.notices = [...this.state.notices, text].slice(-20); }
  private cost(context: ArcaneContext, tier: number, factor: string, count = 0): Decimal {
    return context.firstMachineCost(tier).times(factor).times(pow('1.1', count)).floor();
  }
  private refund(context: ArcaneContext, tier: number, amount: Decimal): void {
    if (amount.isZero()) return;
    if (context.refund) context.refund(tier, amount);
    else if (!context.pay(tier, amount.negated())) throw new Error('奥术退款失败：请提供 refund 回调，或令 pay 支持负数退款');
  }
  private pay(context: ArcaneContext, costs: ArcanePrice[]): boolean {
    const totals = new Map<number, Decimal>();
    for (const c of costs) totals.set(c.tier, (totals.get(c.tier) ?? ZERO).plus(c.amount));
    const entries = [...totals];
    if (entries.some(([tier, amount]) => !amount.isFinite() || amount.lt(0) || !context.canPay(tier, amount))) return false;
    const paid: [number, Decimal][] = [];
    for (const [tier, amount] of entries) {
      if (!context.pay(tier, amount)) { for (const [t, a] of paid) this.refund(context, t, a); return false; }
      paid.push([tier, amount]);
    }
    return true;
  }
  private purchased(context: ArcaneContext, tier: number, factor: string, count = 0): boolean {
    return this.pay(context, [{ tier, amount: this.cost(context, tier, factor, count).toString() }]);
  }
  private allJobs(): ArcaneJob[] { return this.state.benches.flatMap(b => b.jobs); }
  private locked(id: string): boolean {
    return this.allJobs().some(j => j.nodeId === id || (j.task.kind === 'assimilate' && j.task.donorId === id));
  }
  private processing(id: string): boolean { return this.allJobs().some(j => j.started && j.nodeId === id); }
  private installed(): ArcaneNode[] { return this.state.nodes.filter(n => n.location === 'installed' && !!n.standId); }
  private output(node: ArcaneNode): Decimal {
    return dec(String(node.size)).div(10).times(qualityMeta(node.quality).factor).times(typeMeta(node.type).factor)
      .times(pow('4', node.tier - 2)).times(this.state.research >= 2 ? '1' : '0.8');
  }
  private online(node: ArcaneNode): boolean {
    const stand = this.state.stands.find(s => s.id === node.standId);
    return node.location === 'installed' && !this.processing(node.id) && !!stand && stand.tier === node.tier && (node.type !== 'tainted' || stand.enclosed);
  }
  network(context: ArcaneContext): ArcaneNetwork {
    const stands = new Map(this.state.stands.map(stand => [stand.id, stand]));
    const processing = new Set(this.allJobs().filter(job => job.started).map(job => job.nodeId));
    const active = context.active ? this.state.nodes.filter(n => {
      const stand = n.standId ? stands.get(n.standId) : undefined;
      return n.location === 'installed' && !processing.has(n.id) && !!stand && stand.tier === n.tier && (n.type !== 'tainted' || stand.enclosed);
    }) : [];
    const samples = active.map(node => ({ output: this.output(node), spectrum: arcaneNodeAspects(node) }));
    const vis = samples.reduce((sum, sample) => sum.plus(sample.output), ZERO);
    const shares = Object.fromEntries(aspects.map(a => [a, vis.gt(0) ? samples.reduce((sum, sample) => sum.plus(sample.output.times(sample.spectrum[a])), ZERO).div(vis) : ZERO])) as Record<ArcaneAspect, Decimal>;
    const highest = (type: ArcaneNodeType) => active.filter(n => n.type === type).reduce((max, n) => Math.max(max, n.tier), 0);
    const hungry = Array.from({ length: MAX_TIER + 1 }, (_, tier) => active.filter(n => n.type === 'hungry' && n.tier >= tier).reduce((max, n) => Math.max(max, n.assimilations), 0));
    return { vis, aspects: shares, fireMultiplier: ONE.plus(shares.fire.times('0.2')), earthMultiplier: ONE.plus(shares.earth.times('0.2')),
      demandMultiplier: ONE.minus(shares.order.times('0.2')), surveyTimeFactor: ONE.minus(shares.air.times('0.25')),
      repairTimeFactor: ONE.minus(shares.water.times('0.25')), pureMaxTier: highest('pure'), sinisterMaxTier: highest('sinister'),
      unstableMaxTier: highest('unstable'), hungryAssimilationsByTier: hungry,
      magicMultiplierByTier: hungry.map(k => ONE.plus(dec(String(k)).times('0.02'))),
      enchantmentLevel: !context.active ? 0 : this.state.research >= 6 ? 3 : this.state.research >= 4 ? 2 : this.state.research >= 3 ? 1 : 0 };
  }
  visOutput(context: ArcaneContext): Decimal { return this.network(context).vis; }
  private surveyCapacity(): number { return this.state.research >= 2 ? 12 : 6; }
  private surveyLimit(): number { return this.state.research >= 5 ? 4 : this.state.research >= 3 ? 3 : this.state.research >= 1 ? 2 : 1; }
  private surveySeconds(): number { return this.state.research >= 5 ? 600 : this.state.research >= 3 ? 720 : this.state.research >= 1 ? 960 : 1200; }
  private surveyRunning(s: ArcaneSurvey, context: ArcaneContext): boolean {
    return !s.paused && (s.upgrade !== null || (s.candidates.length < this.surveyCapacity() && this.regionAllowed(s.region, context) && s.nodeTier <= context.maxTier));
  }
  energyDemand(context: ArcaneContext): Decimal {
    if (!context.active) return ZERO;
    let total = ZERO;
    for (const s of this.state.surveys) if (this.surveyRunning(s, context)) total = total.plus(context.energyEU(s.tier).times('0.25'));
    for (const b of this.state.benches) if (!b.paused && (b.upgrade || b.jobs.length > 0)) total = total.plus(context.energyEU(b.tier).times('0.25'));
    if (this.state.researchJob && !this.state.researchJob.paused) total = total.plus(context.energyEU(this.state.researchJob.tier).times('0.25'));
    return total;
  }
  private regionAllowed(region: ArcaneRegion, context: ArcaneContext): boolean {
    const r = ARCANE_REGIONS.find(r => r.id === region);
    return !!r && context.maxTier >= r.tier && this.state.research >= r.research;
  }
  private targetValid(target: ArcaneTarget | null): boolean {
    return target === null || (!!target && typeof target === 'object' && ((target.kind === 'aspect' && aspects.includes(target.value)) || (target.kind === 'type' && nodeTypes.includes(target.value) && (target.value !== 'hungry' || this.state.research >= 4))));
  }
  private pityLimit(target: ArcaneTarget | null): number {
    if (!target || (target.kind === 'type' && target.value === 'standard')) return 0;
    return target.kind === 'aspect' || target.value === 'pure' || target.value === 'unstable' ? 6 : target.value === 'hungry' ? 20 : 12;
  }
  private noteNode(node: ArcaneNode, region?: ArcaneRegion): void {
    const codex = this.state.codex;
    if (!codex.types.includes(node.type)) codex.types.push(node.type);
    if (!codex.qualities.includes(node.quality)) codex.qualities.push(node.quality);
    for (const a of aspects) if (!codex.aspects.includes(a)) codex.aspects.push(a);
    if (region && !codex.regions.includes(region)) codex.regions.push(region);
  }
  private createNode(tier: number, size: number): ArcaneNode {
    const node: ArcaneNode = { id: this.id('node'), tier, type: 'standard', quality: 'normal', size, baseAspects: spectrum(), attunement: null,
      cultivations: 0, assimilations: 0, protected: false, location: 'jar', standId: null, surveyId: null };
    this.state.nodes.push(node); this.state.evaluated++; return node;
  }
  private discover(s: ArcaneSurvey): void {
    const r = ARCANE_REGIONS.find(r => r.id === s.region)!;
    const type = nodeTypes[this.weighted(r.types)];
    const quality = qualities[this.weighted([5, 25, 50, 20])];
    const size = 40 + Math.floor(this.random() * 61);
    let primary = this.weighted(r.aspects);
    const target = s.target;
    const natural = target === null || (target.kind === 'type' ? target.value === type : target.value === aspects[primary]);
    s.misses = natural ? 0 : s.misses + 1;
    const limit = this.pityLimit(target);
    const guaranteed = !natural && limit > 0 && s.misses >= limit;
    if (guaranteed && target?.kind === 'aspect') primary = aspects.indexOf(target.value);
    const secondary = this.weighted(r.aspects.map((w, i) => i === primary ? 0 : w));
    const extra = 25 + Math.floor(this.random() * 11);
    const base = Object.fromEntries(aspects.map((a, i) => [a, dec('0.1').plus(i === primary ? dec(String(extra)).div(100) : i === secondary ? dec(String(40 - extra)).div(100) : ZERO).toString()])) as ArcaneSpectrum;
    const node = this.createNode(s.nodeTier, guaranteed ? 60 : size);
    node.type = guaranteed && target?.kind === 'type' ? target.value : type;
    node.quality = guaranteed ? 'normal' : quality;
    node.baseAspects = base; node.location = 'candidate'; node.surveyId = s.id;
    if (guaranteed) s.misses = 0;
    s.candidates.push(node.id); this.state.discoveries++; this.noteNode(node, s.region);
    if (node.quality === 'bright' || guaranteed) this.notice(`调查发现${qualityMeta(node.quality).name}${typeMeta(node.type).name}节点 ${node.id}${guaranteed ? '（定向保障）' : ''}`);
  }
  private researchReason(id: ArcaneResearchId, context: ArcaneContext): string {
    const meta = researchMeta(id);
    if (!meta) return '未知研究';
    if (context.maxTier < meta.tier) return `需要 ${tierName(meta.tier)} 工业电压`;
    if (this.state.researchJob) return '研究位置已占用';
    if (id === 'garden') return this.state.garden ? '已完成' : this.state.research < 3 ? '需要完成 A3' : '';
    if (id === 'blood') return this.state.blood ? '已完成' : this.state.research < 5 ? '需要完成 A5' : '';
    const index = ARCANE_RESEARCH.findIndex(r => r.id === id);
    if (index !== this.state.research + 1) return index <= this.state.research ? '已完成' : '请先完成上一项研究';
    const installed = this.installed();
    const total = installed.reduce((sum, n) => sum + n.size, 0);
    if (index === 1 && this.state.evaluated < 3) return meta.requires;
    if (index === 2 && (installed.length < 3 || total < 200)) return meta.requires;
    if (index === 3 && this.state.evaluated < 5) return meta.requires;
    if (index === 4 && (this.state.evaluated < 8 || !this.state.nodes.some(n => n.cultivations >= 5))) return meta.requires;
    if (index === 5 && (!this.state.nodes.some(n => n.cultivations >= 8) || new Set(installed.map(n => n.type)).size < 2)) return meta.requires;
    if (index === 6 && (this.state.evaluated < 10 || total < 600)) return meta.requires;
    return '';
  }
  private finishResearch(id: ArcaneResearchId): void {
    if (id === 'garden') this.state.garden = true;
    else if (id === 'blood') this.state.blood = true;
    else this.state.research = ARCANE_RESEARCH.findIndex(r => r.id === id);
    if (!this.state.codex.research.includes(id)) this.state.codex.research.push(id);
    if (id === 'A0' && !this.state.firstNodeGranted) {
      this.state.firstNodeGranted = true;
      const node = this.createNode(2, 80);
      const stand: ArcaneStand = { id: this.id('stand'), tier: 2, enclosed: false };
      this.state.stands.push(stand); node.standId = stand.id; node.location = 'installed'; this.noteNode(node);
    }
    this.notice(`已完成${researchMeta(id).name}`);
  }

  private projected(node: ArcaneNode, bench: ArcaneBench): ArcaneNode {
    const projected = clone(node);
    for (const j of bench.jobs.filter(j => j.nodeId === node.id)) this.applyTask(projected, j.task, j.outcome ?? this.minimumGain(j.task));
    return projected;
  }
  private minimumGain(task: ArcaneTask): number { return isGrowth(task) ? 2 + (task.kind === 'abundant' && task.blood ? 1 : 0) : 0; }
  private applyTask(node: ArcaneNode, task: ArcaneTask, gain: number): void {
    if (isGrowth(task)) { node.size = Math.min(sizeLimit(node), node.size + gain); node.cultivations++; }
    else if (task.kind === 'repair') node.quality = qualities[Math.min(3, qualities.indexOf(node.quality) + 1)];
    else if (task.kind === 'attune') node.attunement = task.aspect;
    else if (task.kind === 'purify') node.type = 'standard';
    else if (task.kind === 'upgrade-node') node.tier++;
    else if (task.kind === 'safe-pack') node.location = 'jar';
    else if (task.kind === 'assimilate') { node.size = Math.min(260, node.size + gain); node.assimilations++; }
  }
  private quote(node: ArcaneNode, task: ArcaneTask, bench: ArcaneBench, context: ArcaneContext, ownJobId?: string): Quote | null {
    if (bench.upgrade || node.tier > bench.tier || node.tier > context.maxTier) return null;
    if (task.kind !== 'safe-pack' && (node.location === 'candidate' || node.location === 'packing')) return null;
    let tier = node.tier, factor = '', seconds = dec('0'), gains = '';
    if (task.kind === 'safe-pack') {
      if (this.state.research < 1 || (node.location !== 'candidate' && node.location !== 'packing')) return null;
      factor = '0.2'; seconds = dec('300');
    } else if (task.kind === 'repair') {
      const q = qualities.indexOf(node.quality);
      if (this.state.research < 1 || q === 3 || (q === 2 && this.state.research < 4)) return null;
      factor = ['0.02', '0.04', '0.4'][q]; seconds = dec(String([900, 1800, 5400][q]));
    } else if (isGrowth(task)) {
      if (this.state.research < 1 || node.cultivations >= 10 || node.size >= sizeLimit(node)) return null;
      if (task.kind === 'abundant' && task.blood && !this.state.blood) return null;
      const paid = context.firstMachineCost(tier).times(task.kind === 'cultivate' ? '0.004' : '0.005').times(pow('1.15', node.cultivations)).floor();
      const extra = task.kind === 'abundant' && task.blood ? this.cost(context, tier, '0.05') : ZERO;
      const min = Math.min(sizeLimit(node) - node.size, this.minimumGain(task));
      const max = Math.min(sizeLimit(node) - node.size, task.kind === 'cultivate' ? 2 : 5 + (task.kind === 'abundant' && task.blood ? 1 : 0));
      gains = min === max ? `规模 +${min}` : `规模 +${min}～${max}`;
      return { tier, paid: paid.plus(extra), seconds: dec('600').times(pow('1.1', node.cultivations)), gains };
    } else if (task.kind === 'attune') {
      if (this.state.research < 1 || !aspects.includes(task.aspect) || node.attunement === task.aspect) return null;
      factor = '0.2'; seconds = dec('900');
    } else if (task.kind === 'purify') {
      if (this.state.research < 2 || node.type !== 'tainted') return null;
      factor = '0.3'; seconds = dec('2700');
    } else if (task.kind === 'upgrade-node') {
      tier++;
      if (this.state.research < 1 || !tierValid(tier, context.maxTier) || tier > bench.tier) return null;
      factor = '0.1'; seconds = dec('900');
    } else if (task.kind === 'assimilate') {
      const donor = this.state.nodes.find(n => n.id === task.donorId);
      const otherLock = this.allJobs().some(j => j.id !== ownJobId && (j.nodeId === task.donorId || (j.task.kind === 'assimilate' && j.task.donorId === task.donorId)));
      if (this.state.research < 4 || node.type !== 'hungry' || node.assimilations >= 5 || node.size >= 260 || !donor || donor.id === node.id || donor.tier !== node.tier || donor.location !== 'jar' || donor.protected || otherLock) return null;
      factor = '0.5'; seconds = dec('1800');
      const base = dec(String(donor.size)).times(qualityMeta(donor.quality).factor).times('0.2');
      gains = `规模 +${Decimal.min(260 - node.size, base.times('0.8').floor()).toString()}～${Decimal.min(260 - node.size, base.times('1.2').floor()).toString()}，消耗 ${donor.id}`;
    } else return null;
    return { tier, paid: this.cost(context, tier, factor), seconds, gains };
  }

  act(command: ArcaneCommand, context: ArcaneContext): boolean {
    if (!context.active || !command || typeof command !== 'object' || !tierValid(context.maxTier)) return false;
    const s = this.state;
    if (command.type === 'research') {
      const meta = researchMeta(command.id);
      if (!meta || this.researchReason(command.id, context) || !this.purchased(context, meta.tier, meta.cost)) return false;
      if (meta.seconds === 0) this.finishResearch(command.id);
      else s.researchJob = { id: command.id, tier: meta.tier, paid: this.cost(context, meta.tier, meta.cost).toString(), totalWork: String(meta.seconds), work: '0', paused: false };
      return true;
    }
    if (s.research < 0) return false;
    if (command.type === 'buy-node' || command.type === 'build-survey' || command.type === 'build-bench' || command.type === 'buy-stand') {
      if (command.type === 'buy-stand' && command.enclosed !== undefined && typeof command.enclosed !== 'boolean') return false;
      const tier = command.tier;
      if (!tierValid(tier, context.maxTier) || (command.type === 'build-survey' && s.surveys.length >= this.surveyLimit())) return false;
      const count = s.directPurchases[String(tier)] ?? 0;
      const factor = command.type === 'buy-node' ? '1.5' : command.type === 'build-survey' ? '2' : command.type === 'build-bench' ? '0.5' : '0.15';
      const prices = [{ tier, amount: this.cost(context, tier, factor, command.type === 'buy-node' ? count : 0).toString() }];
      if (command.type === 'buy-stand' && command.enclosed) prices.push({ tier, amount: this.cost(context, tier, '0.3').toString() });
      if (!this.pay(context, prices)) return false;
      if (command.type === 'buy-node') { s.directPurchases[String(tier)] = count + 1; const n = this.createNode(tier, 50); this.noteNode(n); }
      else if (command.type === 'build-survey') s.surveys.push({ id: this.id('survey'), tier, nodeTier: tier, region: 'plains', target: null, misses: 0, work: '0', paused: false, candidates: [], upgrade: null });
      else if (command.type === 'build-bench') s.benches.push({ id: this.id('bench'), tier, paused: false, jobs: [], upgrade: null });
      else s.stands.push({ id: this.id('stand'), tier, enclosed: command.type === 'buy-stand' && command.enclosed === true });
      return true;
    }
    if (command.type === 'protect') {
      const n = s.nodes.find(n => n.id === command.nodeId);
      if (!n || typeof command.value !== 'boolean' || this.allJobs().some(j => j.task.kind === 'assimilate' && j.task.donorId === n.id)) return false;
      n.protected = command.value; return true;
    }
    if (command.type === 'install' || command.type === 'uninstall') {
      const n = s.nodes.find(n => n.id === command.nodeId);
      if (!n || this.locked(n.id)) return false;
      if (command.type === 'uninstall') {
        if (n.location !== 'installed') return false;
        n.location = 'jar'; n.standId = null; return true;
      }
      const stand = s.stands.find(st => st.id === command.standId);
      if (n.location !== 'jar' || !stand || stand.tier !== n.tier || (n.type === 'tainted' && !stand.enclosed) || s.nodes.some(other => other.standId === stand.id)) return false;
      n.location = 'installed'; n.standId = stand.id; return true;
    }
    if (command.type === 'enclose-stand') {
      const stand = s.stands.find(st => st.id === command.standId);
      if (!stand || stand.enclosed || !this.purchased(context, stand.tier, '0.3')) return false;
      stand.enclosed = true; return true;
    }
    if (command.type === 'pack' || command.type === 'discard') {
      if (!Array.isArray(command.nodeIds) || !command.nodeIds.length || new Set(command.nodeIds).size !== command.nodeIds.length) return false;
      const nodes = command.nodeIds.map(id => s.nodes.find(n => n.id === id));
      if (nodes.some(n => !n || this.locked(n.id) || (command.type === 'discard' ? n.protected || n.location === 'installed' : n.location !== 'candidate'))) return false;
      if (command.type === 'pack' && !this.pay(context, nodes.map(n => ({ tier: n!.tier, amount: this.cost(context, n!.tier, '0.1').toString() })))) return false;
      for (const node of nodes as ArcaneNode[]) {
        this.removeCandidate(node);
        if (command.type === 'discard') s.nodes = s.nodes.filter(n => n.id !== node.id);
        else { node.location = 'jar'; if (this.random() < 0.05) node.quality = qualities[Math.max(0, qualities.indexOf(node.quality) - 1)]; }
      }
      return true;
    }
    if (command.type === 'configure-survey') {
      const survey = s.surveys.find(p => p.id === command.surveyId);
      if (!survey || survey.upgrade || !tierValid(command.tier, Math.min(survey.tier, context.maxTier)) || !this.regionAllowed(command.region, context) || !this.targetValid(command.target)) return false;
      if (survey.nodeTier === command.tier && survey.region === command.region && JSON.stringify(survey.target) === JSON.stringify(command.target)) return false;
      survey.region = command.region; survey.nodeTier = command.tier; survey.target = clone(command.target); survey.work = '0'; survey.misses = 0; return true;
    }
    if (command.type === 'pause') {
      const item = command.facility === 'survey' ? s.surveys.find(p => p.id === command.id) : command.facility === 'bench' ? s.benches.find(b => b.id === command.id) : command.facility === 'research' && s.researchJob?.id === command.id ? s.researchJob : null;
      if (!item || typeof command.value !== 'boolean' || item.paused === command.value) return false;
      item.paused = command.value; return true;
    }
    if (command.type === 'upgrade-survey' || command.type === 'upgrade-bench') {
      const item = command.type === 'upgrade-survey' ? s.surveys.find(p => p.id === command.id) : s.benches.find(b => b.id === command.id);
      if (!item || s.research < 1 || item.upgrade || ('jobs' in item && item.jobs.length > 0) || !tierValid(item.tier + 1, context.maxTier) || !this.purchased(context, item.tier + 1, command.type === 'upgrade-survey' ? '0.75' : '0.25')) return false;
      item.upgrade = { work: '0', targetTier: item.tier + 1 }; return true;
    }
    if (command.type === 'enqueue') {
      const bench = s.benches.find(b => b.id === command.benchId);
      const node = s.nodes.find(n => n.id === command.nodeId);
      const task = command.task;
      const count = command.count ?? 1;
      if (!bench || !node || !task || typeof task !== 'object' || !Number.isInteger(count) || count < 1 || count > 10 || (count > 1 && !isGrowth(task))) return false;
      if (this.allJobs().some(j => (j.nodeId === node.id && !bench.jobs.includes(j)) || (j.task.kind === 'assimilate' && j.task.donorId === node.id))) return false;
      const projected = this.projected(node, bench);
      const quotes: Quote[] = [];
      for (let i = 0; i < count; i++) {
        const q = this.quote(projected, task, bench, context);
        if (!q) return false;
        quotes.push(q); this.applyTask(projected, task, this.minimumGain(task));
      }
      if (!this.pay(context, quotes.map(q => ({ tier: q.tier, amount: q.paid.toString() })))) return false;
      for (const q of quotes) bench.jobs.push({ id: this.id('job'), nodeId: node.id, task: clone(task), tier: q.tier, paid: q.paid.toString(), totalWork: q.seconds.toString(), work: '0', started: false, returnStandId: null, outcome: null, chanceFive: null });
      if (task.kind === 'safe-pack') { this.removeCandidate(node); node.location = 'packing'; }
      return true;
    }
    if (command.type === 'cancel-job') {
      const bench = s.benches.find(b => b.id === command.benchId);
      const job = bench?.jobs.find(j => j.id === command.jobId);
      if (!bench || !job) return false;
      if (!job.started) this.refund(context, job.tier, dec(job.paid));
      bench.jobs = bench.jobs.filter(j => j !== job);
      if (job.started && job.task.kind !== 'safe-pack') this.restoreStand(job);
      else if (job.started) this.returnCandidate(job.nodeId);
      else if (job.task.kind === 'safe-pack') this.returnCandidate(job.nodeId);
      this.revalidate(bench, context); return true;
    }
    return false;
  }

  private removeCandidate(node: ArcaneNode): void {
    const survey = this.state.surveys.find(p => p.id === node.surveyId);
    if (survey) survey.candidates = survey.candidates.filter(id => id !== node.id);
  }
  private returnCandidate(id: string): void {
    const node = this.state.nodes.find(n => n.id === id);
    if (!node) return;
    const survey = this.state.surveys.find(p => p.id === node.surveyId);
    if (survey) { node.location = 'candidate'; if (!survey.candidates.includes(id)) survey.candidates.push(id); }
  }
  private restoreStand(job: ArcaneJob): void {
    const node = this.state.nodes.find(n => n.id === job.nodeId);
    if (!node) return;
    const stand = this.state.stands.find(s => s.id === job.returnStandId);
    if (stand && !this.state.nodes.some(n => n.standId === stand.id)) {
      if (job.task.kind === 'upgrade-node' && node.tier === job.tier) stand.tier = node.tier;
      if (stand.tier === node.tier && (node.type !== 'tainted' || stand.enclosed)) { node.location = 'installed'; node.standId = stand.id; return; }
    }
    if (node.location !== 'candidate' && node.location !== 'packing') node.location = 'jar';
    if (job.returnStandId) this.notice(`${node.id} 的原支架已占用，节点保留在缸中`);
  }
  private revalidate(bench: ArcaneBench, context: ArcaneContext): void {
    const projected = new Map<string, ArcaneNode>();
    const retained: ArcaneJob[] = [];
    for (const job of bench.jobs) {
      const node = this.state.nodes.find(n => n.id === job.nodeId);
      if (!node) continue;
      const future = projected.get(node.id) ?? clone(node);
      if (!job.started) {
        const q = this.quote(future, job.task, bench, context, job.id);
        if (!q || q.tier !== job.tier || !q.paid.eq(job.paid) || !q.seconds.eq(job.totalWork)) {
          this.refund(context, job.tier, dec(job.paid));
          if (job.task.kind === 'safe-pack') this.returnCandidate(job.nodeId);
          this.notice(`${taskName(job.task)}前置已改变，未开工费用全退`); continue;
        }
      }
      retained.push(job); this.applyTask(future, job.task, job.outcome ?? this.minimumGain(job.task)); projected.set(node.id, future);
    }
    bench.jobs = retained;
  }
  private startJobs(context: ArcaneContext): void {
    for (const b of this.state.benches) {
      if (b.paused || b.upgrade || !b.jobs.length) continue;
      this.revalidate(b, context);
      const job = b.jobs[0];
      if (!job || job.started) continue;
      const node = this.state.nodes.find(n => n.id === job.nodeId)!;
      job.started = true; job.returnStandId = node.standId;
      if (node.standId) { node.standId = null; node.location = 'jar'; }
    }
    // 所有同时开工的节点先退出供能，再固定各次随机结果。
    const net = this.network(context);
    for (const b of this.state.benches) {
      const job = b.jobs[0];
      if (!job?.started || job.outcome !== null) continue;
      const node = this.state.nodes.find(n => n.id === job.nodeId)!;
      if (job.task.kind === 'abundant') {
        const chance = Decimal.min('0.125', dec('0.05').plus(net.aspects.entropy.times('0.1')).plus(net.unstableMaxTier >= node.tier ? '0.02' : '0'));
        job.chanceFive = chance.toString();
        const roll = dec(String(this.random()));
        job.outcome = (roll.lt(chance) ? 5 : roll.lt(chance.plus('0.35')) ? 3 : 2) + (job.task.blood ? 1 : 0);
      } else if (job.task.kind === 'assimilate') {
        const donorId = job.task.donorId;
        const donor = this.state.nodes.find(n => n.id === donorId)!;
        const roll = this.random();
        job.outcome = dec(String(donor.size)).times('0.2').times(qualityMeta(donor.quality).factor).times(roll < 0.25 ? '0.8' : roll < 0.75 ? '1' : '1.2').floor().toNumber();
        this.state.nodes = this.state.nodes.filter(n => n.id !== donorId);
      } else job.outcome = job.task.kind === 'cultivate' ? 2 : 0;
    }
  }
  private jobFactor(job: ArcaneJob, net: ArcaneNetwork): Decimal {
    if (job.task.kind === 'repair') return net.repairTimeFactor.times(net.pureMaxTier >= job.tier ? '0.85' : '1');
    if (isGrowth(job.task) && this.state.garden && net.aspects.water.plus(net.aspects.earth).gte('0.4')) return dec('0.85');
    return ONE;
  }

  prepare(context: ArcaneContext): void {
    if (context.active) this.startJobs(context);
  }

  tick(seconds: number, powerRatio: number, context: ArcaneContext): void {
    if (!context.active || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(powerRatio) || powerRatio <= 0) return;
    let remaining = dec(String(Math.min(seconds, 72 * 60 * 60)));
    const power = dec(String(Math.min(1, powerRatio)));
    while (remaining.gt(0)) {
      this.startJobs(context);
      const net = this.network(context);
      const work: { remaining: Decimal; rate: Decimal; advance: (delta: Decimal) => void; finish: () => void }[] = [];
      for (const s of this.state.surveys) {
        if (!this.surveyRunning(s, context)) continue;
        if (s.upgrade) {
          const upgrade = s.upgrade;
          work.push({ remaining: dec('900').minus(upgrade.work), rate: power, advance: d => { upgrade.work = dec(upgrade.work).plus(d).toString(); }, finish: () => { s.tier = upgrade.targetTier; s.upgrade = null; } });
        } else work.push({ remaining: dec(String(this.surveySeconds())).minus(s.work), rate: power.div(net.surveyTimeFactor), advance: d => { s.work = dec(s.work).plus(d).toString(); }, finish: () => { s.work = '0'; this.discover(s); } });
      }
      for (const b of this.state.benches) {
        if (b.paused) continue;
        if (b.upgrade) {
          const upgrade = b.upgrade;
          work.push({ remaining: dec('900').minus(upgrade.work), rate: power, advance: d => { upgrade.work = dec(upgrade.work).plus(d).toString(); }, finish: () => { b.tier = upgrade.targetTier; b.upgrade = null; } });
        } else if (b.jobs[0]?.started) {
          const j = b.jobs[0];
          work.push({ remaining: dec(j.totalWork).minus(j.work), rate: power.div(this.jobFactor(j, net)), advance: d => { j.work = dec(j.work).plus(d).toString(); }, finish: () => {
            const n = this.state.nodes.find(n => n.id === j.nodeId)!;
            this.applyTask(n, j.task, j.outcome ?? 0); this.noteNode(n); b.jobs.shift(); this.restoreStand(j);
            this.state.completedJobs++; this.notice(`${n.id} 已完成${taskName(j.task)}${isGrowth(j.task) || j.task.kind === 'assimilate' ? `，规模 ${n.size}` : ''}`);
            this.revalidate(b, context);
          } });
        }
      }
      const r = this.state.researchJob;
      if (r && !r.paused) work.push({ remaining: dec(r.totalWork).minus(r.work), rate: power.div(net.sinisterMaxTier >= r.tier ? '0.9' : '1'), advance: d => { r.work = dec(r.work).plus(d).toString(); }, finish: () => { this.state.researchJob = null; this.finishResearch(r.id); } });
      if (!work.length) break;
      const eventTime = work.reduce((min, w) => Decimal.min(min, Decimal.max(ZERO, w.remaining).div(w.rate)), remaining);
      for (const w of work) w.advance(eventTime.times(w.rate));
      remaining = Decimal.max(ZERO, remaining.minus(eventTime));
      const completed = work.filter(w => w.remaining.div(w.rate).lte(eventTime.plus('1e-25')));
      for (const w of completed) w.finish();
      if (eventTime.isZero() && !completed.length) break;
    }
  }

  resetRun(): void {
    const { seed, codex } = this.state;
    this.state = initialState(); this.state.seed = seed; this.state.codex = clone(codex);
  }

  view(context: ArcaneContext, network?: ArcaneNetwork): ArcaneView {
    const s = this.state, net = network ?? this.network(context);
    const occupied = new Set(s.nodes.flatMap(node => node.standId ? [node.standId] : []));
    const freeStands = new Map<number, ArcaneStand[]>();
    for (const stand of s.stands) {
      if (occupied.has(stand.id)) continue;
      const group = freeStands.get(stand.tier) ?? [];
      group.push(stand); freeStands.set(stand.tier, group);
    }
    const action = (label: string, command: ArcaneCommand, tier: number, factor: string, reason = '', count = 0): ArcaneActionView => {
      const amount = this.cost(context, tier, factor, count);
      const why = !context.active ? '奥术宇宙未激活' : context.maxTier < tier ? `需要 ${tierName(tier)}` : reason || (!context.canPay(tier, amount) ? 'GT 币不足' : '');
      return { label, command, costs: [{ tier, amount: amount.toString() }], enabled: !why, reason: why };
    };
    const buildOptions: ArcaneActionView[] = [];
    const tiers = Array.from({ length: Math.max(0, Math.min(MAX_TIER, context.maxTier) - 1) }, (_, i) => ({ tier: i + 2, name: tierName(i + 2) }));
    for (const { tier, name } of tiers) {
      const locked = s.research < 0 ? '先完成魔导入门' : '';
      buildOptions.push(action(`${name} 普通标准节点`, { type: 'buy-node', tier }, tier, '1.5', locked, s.directPurchases[String(tier)] ?? 0));
      buildOptions.push(action(`${name} 调查点`, { type: 'build-survey', tier }, tier, '2', locked || (s.surveys.length >= this.surveyLimit() ? '调查点管理规模已满' : '')));
      buildOptions.push(action(`${name} 培养台`, { type: 'build-bench', tier }, tier, '0.5', locked));
      buildOptions.push(action(`${name} 支架`, { type: 'buy-stand', tier }, tier, '0.15', locked));
      const enclosed = action(`${name} 封闭支架`, { type: 'buy-stand', tier, enclosed: true }, tier, '0.15', locked);
      enclosed.costs.push({ tier, amount: this.cost(context, tier, '0.3').toString() });
      if (!context.canPay(tier, dec(enclosed.costs[0].amount).plus(enclosed.costs[1].amount))) { enclosed.enabled = false; enclosed.reason = 'GT 币不足'; }
      buildOptions.push(enclosed);
    }
    const researchOptions = [...ARCANE_RESEARCH.map(r => r.id), 'garden' as const, 'blood' as const].map(id => {
      const meta = researchMeta(id);
      const completed = id === 'garden' ? s.garden : id === 'blood' ? s.blood : s.research >= ARCANE_RESEARCH.findIndex(r => r.id === id);
      return { ...action(`${id.startsWith('A') ? id + ' ' : ''}${meta.name}`, { type: 'research', id }, meta.tier, meta.cost, this.researchReason(id, context)), id, requires: meta.requires, unlock: meta.unlock, seconds: meta.seconds, completed };
    });
    const nodes: ArcaneNodeView[] = s.nodes.map(n => {
      const busy = this.locked(n.id);
      const output = context.active && this.online(n) ? this.output(n) : ZERO;
      const actions: ArcaneActionView[] = [];
      if (n.location === 'candidate') actions.push(action('普通封装（5% 降质）', { type: 'pack', nodeIds: [n.id] }, n.tier, '0.1', busy ? '节点已被作业占用' : ''));
      if (n.location === 'jar') for (const st of freeStands.get(n.tier) ?? []) {
        if (n.type === 'tainted' && !st.enclosed) continue;
        actions.push({ label: `安装到 ${st.id}`, command: { type: 'install', nodeId: n.id, standId: st.id }, costs: [], enabled: context.active && !busy, reason: busy ? '节点已被作业占用' : '' });
      }
      if (n.location === 'installed') actions.push({ label: '拆下存入缸中', command: { type: 'uninstall', nodeId: n.id }, costs: [], enabled: context.active && !busy, reason: busy ? '节点已排队' : '' });
      const spectrum = arcaneNodeAspects(n);
      return { ...clone(n), tierName: tierName(n.tier), typeName: typeMeta(n.type).name, qualityName: qualityMeta(n.quality).name,
        aspectsText: ARCANE_ASPECTS.map(a => `${a.name} ${dec(spectrum[a.id]).times(100).toFixed(1)}%`).join(' · '), output: output.toString(), potentialOutput: this.output(n).toString(), busy,
        status: this.processing(n.id) ? '处理中，暂停供能' : busy ? '已锁定到队列' : ({ candidate: '待封装候选', packing: '等待稳妥封装', jar: '缸中', installed: '已安装供能' })[n.location],
        stopWarning: output.gt(0) ? `开工将暂时减少 ${output.toSignificantDigits(5)} 灵气/秒；剩余 ${net.vis.minus(output).toSignificantDigits(5)}。实际收入变化由设备灵气分配决定。` : '', actions };
    });
    const benches = s.benches.map(b => {
      const options: ArcaneJobOption[] = [];
      if (!b.upgrade && context.active) for (const node of s.nodes) {
        if (this.allJobs().some(j => (j.nodeId === node.id && !b.jobs.includes(j)) || (j.task.kind === 'assimilate' && j.task.donorId === node.id))) continue;
        const future = this.projected(node, b);
        const tasks: ArcaneTask[] = [{ kind: 'safe-pack' }, { kind: 'repair' }, { kind: 'cultivate' }, { kind: 'abundant' }, { kind: 'abundant', blood: true }, { kind: 'purify' }, { kind: 'upgrade-node' }, ...aspects.map(aspect => ({ kind: 'attune' as const, aspect }))];
        if (future.type === 'hungry') for (const donor of s.nodes) tasks.push({ kind: 'assimilate', donorId: donor.id });
        for (const task of tasks) {
          const q = this.quote(future, task, b, context);
          if (!q) continue;
          const detail = task.kind === 'attune' ? `：${ARCANE_ASPECTS.find(a => a.id === task.aspect)!.name}` : task.kind === 'assimilate' ? `（供体 ${task.donorId}）` : task.kind === 'abundant' && task.blood ? '＋血仪式' : '';
          const command: ArcaneCommand = { type: 'enqueue', benchId: b.id, nodeId: node.id, task };
          const batches = [{ count: 1, amount: q.paid.toString(), seconds: q.seconds.toString(), enabled: context.canPay(q.tier, q.paid) }];
          if (isGrowth(task)) {
            const projected = clone(future);
            let total = q.paid, duration = q.seconds;
            this.applyTask(projected, task, this.minimumGain(task));
            for (let count = 2; count <= 10; count++) {
              const next = this.quote(projected, task, b, context);
              if (!next) break;
              total = total.plus(next.paid); duration = duration.plus(next.seconds);
              batches.push({ count, amount: total.toString(), seconds: duration.toString(), enabled: context.canPay(q.tier, total) });
              this.applyTask(projected, task, this.minimumGain(task));
            }
          }
          options.push({ label: `${node.id} ${taskName(task)}${detail}`, command, costs: [{ tier: q.tier, amount: q.paid.toString() }], enabled: context.canPay(q.tier, q.paid), reason: context.canPay(q.tier, q.paid) ? '' : 'GT 币不足',
            nodeId: node.id, seconds: q.seconds.toString(), gains: q.gains, batches,
            chanceFive: task.kind === 'abundant' ? Decimal.min('0.125', dec('0.05').plus(net.aspects.entropy.times('0.1')).plus(net.unstableMaxTier >= future.tier ? '0.02' : '0')).toString() : null });
        }
      }
      return { ...clone(b), options, upgradeAction: action('培养台升阶（15 分钟）', { type: 'upgrade-bench', id: b.id }, Math.min(MAX_TIER, b.tier + 1), '0.25', s.research < 1 ? '需要 A1' : b.tier >= MAX_TIER ? '已达最高等级' : b.upgrade || b.jobs.length ? '培养台忙碌' : '') };
    });
    return { active: context.active, research: s.research, evaluated: s.evaluated, vis: net.vis.toString(), energy: this.energyDemand(context).toString(),
      aspects: ARCANE_ASPECTS.map(a => ({ ...a, share: net.aspects[a.id].toString() })), network: { fireMultiplier: net.fireMultiplier.toString(), earthMultiplier: net.earthMultiplier.toString(), demandMultiplier: net.demandMultiplier.toString(), enchantmentLevel: net.enchantmentLevel },
      researchOptions, researchJob: s.researchJob ? { ...clone(s.researchJob), name: researchMeta(s.researchJob.id).name } : null, buildOptions, tiers,
      regions: ARCANE_REGIONS.map(r => ({ id: r.id, name: r.name, unlocked: this.regionAllowed(r.id, context) })),
      targets: [{ label: '不定向', target: null }, ...ARCANE_TYPES.filter(t => t.id !== 'hungry' || s.research >= 4).map(t => ({ label: `${t.name}类型`, target: { kind: 'type' as const, value: t.id } })), ...ARCANE_ASPECTS.map(a => ({ label: `${a.name}主倾向`, target: { kind: 'aspect' as const, value: a.id } }))],
      surveys: s.surveys.map(p => ({ ...clone(p), capacity: this.surveyCapacity(), limit: this.pityLimit(p.target), duration: this.surveySeconds(), status: p.paused ? '已暂停' : p.upgrade ? '升阶中' : p.candidates.length >= this.surveyCapacity() ? '候选已满，不耗电' : '调查中（缺电时暂停）', upgradeAction: action('调查点升阶（15 分钟）', { type: 'upgrade-survey', id: p.id }, Math.min(MAX_TIER, p.tier + 1), '0.75', s.research < 1 ? '需要 A1' : p.tier >= MAX_TIER ? '已达最高等级' : p.upgrade ? '正在升阶' : '') })),
      nodes, stands: clone(s.stands), benches, codex: clone(s.codex), discoveries: s.discoveries, completedJobs: s.completedJobs, notices: [...s.notices] };
  }

  private restore(raw: unknown): void {
    const data = record(raw), s = this.state;
    s.seed = integer(data.seed, 0, 0xffffffff, s.seed); s.nextId = integer(data.nextId, 1, Number.MAX_SAFE_INTEGER - 1000, 1);
    s.research = integer(data.research, -1, 6, -1); s.firstNodeGranted = data.firstNodeGranted === true || s.research >= 0;
    s.evaluated = integer(data.evaluated, 0, Number.MAX_SAFE_INTEGER, 0);
    s.garden = data.garden === true && s.research >= 3; s.blood = data.blood === true && s.research >= 5;
    s.discoveries = integer(data.discoveries, 0, Number.MAX_SAFE_INTEGER, 0); s.completedJobs = integer(data.completedJobs, 0, Number.MAX_SAFE_INTEGER, 0);
    const seen = new Set<string>();
    const validId = (value: unknown): value is string => typeof value === 'string' && /^(node|stand|survey|bench|job)-\d+$/.test(value) && !seen.has(value);
    const takeId = (value: string): void => { seen.add(value); const suffix = Number(value.split('-')[1]); if (Number.isSafeInteger(suffix)) s.nextId = Math.max(s.nextId, suffix + 1); };
    const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
    const upgrade = (value: unknown, tier: number): ArcaneUpgrade | null => {
      const u = record(value); return tier < MAX_TIER && u.targetTier === tier + 1 ? { targetTier: tier + 1, work: Decimal.min(900, amountText(u.work)).toString() } : null;
    };
    for (const entry of array(data.stands)) {
      const r = record(entry); if (!validId(r.id) || !tierValid(r.tier as number)) continue;
      takeId(r.id); s.stands.push({ id: r.id, tier: r.tier as number, enclosed: r.enclosed === true });
    }
    for (const entry of array(data.surveys)) {
      const r = record(entry); if (!validId(r.id) || !tierValid(r.tier as number)) continue;
      takeId(r.id); const tier = r.tier as number;
      const target = r.target === null ? null : record(r.target) as unknown as ArcaneTarget;
      s.surveys.push({ id: r.id, tier, nodeTier: integer(r.nodeTier, 2, tier, tier), region: ARCANE_REGIONS.some(p => p.id === r.region) ? r.region as ArcaneRegion : 'plains', target: this.targetValid(target) ? clone(target) : null,
        misses: integer(r.misses, 0, 19, 0), work: Decimal.min(this.surveySeconds(), amountText(r.work)).toString(), paused: r.paused === true, candidates: [], upgrade: upgrade(r.upgrade, tier) });
    }
    const occupied = new Set<string>();
    for (const entry of array(data.nodes)) {
      const r = record(entry); if (!validId(r.id) || !tierValid(r.tier as number) || !nodeTypes.includes(r.type as ArcaneNodeType) || !qualities.includes(r.quality as ArcaneQuality)) continue;
      takeId(r.id);
      const type = r.type as ArcaneNodeType, tier = r.tier as number;
      const stand = s.stands.find(st => st.id === r.standId && st.tier === tier && !occupied.has(st.id) && (type !== 'tainted' || st.enclosed));
      const survey = s.surveys.find(p => p.id === r.surveyId);
      const location = r.location === 'installed' && stand ? 'installed' : (r.location === 'candidate' || r.location === 'packing') && survey ? r.location : 'jar';
      if (location === 'installed') occupied.add(stand!.id);
      const node: ArcaneNode = { id: r.id, tier, type, quality: r.quality as ArcaneQuality, size: integer(r.size, 1, type === 'hungry' ? 260 : 160, 50), baseAspects: spectrum(r.baseAspects),
        attunement: aspects.includes(r.attunement as ArcaneAspect) ? r.attunement as ArcaneAspect : null, cultivations: integer(r.cultivations, 0, 10, 0), assimilations: type === 'hungry' ? integer(r.assimilations, 0, 5, 0) : 0,
        protected: r.protected === true, location, standId: location === 'installed' ? stand!.id : null, surveyId: survey?.id ?? null };
      s.nodes.push(node); if (location === 'candidate') survey!.candidates.push(node.id);
    }
    s.evaluated = Math.max(s.evaluated, s.nodes.length);
    for (const [key, count] of Object.entries(record(data.directPurchases))) if (tierValid(Number(key))) s.directPurchases[key] = integer(count, 0, Number.MAX_SAFE_INTEGER, 0);
    const codex = record(data.codex);
    const known = <T extends string>(value: unknown, allowed: readonly T[]): T[] => [...new Set(array(value).filter((id): id is T => typeof id === 'string' && allowed.includes(id as T)))];
    s.codex = { types: known(codex.types, nodeTypes), qualities: known(codex.qualities, qualities), aspects: known(codex.aspects, aspects), regions: known(codex.regions, ARCANE_REGIONS.map(r => r.id)), research: known(codex.research, [...ARCANE_RESEARCH.map(r => r.id), 'garden' as const, 'blood' as const]) };
    s.notices = array(data.notices).filter((x): x is string => typeof x === 'string').map(x => x.slice(0, 300)).slice(-20);
    const claims = new Map<string, string>();
    for (const entry of array(data.benches)) {
      const r = record(entry); if (!validId(r.id) || !tierValid(r.tier as number)) continue;
      takeId(r.id); const bench: ArcaneBench = { id: r.id, tier: r.tier as number, paused: r.paused === true, jobs: [], upgrade: upgrade(r.upgrade, r.tier as number) };
      for (const value of array(r.jobs)) {
        const j = record(value), t = record(j.task), node = s.nodes.find(n => n.id === j.nodeId);
        if (!validId(j.id) || !node || !tierValid(j.tier as number) || (claims.has(node.id) && claims.get(node.id) !== bench.id) || !['safe-pack', 'repair', 'cultivate', 'abundant', 'attune', 'upgrade-node', 'purify', 'assimilate'].includes(t.kind as string)) continue;
        let task: ArcaneTask;
        if (t.kind === 'attune') { if (!aspects.includes(t.aspect as ArcaneAspect)) continue; task = { kind: 'attune', aspect: t.aspect as ArcaneAspect }; }
        else if (t.kind === 'assimilate') { if (typeof t.donorId !== 'string' || t.donorId === node.id || claims.has(t.donorId)) continue; task = { kind: 'assimilate', donorId: t.donorId }; }
        else if (t.kind === 'abundant') task = typeof t.blood === 'boolean' ? { kind: 'abundant', blood: t.blood } : { kind: 'abundant' };
        else task = { kind: t.kind as 'safe-pack' | 'repair' | 'cultivate' | 'purify' | 'upgrade-node' };
        const started = j.started === true && bench.jobs.length === 0;
        if (task.kind === 'assimilate' && !started) {
          const donor = s.nodes.find(n => n.id === task.donorId);
          if (!donor || donor.protected || donor.location !== 'jar' || donor.tier !== node.tier) continue;
        }
        const total = dec(amountText(j.totalWork, '1'));
        if (total.lte(0)) continue;
        const outcome = typeof j.outcome === 'number' && Number.isInteger(j.outcome) && j.outcome >= 0 && j.outcome <= 260 ? j.outcome : null;
        // 已开工作业必须保留结果，损坏存档不能在刷新后补抽。
        if (started && outcome === null) continue;
        const job: ArcaneJob = { id: j.id, nodeId: node.id, task, tier: j.tier as number, paid: amountText(j.paid), totalWork: total.toString(), work: started ? Decimal.min(total, amountText(j.work)).toString() : '0', started,
          returnStandId: started && typeof j.returnStandId === 'string' && s.stands.some(st => st.id === j.returnStandId) ? j.returnStandId : null, outcome: started ? outcome : null, chanceFive: started && j.chanceFive !== null ? Decimal.min('0.125', amountText(j.chanceFive)).toString() : null };
        takeId(j.id); claims.set(node.id, bench.id); if (task.kind === 'assimilate') claims.set(task.donorId, `donor:${j.id}`);
        bench.jobs.push(job);
        if (started && node.location === 'installed') { node.location = 'jar'; node.standId = null; }
      }
      if (bench.jobs.length) bench.upgrade = null;
      s.benches.push(bench);
    }
    for (const node of s.nodes) if (node.location === 'packing' && !this.allJobs().some(j => j.nodeId === node.id && j.task.kind === 'safe-pack')) this.returnCandidate(node.id);
    const r = record(data.researchJob), ids = [...ARCANE_RESEARCH.map(r => r.id), 'garden', 'blood'];
    if (ids.includes(r.id as string)) {
      const meta = researchMeta(r.id as ArcaneResearchId);
      const expected = r.id === 'garden' ? s.research >= 3 && !s.garden : r.id === 'blood' ? s.research >= 5 && !s.blood : ARCANE_RESEARCH[s.research + 1]?.id === r.id;
      if (expected && meta.seconds > 0) s.researchJob = { id: r.id as ArcaneResearchId, tier: meta.tier, paid: amountText(r.paid), totalWork: String(meta.seconds), work: Decimal.min(meta.seconds, amountText(r.work)).toString(), paused: r.paused === true };
    }
  }
}
