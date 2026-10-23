import { Decimal, ZERO, fromSaveString, toSaveString } from '../numeric/decimal';
import type { DisplayMode } from '../numeric/format';
import { MAX_TIER } from '../numeric/voltage';
import { VOLTAGES } from '../content';
import { remapVoltageSave } from './save-voltage';
import { DEFAULT_GRID, GRID_MODES, type GridMode } from '../numeric/grid';
import { needsResearch } from '../numeric/research';
import { isValidOverclockLevel } from '../numeric/overclock';
import { clampPollution } from '../numeric/pollution';
import { blastChances, collectChances, vajraMaxLevel } from '../numeric/pickaxe';
import { GameCore, RIFT_FROM_TIER, type MachineKind, type UiTheme } from './core';
import { MACHINE_MODELS, baseModelOf, type MachineModel } from './models';
import { ACHIEVEMENTS } from './achievements';
import { REBIRTH_NODES } from './rebirth';
import { UNIVERSES } from './universes';
import { isChallengeId, type ChallengeId } from './challenges';
import { isSoundId } from './audio';
import {
  AUTOSAVE_SECONDS_DEFAULT,
  AUTOSAVE_SECONDS_MAX,
  AUTOSAVE_SECONDS_MIN,
  SAVE_KEY,
  SAVE_TIME_KEY,
  SAVE_VERSION,
  THEME_KEY,
} from './constants';
import { errorText, logEvent, setLogGameSeconds } from './log';

// 计划书第十四章：存档 = 状态序列化成 JSON，带版本号；
// 大数值一律以字符串存储 —— JSON.parse 只有 double 一种数字类型，超过 2^53 会在解析阶段丢精度。
export interface SaveData {
  version: number;
  voltageIds?: string[];
  ores: string[];
  coins: string[];
  // v2：机型 id → 数量
  counts?: Record<string, number>;
  // v3：机型 id → 超频档位 / 故障台数，以及存电装置的存量
  overclock?: Record<string, number>;
  faults?: Record<string, number>;
  storedEU?: string;
  // v4：污染值、污染开关、电网模式、被黑市薅走的累计
  pollution?: string;
  pollutionEnabled?: boolean;
  grid?: string;
  siphoned?: string;
  // v5：已解锁的电网（解锁要花对应等级的 GT 币）
  grids?: string[];
  // v6：研究进度与已研究出来的电压等级（ZPM 及以后要先研究）
  // v15 及以前是自动研究：这里记的是当时那个自动目标的进度，读到旧存档时迁移用
  researchProgress?: string;
  researched?: number[];
  // v16：研究曾经是「手选等级」：选中的等级 + 各等级各自的进度
  researchTarget?: number | null;
  researchProgressByTier?: Record<string, string>;
  // v17：研究改成「手选机型」：已研究机型 id + 选中的机型 + 各机型各自的进度
  researchedModels?: string[];
  researchTargetModel?: string | null;
  researchProgressByModel?: Record<string, string>;
  // v7：转生：时空线缆、永久加成节点、转生次数、本周目累计 EU
  cables?: string;
  rebirthCount?: number;
  rebirthNodes?: string[];
  runEU?: string;
  totalEU?: string;
  riftOffered?: boolean;
  // v8：开发者模式开关
  devMode?: boolean;
  // v9：累计统计与成就
  peakTier?: number;
  manualMines?: number;
  builtMachines?: number;
  overclockUsed?: boolean;
  repairs?: number;
  maxPollution?: string;
  totalCables?: string;
  achieved?: Record<string, number>;
  // v10：已拥有的平行宇宙
  universes?: string[];
  // v11：奥术宇宙的源质存量
  essentia?: string;
  // v12：下次转生要带的平行宇宙（选择本身，转生时才生效）
  pendingUniverse?: string | null;
  // v19：挑战时间线（挂着的 / 违规与热身标记 / 首通记录 / 待挂的选择）
  activeChallenge?: string | null;
  challengeViolated?: boolean;
  challengePrimed?: boolean;
  completedChallenges?: string[];
  pendingChallenge?: string | null;
  // v20：转生履历（最近 50 条）与普朗克锚
  runHistory?: unknown[];
  planckAnchor?: boolean;
  // v21：数字显示模式（设置页的界面偏好，跨周目保留）
  displayMode?: string;
  // v22：自动存档间隔（秒，存档框的滑条）
  autosaveSeconds?: number;
  // v23：音效开关（总开关 + 被单独关掉的音效 id）
  soundEnabled?: boolean;
  soundMuted?: string[];
  // v24：界面主题（暗钢 / 原版亮灰）
  uiTheme?: string;
  // v13：镐子的三条升级线（金刚杵等级、连锁采集等级、连锁爆破已用机会数）
  pickaxeVajra?: number;
  pickaxeCollect?: number;
  pickaxeBlast?: number;
  // v14：硅基宇宙的三项 AI 开关
  siliconAutoRepair?: boolean;
  siliconAutoOverclock?: boolean;
  siliconShedding?: boolean;
  // v15：被手动停机的机型（机型 id → true）
  stopped?: Record<string, true>;
  // v18：随机事件计时器（波动电网断电、黑市窃取、变异、工厂崩溃）
  timers?: {
    outageSeconds?: number;
    outageTimer?: number;
    siphonTimer?: number;
    mutationTimer?: number;
    collapseTimer?: number;
  };
  // v1 遗留字段：按电压等级存的数量，读到旧存档时用来迁移
  miners?: number[];
  generators?: number[];
  machines?: number[];
  maxTier: number;
  unlockedVeins: number[];
  playSeconds: number;
  totalOre: string;
  totalCoins: string;
  totalOreSpent: string;
}

export function serialize(core: GameCore): SaveData {
  return {
    version: SAVE_VERSION,
    voltageIds: VOLTAGES.map((voltage) => voltage.id),
    ores: core.ores.map(toSaveString),
    coins: core.coins.map(toSaveString),
    counts: { ...core.counts },
    overclock: { ...core.overclock },
    faults: { ...core.faults },
    storedEU: toSaveString(core.storedEU),
    pollution: toSaveString(core.pollution),
    pollutionEnabled: core.pollutionEnabled,
    grid: core.grid,
    grids: [...core.grids],
    researchTargetModel: core.researchTarget,
    researchProgressByModel: Object.fromEntries(
      Object.entries(core.researchProgress).map(([id, amount]) => [id, toSaveString(amount)]),
    ),
    researchedModels: [...core.researchedModels],
    cables: toSaveString(core.cables),
    rebirthCount: core.rebirthCount,
    rebirthNodes: [...core.rebirthNodes],
    runEU: toSaveString(core.runEU),
    totalEU: toSaveString(core.totalEU),
    riftOffered: core.riftOffered,
    devMode: core.devMode,
    peakTier: core.peakTier,
    manualMines: core.manualMines,
    builtMachines: core.builtMachines,
    overclockUsed: core.overclockUsed,
    repairs: core.repairs,
    maxPollution: toSaveString(core.maxPollution),
    totalCables: toSaveString(core.totalCables),
    achieved: { ...core.achieved },
    universes: [...core.universes],
    essentia: toSaveString(core.essentia),
    pendingUniverse: core.pendingUniverse,
    activeChallenge: core.activeChallenge,
    challengeViolated: core.challengeViolated,
    challengePrimed: core.challengePrimed,
    completedChallenges: [...core.completedChallenges],
    pendingChallenge: core.pendingChallenge,
    runHistory: core.runHistory.map((entry) => ({ ...entry })),
    planckAnchor: core.planckAnchor,
    displayMode: core.displayMode,
    autosaveSeconds: core.autosaveSeconds,
    soundEnabled: core.soundEnabled,
    soundMuted: [...core.soundMuted],
    uiTheme: core.uiTheme,
    pickaxeVajra: core.pickaxeVajra,
    pickaxeCollect: core.pickaxeCollect,
    pickaxeBlast: core.pickaxeBlast,
    siliconAutoRepair: core.siliconAutoRepair,
    siliconAutoOverclock: core.siliconAutoOverclock,
    siliconShedding: core.siliconShedding,
    stopped: { ...core.stopped },
    timers: {
      outageSeconds: core.outageSeconds,
      outageTimer: core.outageTimer,
      siphonTimer: core.siphonTimer,
      mutationTimer: core.mutationTimer,
      collapseTimer: core.collapseTimer,
    },
    siphoned: toSaveString(core.siphoned),
    maxTier: core.maxTier,
    unlockedVeins: [...core.unlockedVeins],
    playSeconds: core.playSeconds,
    totalOre: toSaveString(core.totalOre),
    totalCoins: toSaveString(core.totalCoins),
    totalOreSpent: toSaveString(core.totalOreSpent),
  };
}

// 读档：存档是玩家机器上的数据，可能被手改、被旧版本写坏、被别的工具截断，
// 所以每个字段都先过一遍清洗（见文件末尾的 clean* 一组），坏值退回默认值。
// 目标是「宁可少一点内容，也不要让越界数字进到模拟里」，同时不因为一个字段坏掉
// 就把整份存档丢掉。
export function deserialize(data: SaveData): GameCore {
  data = remapVoltageSave(migrateUMV(data));
  const core = new GameCore();
  // 等级要先定下来：矿脉、机型、台数的清洗都以它为准
  core.maxTier = clampInt(data.maxTier, 1, MAX_TIER, 1);
  // v9 及以前没有这个字段：按当时的最高电压兜底（只会低估，不会凭空抬高）
  core.peakTier = clampInt(data.peakTier, 1, MAX_TIER, core.maxTier);
  core.unlockedVeins = cleanVeins(data.unlockedVeins);
  core.playSeconds = nonNegativeInt(data.playSeconds);

  core.ores = pad(data.ores, MAX_TIER).map((text) => safeDec(text));
  core.coins = pad(data.coins, MAX_TIER).map((text) => safeDec(text));
  const counts = data.counts ? cleanCounts(data.counts) : migrateFromV1(data);
  core.counts = counts;
  core.overclock = cleanOverclock(data.overclock);
  core.faults = cleanFaults(data.faults, counts);
  core.stopped = cleanStopped(data.stopped, counts);
  core.storedEU = safeDec(data.storedEU);
  core.pollution = clampPollution(safeDec(data.pollution));
  core.pollutionEnabled = booleanOr(data.pollutionEnabled, true);
  core.grid = cleanGridId(data.grid);
  core.grids = cleanGrids(data.grids, core.grid);
  core.siphoned = safeDec(data.siphoned);
  // v17 起研究细到机型：一台机器一张研究单。旧存档记的是「哪几个等级研究过」，
  // 迁移时把那些等级的全部机型都标成已研究，解锁范围不变
  core.researchedModels = data.researchedModels
    ? cleanModelIds(data.researchedModels, (model) => needsResearch(model.tier))
    : [];
  core.researchProgress = {};
  core.researchTarget = cleanModelId(
    data.researchTargetModel,
    (model) => needsResearch(model.tier),
  );
  for (const [id, amount] of Object.entries(data.researchProgressByModel ?? {})) {
    const model = MODEL_BY_ID.get(id);
    if (!model || !needsResearch(model.tier)) continue;
    const progress = safeDec(amount);
    if (progress.gt(0)) core.researchProgress[id] = progress;
  }

  if (!data.researchedModels) {
    // v16 及以前：按等级记录
    const legacyTiers = data.researched ?? [];
    for (const model of MACHINE_MODELS) {
      if (needsResearch(model.tier) && legacyTiers.includes(model.tier)) {
        core.researchedModels.push(model.id);
      }
    }
    // 旧进度是按等级记的：挂到那一级第一台还没研究的机器上，进度不白攒
    const attach = (tier: number, amount: Decimal): string | undefined => {
      const model = MACHINE_MODELS.find(
        (item) => item.tier === tier && !core.researchedModels.includes(item.id),
      );
      if (model && amount.gt(0)) core.researchProgress[model.id] = amount;
      return model?.id;
    };
    for (const [tier, amount] of Object.entries(data.researchProgressByTier ?? {})) {
      core.researchTarget = attach(Number(tier), safeDec(amount)) ?? core.researchTarget;
    }
    if (data.researchTarget !== undefined && data.researchTarget !== null) {
      core.researchTarget = attach(data.researchTarget, ZERO) ?? core.researchTarget;
    }
    if (!data.researchProgressByTier && !data.researchTarget) {
      // 更早的存档只有一个进度数字：那是当时自动挑的目标攒的
      const legacy = safeDec(data.researchProgress);
      const auto = core.researchOptions()[0];
      if (legacy.gt(0) && auto) {
        core.researchProgress[auto.id] = legacy;
        core.researchTarget = auto.id;
      }
    }
  }
  core.cables = safeDec(data.cables);
  core.rebirthCount = nonNegativeInt(data.rebirthCount);
  core.rebirthNodes = cleanRebirthNodes(data.rebirthNodes);
  core.runEU = safeDec(data.runEU);
  core.totalEU = safeDec(data.totalEU);
  // v6 及以前没有裂缝：已经在 LuV 以上存档说明这一趟早就过了这个点，
  // 默认按「已处理」算，免得读档就弹窗；下一周目会正常弹。
  core.riftOffered = booleanOr(data.riftOffered, core.maxTier >= RIFT_FROM_TIER);
  core.devMode = booleanOr(data.devMode, false);
  core.manualMines = nonNegativeInt(data.manualMines);
  core.builtMachines = nonNegativeInt(data.builtMachines);
  core.overclockUsed = booleanOr(data.overclockUsed, false);
  core.repairs = nonNegativeInt(data.repairs);
  core.maxPollution = clampPollution(safeDec(data.maxPollution));
  core.totalCables = safeDec(data.totalCables);
  core.achieved = cleanAchieved(data.achieved);
  core.universes = cleanUniverses(data.universes);
  core.essentia = safeDec(data.essentia);
  core.pendingUniverse = cleanPendingUniverse(data.pendingUniverse, core.universes);
  core.activeChallenge = cleanChallengeId(data.activeChallenge);
  core.challengeViolated = booleanOr(data.challengeViolated, false);
  core.challengePrimed = booleanOr(data.challengePrimed, false);
  core.completedChallenges = cleanChallengeList(data.completedChallenges);
  core.pendingChallenge = cleanChallengeId(data.pendingChallenge);
  core.runHistory = cleanRunHistory(data.runHistory);
  core.planckAnchor = booleanOr(data.planckAnchor, false);
  core.displayMode = cleanDisplayMode(data.displayMode);
  core.autosaveSeconds = cleanAutosaveSeconds(data.autosaveSeconds);
  core.soundEnabled = booleanOr(data.soundEnabled, true);
  core.soundMuted = cleanSoundMuted(data.soundMuted);
  core.uiTheme = cleanUiTheme(data.uiTheme);
  core.pickaxeVajra = clampInt(data.pickaxeVajra, 0, vajraMaxLevel(), 0);
  core.pickaxeCollect = clampInt(data.pickaxeCollect, 0, collectChances(MAX_TIER), 0);
  core.pickaxeBlast = clampInt(data.pickaxeBlast, 0, blastChances(MAX_TIER), 0);
  core.siliconAutoRepair = booleanOr(data.siliconAutoRepair, true);
  core.siliconAutoOverclock = booleanOr(data.siliconAutoOverclock, true);
  core.siliconShedding = booleanOr(data.siliconShedding, true);
  // 这几个计时器都是秒数，丢了只会让「距离下次判定还有多久」重新开始，
  // 但存档往返要保持一致（见 SAVE_VERSION 注释）
  const timers = isRecord(data.timers) ? data.timers : {};
  core.outageSeconds = nonNegativeFloat(timers.outageSeconds);
  core.outageTimer = nonNegativeFloat(timers.outageTimer);
  core.siphonTimer = nonNegativeFloat(timers.siphonTimer);
  core.mutationTimer = nonNegativeFloat(timers.mutationTimer);
  core.collapseTimer = nonNegativeFloat(timers.collapseTimer);
  core.totalOre = safeDec(data.totalOre);
  core.totalCoins = safeDec(data.totalCoins);
  core.totalOreSpent = safeDec(data.totalOreSpent);
  return core;
}

// v24 及以前的 13 / 14 是 UXV / MAX；机型 id、矿石索引和研究记录必须一起顺移。
function migrateUMV(data: SaveData): SaveData {
  if (data.version >= 25) return data;
  const shiftTier = (tier: number) => Number.isInteger(tier) && tier >= 13 && tier <= 14 ? tier + 1 : tier;
  const shiftModel = (id: string) => id.replace(
    /^(m|c|b|p|x|r|n|s)-(13|14)$/,
    (_, family: string, tier: string) => `${family}-${Number(tier) + 1}`,
  );
  const insertTier = <T>(values: T[], empty: T): T[] => {
    const result = values.slice();
    if (result.length > 12) result.splice(12, 0, empty);
    return result;
  };
  const shiftModels = <T>(value: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(value).map(([id, amount]) => [shiftModel(id), amount]));
  const veins = Array.isArray(data.unlockedVeins)
    ? data.unlockedVeins.filter((tier) => Number.isInteger(tier) && tier >= 0 && tier < 14)
      .map((tier) => tier >= 12 ? tier + 1 : tier)
    : [];
  if (data.maxTier >= 13 && data.maxTier <= 14) veins.push(12);
  const migrated: SaveData = {
    ...data,
    version: 25,
    maxTier: shiftTier(data.maxTier),
    ores: insertTier(Array.isArray(data.ores) ? data.ores : [], '0'),
    coins: insertTier(Array.isArray(data.coins) ? data.coins : [], '0'),
    unlockedVeins: veins,
  };
  if (data.peakTier !== undefined) migrated.peakTier = shiftTier(data.peakTier);
  if (Array.isArray(data.miners)) migrated.miners = insertTier(data.miners, 0);
  if (Array.isArray(data.generators)) migrated.generators = insertTier(data.generators, 0);
  if (Array.isArray(data.machines)) migrated.machines = insertTier(data.machines, 0);
  if (data.counts) migrated.counts = shiftModels(data.counts);
  if (data.overclock) migrated.overclock = shiftModels(data.overclock);
  if (data.faults) migrated.faults = shiftModels(data.faults);
  if (data.stopped) migrated.stopped = shiftModels(data.stopped);
  if (data.researchProgressByModel) migrated.researchProgressByModel = shiftModels(data.researchProgressByModel);
  if (Array.isArray(data.researchedModels)) {
    migrated.researchedModels = data.researchedModels.map((id) => typeof id === 'string' ? shiftModel(id) : id);
  }
  if (typeof data.researchTargetModel === 'string') migrated.researchTargetModel = shiftModel(data.researchTargetModel);
  if (Array.isArray(data.researched)) migrated.researched = data.researched.map(shiftTier);
  if (typeof data.researchTarget === 'number') migrated.researchTarget = shiftTier(data.researchTarget);
  if (data.researchProgressByTier) {
    migrated.researchProgressByTier = Object.fromEntries(
      Object.entries(data.researchProgressByTier).map(([tier, amount]) => [shiftTier(Number(tier)), amount]),
    );
  }
  if (data.pickaxeVajra !== undefined) migrated.pickaxeVajra = shiftTier(data.pickaxeVajra + 1) - 1;
  if (Array.isArray(data.runHistory)) {
    migrated.runHistory = data.runHistory.map((entry) =>
      isRecord(entry) && typeof entry.maxTier === 'number' ? { ...entry, maxTier: shiftTier(entry.maxTier) } : entry,
    );
  }
  return migrated;
}

// ── 读档清洗用的小工具 ───────────────────────────────────────
// 命名里的 clean* 都是「只信合法值」：认不出来的一律丢回默认值，不抛错、不猜。
const MODEL_BY_ID = new Map(MACHINE_MODELS.map((model) => [model.id, model]));
const MODEL_IDS = new Set(MODEL_BY_ID.keys());
const GRID_IDS = new Set(GRID_MODES.map((mode) => mode.id));
const UNIVERSE_IDS = new Set<string>(UNIVERSES.map((universe) => universe.id));
const REBIRTH_NODE_IDS = new Set(REBIRTH_NODES.map((node) => node.id));
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const size = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  if (!Number.isFinite(size)) return fallback;
  return Math.min(max, Math.max(min, size));
}

function nonNegativeInt(value: unknown): number {
  return clampInt(value, 0, Number.MAX_SAFE_INTEGER, 0);
}

// 计时器是秒数，可能带小数（快进时按整拍给），所以这里不取整
function nonNegativeFloat(value: unknown): number {
  const size = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(size) && size > 0 ? Math.min(size, 86_400) : 0;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// 数字显示模式只认三个合法值，乱写的退回自动（K / M 后缀那套）
const DISPLAY_MODES = new Set<string>(['auto', 'scientific', 'full']);

export function cleanDisplayMode(value: unknown): DisplayMode {
  return typeof value === 'string' && DISPLAY_MODES.has(value) ? (value as DisplayMode) : 'auto';
}

// 界面主题只认三套皮肤，乱写的退回暗钢（默认皮肤）
export function cleanUiTheme(value: unknown): UiTheme {
  return value === 'light' || value === 'classic' ? (value as UiTheme) : 'dark';
}

// 被单独关掉的音效只认音效表里有的 id，重复与乱写直接丢
function cleanSoundMuted(value: unknown): GameCore['soundMuted'] {
  const ids = new Set<GameCore['soundMuted'][number]>();
  if (!Array.isArray(value)) return [];
  for (const item of value) {
    if (isSoundId(item)) ids.add(item);
  }
  return [...ids];
}

// 存档间隔收在滑条的合法范围里，丢了或乱写退回默认的 10 秒
function cleanAutosaveSeconds(value: unknown): number {
  const seconds = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  if (!Number.isFinite(seconds)) return AUTOSAVE_SECONDS_DEFAULT;
  return Math.min(AUTOSAVE_SECONDS_MAX, Math.max(AUTOSAVE_SECONDS_MIN, seconds));
}

// 存档里的大数值统一走这里：不是合法十进制字符串就退回 0，负数也当 0。
function safeDec(value: unknown): Decimal {
  if (typeof value !== 'string' && typeof value !== 'number') return ZERO;
  try {
    const parsed = fromSaveString(String(value));
    return parsed.isFinite() && parsed.gte(0) ? parsed : ZERO;
  } catch {
    return ZERO;
  }
}

// 矿脉表只做「去重 + 范围收敛 + 非空」，不替存档补内容：合法的存档原样保留，
// 手改坏的（负数、超过电压上限、重复、空表）在这里抹平，不让贴图和名称查到表外。
function cleanVeins(value: unknown): number[] {
  const veins = new Set<number>();
  if (Array.isArray(value)) {
    for (const item of value) {
      const tier = typeof item === 'number' ? Math.floor(item) : Number.NaN;
      if (Number.isFinite(tier) && tier >= 0 && tier < MAX_TIER) veins.add(tier);
    }
  }
  // 开局就有的 T0：矿脉表不能是空的，否则界面会拿不到当前矿脉
  if (veins.size === 0) veins.add(0);
  return [...veins].sort((a, b) => a - b);
}

function cleanCounts(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!isRecord(value)) return counts;
  for (const [id, raw] of Object.entries(value)) {
    if (!MODEL_IDS.has(id)) continue;
    const count = nonNegativeInt(raw);
    if (count > 0) counts[id] = count;
  }
  return counts;
}

// 档位可以挂在还没建过机器的机型上（见 core.setOverclock），所以只看档位本身合不合法
function cleanOverclock(value: unknown): Record<string, number> {
  const overclock: Record<string, number> = {};
  if (!isRecord(value)) return overclock;
  for (const [id, raw] of Object.entries(value)) {
    const level = typeof raw === 'number' ? raw : Number.NaN;
    if (!MODEL_IDS.has(id) || !isValidOverclockLevel(level) || level === 0) continue;
    overclock[id] = level;
  }
  return overclock;
}

function cleanFaults(value: unknown, counts: Record<string, number>): Record<string, number> {
  const faults: Record<string, number> = {};
  if (!isRecord(value)) return faults;
  for (const [id, raw] of Object.entries(value)) {
    const faulty = Math.min(counts[id] ?? 0, nonNegativeInt(raw));
    if (faulty > 0) faults[id] = faulty;
  }
  return faults;
}

function cleanStopped(value: unknown, counts: Record<string, number>): Record<string, true> {
  const stopped: Record<string, true> = {};
  if (!isRecord(value)) return stopped;
  for (const id of Object.keys(value)) {
    if ((counts[id] ?? 0) > 0) stopped[id] = true;
  }
  return stopped;
}

function cleanGridId(value: unknown): GridMode {
  return typeof value === 'string' && GRID_IDS.has(value as GridMode)
    ? (value as GridMode)
    : DEFAULT_GRID;
}

// 默认电网与当前接着的那一档一定算已解锁 —— v4 及以前的存档没有这个概念，
// 不能让玩家读档之后被自己本来就在用的电网挡在外面。
function cleanGrids(value: unknown, current: GridMode): GridMode[] {
  const ids = new Set<GridMode>([DEFAULT_GRID, current]);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && GRID_IDS.has(item as GridMode)) ids.add(item as GridMode);
    }
  }
  return GRID_MODES.filter((mode) => ids.has(mode.id)).map((mode) => mode.id);
}

function cleanModelIds(value: unknown, keep: (model: MachineModel) => boolean): string[] {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return [];
  for (const item of value) {
    const model = typeof item === 'string' ? MODEL_BY_ID.get(item) : undefined;
    if (model && keep(model)) ids.add(model.id);
  }
  return [...ids];
}

function cleanModelId(value: unknown, keep: (model: MachineModel) => boolean): string | null {
  const list = value === null || value === undefined ? [] : [value];
  return cleanModelIds(list, keep)[0] ?? null;
}

function cleanRebirthNodes(value: unknown): string[] {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return [];
  for (const item of value) {
    if (typeof item === 'string' && REBIRTH_NODE_IDS.has(item)) ids.add(item);
  }
  return [...ids];
}

function cleanAchieved(value: unknown): Record<string, number> {
  const achieved: Record<string, number> = {};
  if (!isRecord(value)) return achieved;
  for (const [id, raw] of Object.entries(value)) {
    if (!ACHIEVEMENT_IDS.has(id)) continue;
    const at = typeof raw === 'number' ? raw : Number.NaN;
    if (Number.isFinite(at) && at >= 0) achieved[id] = Math.floor(at);
  }
  return achieved;
}

function cleanUniverses(value: unknown): GameCore['universes'] {
  const ids = new Set<GameCore['universes'][number]>();
  if (!Array.isArray(value)) return [];
  for (const item of value) {
    if (typeof item === 'string' && UNIVERSE_IDS.has(item)) {
      ids.add(item as GameCore['universes'][number]);
    }
  }
  return [...ids];
}

// 已经拿到手的宇宙不能再挂在「下次转生要带」里，否则转生时会被 addUniverse 拒掉、
// 看起来像选择丢了。
function cleanPendingUniverse(
  value: unknown,
  owned: GameCore['universes'],
): GameCore['pendingUniverse'] {
  if (typeof value !== 'string' || !UNIVERSE_IDS.has(value)) return null;
  const id = value as GameCore['universes'][number];
  return owned.includes(id) ? null : id;
}

// 履历是纯展示数据：逐条清洗，坏条目直接丢，不因为一条脏记录丢掉整份履历
function cleanRunHistory(value: unknown): GameCore['runHistory'] {
  if (!Array.isArray(value)) return [];
  const entries: GameCore['runHistory'] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const route = raw.route === 'rift' || raw.route === 'max' ? raw.route : null;
    if (route === null) continue;
    const run = nonNegativeInt(raw.run);
    const cables = safeDec(raw.cables);
    entries.push({
      run,
      route,
      universe: typeof raw.universe === 'string' ? raw.universe : '',
      challenge: typeof raw.challenge === 'string' ? raw.challenge : '',
      challengePassed: booleanOr(raw.challengePassed, false),
      cables: cables.toString(),
      seconds: nonNegativeInt(raw.seconds),
      maxTier: raw.maxTier === undefined ? 1 : Math.min(Math.max(nonNegativeInt(raw.maxTier), 1), MAX_TIER),
    });
    if (entries.length >= 50) break;
  }
  return entries;
}

// 挑战 id 只认挑战表里有的；乱写的退回 null（挂着的挑战丢了就丢了，不能崩读档）
function cleanChallengeId(value: unknown): ChallengeId | null {
  if (typeof value !== 'string' || !isChallengeId(value)) return null;
  return value;
}

function cleanChallengeList(value: unknown): ChallengeId[] {
  const ids = new Set<ChallengeId>();
  if (!Array.isArray(value)) return [];
  for (const item of value) {
    if (typeof item === 'string' && isChallengeId(item)) ids.add(item);
  }
  return [...ids];
}

// v1 存档只记了「第几级有多少台」，没有机型概念。
// 迁移时把数量挂到该等级的第一个机型上 —— 也就是当时的那种通用机器。
function migrateFromV1(data: SaveData): Record<string, number> {
  const counts: Record<string, number> = {};
  const legacy: [MachineKind, number[] | undefined][] = [
    ['miner', data.miners],
    ['generator', data.generators],
    ['machine', data.machines],
  ];
  for (const [category, list] of legacy) {
    (list ?? []).forEach((count, index) => {
      if (!count) return;
      const tier = index + 1;
      if (tier > MAX_TIER) return;
      counts[baseModelOf(category, tier).id] = count;
    });
  }
  return counts;
}

export function saveToStorage(core: GameCore, savedAt = Date.now()): void {
  setLogGameSeconds(core.playSeconds);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(core)));
    writeSaveTime(savedAt);
    if (writeFailureLogged) {
      writeFailureLogged = false;
      logEvent('info', 'save.write', '存档恢复正常，能写进去了');
    }
  } catch (error) {
    // 配额满、隐私模式、被策略禁掉都会抛。按设定的间隔自动存档，
    // 所以只在「第一次失败」和「恢复后再次失败」时记录，不刷屏。
    if (!writeFailureLogged) {
      writeFailureLogged = true;
      logEvent(
        'warn',
        'save.write',
        '存档写入失败：这一局的进度可能在关掉页面后丢失',
        errorText(error),
      );
    }
  }
}

export function loadFromStorage(): GameCore | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (error) {
    logEvent('warn', 'save.read', '读不到本地存储，按新开局开始', errorText(error));
    return null;
  }
  if (!raw) {
    logEvent('info', 'save.read', '本地没有存档，按新开局开始');
    return null;
  }
  try {
    const data = JSON.parse(raw) as SaveData;
    if (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION) {
      throw new Error(`存档版本 ${data.version} 无法识别`);
    }
    const core = deserialize(data);
    setLogGameSeconds(core.playSeconds);
    logEvent('info', 'save.read', `读取存档成功（存档版本 ${data.version}）`);
    return core;
  } catch (error) {
    // 旧存档没被删掉：下次修好了还能读回来，所以日志里要写清楚
    logEvent(
      'error',
      'save.read',
      '存档读取失败，这次按新开局开始（旧存档仍在本地，没有被删除）',
      errorText(error),
    );
    console.warn('存档读取失败，已忽略：', error);
    return null;
  }
}

/*
  导入的存档走与本地读取同一套校验：JSON 可解析、版本号在支持范围内，
  然后经过 deserialize 的逐字段清洗（坏值收敛、旧版本迁移）。失败直接抛错，
  由调用方（store.importSave）记日志并给用户提示，绝不部分生效。
*/
export function parseImportedSave(text: string): GameCore {
  const data = JSON.parse(text) as SaveData;
  if (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION) {
    throw new Error(`存档版本 ${String(data.version)} 无法识别（当前程序支持 1～${SAVE_VERSION}）`);
  }
  return deserialize(data);
}

// 界面主题存在独立键里：跨存档、跨重开一局都保留
export function readSavedTheme(): unknown {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function writeSavedTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 写不进去就只在当前局生效
  }
}

export function clearStorage(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(SAVE_TIME_KEY);
}

export function writeSaveTime(savedAt = Date.now()): void {
  try {
    localStorage.setItem(SAVE_TIME_KEY, String(savedAt));
  } catch {
    // 写不进去就不补算离线收益：宁可少给，也不要拿一个假时间戳去算
  }
}

// 距离上次写档过了多少秒：没记录、解析失败、系统时间倒流都返回 0
export function secondsSinceLastSave(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(SAVE_TIME_KEY);
    if (!raw) return 0;
    const at = Number(raw);
    if (!Number.isFinite(at)) return 0;
    return Math.max(0, (Date.now() - at) / 1000);
  } catch {
    return 0;
  }
}

function pad(list: string[] | undefined, length: number): (string | undefined)[] {
  const out = new Array(length).fill('0') as (string | undefined)[];
  (list ?? []).forEach((value, index) => {
    if (index < length) out[index] = value;
  });
  return out;
}

// 存档写失败的日志只记一次，避免每 10 秒刷一条
let writeFailureLogged = false;
