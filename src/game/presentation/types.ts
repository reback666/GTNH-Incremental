import { type DisplayMode } from '../../numeric/format';
import { type PickaxeLine } from '../../numeric/pickaxe';
import { type GridMode } from '../../numeric/grid';
import { type AchievementIcon } from '../achievements';
import { type MachineKind, type UiTheme } from '../core';
import { type BlockKind } from '../models';
import { type SoundId } from '../audio';

export interface ResourceRow {
  tier: number;
  name: string;
  amount: string;
  value: string;
  detail: { label: string; value: string }[];
}

export interface PowerDetailRow {
  tier: number;
  voltage: string;
  // 机型 id 与类别，供界面显示机型图标
  modelId: string;
  kind: MachineKind;
  name: string;
  count: number;
  amount: string;
  // 真正在运行的台数与停机台数（停机 = 手动停机 + 故障 + 被 AI 调度停机）。
  // 只有耗电明细填这两个字段：发电机的台数不参与停机调度
  running?: number;
  stopped?: number;
}

export interface PowerStat {
  value: string;
  rows: PowerDetailRow[];
  emptyText: string;
  note?: string;
  detailLabel?: string;
}

export interface PowerStats {
  stored: PowerStat;
  generated: PowerStat;
  consumed: PowerStat;
  ratio: string;
  ratioShort: boolean;
}

// 设置与风险面板：污染 + 电网
export interface RiskStats {
  pollution: string;
  pollutionRaw: string;
  band: string;
  bandName: string;
  // 污染在这个存档里是「燃料」而不是惩罚（奥术 / 深渊宇宙）
  boosted: boolean;
  enabled: boolean;
  growth: string;
  purify: string;
  net: string;
  netPositive: boolean;
  mutationChance: string;
  collapseChance: string;
  grid: GridMode;
  gridName: string;
  gridSummary: string;
  gridModes: {
    id: GridMode;
    name: string;
    summary: string;
    unlocked: boolean;
    unlockable: boolean;
    // 解锁要求（电压等级）与价格（该等级的 GT 币）
    requirement: string;
    cost: string;
    unit: string;
  }[];
  outage: boolean;
  siphoned: string;
}

export interface MachineModelRow {
  id: string;
  name: string;
  block: BlockKind;
  // ZPM 及以后的机型要先研究出来才能建造
  researched: boolean;
  // 是否已解锁（研究 + 所属平行宇宙都满足）；奥术宇宙的灵气节点要拥有奥术宇宙
  unlocked: boolean;
  // 灵气驱动的魔法机器（不耗电、吃灵气）
  visPowered: boolean;
  // 单台的消耗与产出，鼠标移到机器名上时显示
  single: { label: string; value: string }[];
  count: number;
  // 真正干活的台数与停机台数（停机 = 手动停机 + 故障 + 被 AI 调度停机）
  running: number;
  idle: number;
  // 玩家手动停机：停机的一台都不产不耗，也不产生污染
  stopped: boolean;
  // 能不能停机。存电装置是容量型装置，没有「运行」这回事
  stoppable: boolean;
  // 超频档位（0-3）。发电机没有配方，档位恒为 0 且不可调
  overclock: number;
  overclockable: boolean;
  // 故障台数与「平均多久坏一台」的提示
  faulty: number;
  faultHint: string;
  icons: number;
  overflow: number;
  price: string;
  // 卖回一台能拿回多少（币或矿石，跟着上面的支付方式）
  refund: string;
  // 矿石支付时的卖回价：面板切到「同级矿石」时卖出的就是矿石，提示不能还按币报
  oreRefund: string;
  orePrice: string;
  affordable: boolean;
  oreAffordable: boolean;
}

export interface MachineTierGroup {
  tier: number;
  voltage: string;
  oreLabel: string;
  unlocked: boolean;
  unit: string;
  models: MachineModelRow[];
}

export interface MachineColumn {
  kind: MachineKind;
  title: string;
  hint: string;
  count: number;
  tiers: MachineTierGroup[];
  stats: { label: string; value: string }[];
  // 这一类机器当前吃到的增益 / 减益（悬停标签时显示）
  modifiers: ModifierRow[];
}

// 镐子（手动开采）的一条升级线
export interface PickaxeLineRow {
  id: PickaxeLine;
  name: string;
  hint: string;
  level: number;
  cap: number;
  // 这条线自己的图标用哪一档电压色（按进度走，满级是 MAX 的彩虹）
  iconTier: number;
  effectNow: string;
  // 下一次升级后的效果，满级时是空串
  effectNext: string;
  canUpgrade: boolean;
  // 这一档电压还没给机会（例如 ULV 时的金刚杵）
  locked: boolean;
  // 下次升级的币价（已格式化），满级时是空串
  cost: string;
  // 下次升级花哪一级的币，满级时是空串
  coinName: string;
  // 买得起吗（不含机会上限判断，机会不够时也照实显示钱够不够）
  affordable: boolean;
}

export interface PickaxeStats {
  outputPerClick: string;
  // 手动挖矿当前作用在哪座矿脉上，以及已解锁的最高矿脉
  veinTier: number;
  veinName: string;
  maxVeinTier: number;
  maxVeinName: string;
  lines: PickaxeLineRow[];
  // 悬停「镐子」标签时显示的增益清单
  modifiers: ModifierRow[];
}

// 研究：算力（流量）与当前研究目标的进度
export interface ResearchStats {
  // 到 LuV 才解锁研究，之前资源条上不显示这一块
  unlocked: boolean;
  hasTarget: boolean;
  targetName: string;
  // 目标机型所属的电压等级名（研究区提示用）
  targetTierName: string;
  progress: string;
  required: string;
  percent: number;
  eta: string;
  note: string;
  // 还没研究出来的机型（当前正在研究的那一项单独显示在上方，不在这里）
  pending: ResearchOptionRow[];
}

// 待研究机型列表里的一行
export interface ResearchOptionRow {
  id: string;
  // 机型名，例如「鸿蒙之眼」
  name: string;
  // 所属电压等级名，例如 MAX
  tierName: string;
  // 电压够不够：不够也能先研究，只是这一级还不能建造
  voltageReady: boolean;
  // 这一项已经攒下的进度（没动过就是 0）
  progress: string;
  required: string;
  percent: number;
}

// 永久加成树上的一个节点
export interface RebirthNodeRow {
  id: string;
  branch: string;
  branchName: string;
  layer: number;
  x: number;
  y: number;
  name: string;
  effectText: string;
  cost: string;
  requires: string[];
  // 前置节点的显示名（星图悬停提示用）
  requireNames: string[];
  // 宇宙支线：需要拥有该宇宙才能买（空串 = 无门控）
  requireUniverse: string;
  requireUniverseName: string;
  icon: AchievementIcon;
  owned: boolean;
  // 前置已买齐且宇宙门控已满足（只差线缆）
  unlocked: boolean;
  buyable: boolean;
}

export interface RunHistoryRow {
  run: number;
  // 「裂缝 / MAX」
  route: string;
  universe: string;
  challenge: string;
  // 「×1.3 通过」/「已失效」/「—」
  challengeNote: string;
  cables: string;
  duration: string;
  voltage: string;
}

export interface ChallengeRow {
  id: string;
  name: string;
  desc: string;
  // 结算倍率，如 '×1.3'
  bonus: string;
  // 首通已达成（跨周目）
  firstDone: boolean;
  // 现在能不能挂（含宇宙门控：已拥有、或本次转生正打算带上）
  eligible: boolean;
  // 门控需要的宇宙名（空串 = 无门控）
  requireUniverseName: string;
  // 当前是否选定为「本次转生挂上」
  selected: boolean;
}

export interface RebirthStats {
  cables: string;
  count: number;
  runEU: string;
  // 打到 MAX 现在能拿几条（还没到 MAX 是 —）
  maxCables: string;
  canRebirth: boolean;
  riftPending: boolean;
  riftClosed: boolean;
  // 已经选好、等下次转生带走的宇宙（没选时空串）
  pendingUniverse: string;
  pendingUniverseName: string;
  // 已经拥有的宇宙名字，界面上做摘要用
  universes: string[];
  // 挑战时间线：本周目挂着的挑战（空名 = 没挂）
  activeChallengeName: string;
  activeChallengeDesc: string;
  activeChallengeBonus: string;
  activeChallengeFailed: boolean;
  activeChallengeFirstDone: boolean;
  // 本次转生将挂上的挑战名（空串 = 不挂）
  pendingChallengeName: string;
  challengeRows: ChallengeRow[];
  // 转生履历（最近 50 条，最新的在最前）
  historyRows: RunHistoryRow[];
  // 普朗克锚：已铸造 / 能不能铸（300 条）
  planckOwned: boolean;
  planckBuyable: boolean;
  root: { name: string; x: number; y: number };
  nodes: RebirthNodeRow[];
  // 已经装上的加成汇总
  bonuses: { label: string; value: string }[];
}

// 成就：一个方块一条
export interface AchievementRow {
  id: string;
  name: string;
  desc: string;
  achieved: boolean;
  // 达成时间（游戏内时长），未达成是空串
  at: string;
  // 配图：机型 / 矿脉 / 镐子贴图，或代码画的像素图标
  icon: AchievementIcon;
}

export interface AchievementStats {
  rows: AchievementRow[];
  done: number;
  total: number;
}

// 平行宇宙：转生时选一个，已拥有的标出来
export interface UniverseRow {
  id: string;
  name: string;
  summary: string;
  effects: string[];
  implemented: boolean;
  owned: boolean;
}

// 奥术宇宙的资源读数：灵气（流量）与源质（存量）
export interface ArcaneStats {
  active: boolean;
  // 每秒产出 / 魔法机器用掉的灵气
  visProduced: string;
  visUsed: string;
  // 灵气充裕度与它带来的产量加成（普通机器 / 魔法机器）
  plenty: string;
  bonusNormal: string;
  bonusMagic: string;
  // 源质存量与每秒净变化
  essentia: string;
  essentiaNet: string;
  essentiaPositive: boolean;
  nodes: number;
  note: string;
}

// 硅基宇宙：三项 AI 开关与它们上一拍干了什么
export interface SiliconStats {
  active: boolean;
  autoRepair: boolean;
  autoOverclock: boolean;
  shedding: boolean;
  // 缺电时按优先级停机的顺序（最先被停的排在前面），由 SILICON_KEEP_PRIORITY 生成
  sheddingOrder: string;
  note: string;
}

// 深渊宇宙的读数：腐蚀速率与抑制器抵消的污染点数
export interface AbyssStats {
  active: boolean;
  // 污染对全厂产出的倍率（30% 是中性点）
  pollutionFactor: string;
  pollutionFactorPositive: boolean;
  // 每台机器每分钟的损坏概率
  corrosionPerMinute: string;
  // 抑制器抵消掉的污染点数
  suppression: string;
  // 污染超出中性点、又没被抑制的部分
  effective: string;
  note: string;
}

export interface FactoryMachine {
  modelId: string;
  tier: number;
  count: number;
  running: number;
}

export interface FactoryFacility {
  machines: FactoryMachine[];
  kind: MachineKind;
  name: string;
  count: number;
  running: number;
  faulty: number;
  tier: number;
  modelId: string;
  activity: number;
}

export interface FactoryOverview {
  facilities: FactoryFacility[];
  machineCount: number;
  runningCount: number;
  faultyCount: number;
  powerRatio: number;
  batteryRatio: number;
  pollution: number;
  nextTierProgress: number;
}

export interface Snapshot {
  factory: FactoryOverview;
  ores: ResourceRow[];
  coins: ResourceRow[];
  columns: MachineColumn[];
  maxTier: number;
  playTime: string;
  // 自动存档间隔（秒）：存档框的滑条读当前值、说明文案用它
  autosaveSeconds: number;
  totalOre: string;
  totalCoins: string;
  power: PowerStats;
  risk: RiskStats;
  research: ResearchStats;
  rebirth: RebirthStats;
  achievements: AchievementStats;
  universes: UniverseRow[];
  arcane: ArcaneStats;
  abyss: AbyssStats;
  silicon: SiliconStats;
  // 累计统计（存档面板里显示）
  stats: { label: string; value: string }[];
  // 开发者模式开关（设置页）
  devMode: boolean;
  // 数字显示模式（设置页）：界面上的大数字用自动 / 科学计数法 / 完整数字哪种画法
  displayMode: DisplayMode;
  // 界面主题（设置页）：暗钢 / 原版亮灰两套皮肤
  uiTheme: UiTheme;
  // 音效设置（设置页）：总开关与被单独关掉的音效 id
  soundEnabled: boolean;
  soundMuted: SoundId[];
  nextTier: number | null;
  unlockCost: string;
  canUnlock: boolean;
  veins: number[];
  pickaxe: PickaxeStats;
  // 当前最高等级的矿脉（界面中间那张图），贴图与特效由 veins.ts 按 tier 查
  currentVein: { tier: number; name: string };
}

export interface ModifierRow {
  // 影响的东西（速度 / 耗电 / 产出 / 燃料效率……）
  effect: string;
  value: string;
  // 来源（转生加成树 / 电网 / 污染 / 平行宇宙 / 超频……）
  source: string;
  tone: 'good' | 'bad' | 'flat';
}
