import { markRaw } from 'vue';
import { defineStore } from 'pinia';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import { formatNumber, setDefaultDisplayMode, type DisplayMode } from '../numeric/format';
import { formatDuration } from '../numeric/time';
import { dec } from '../numeric/decimal';
import { coinName } from '../numeric/credit';
import { oreMaterial } from './vein-materials';
import { type PickaxeLine } from '../numeric/pickaxe';
import { pollutionBand } from '../numeric/pollution';
import { type GridMode } from '../numeric/grid';
import { challengeById, challengeSettles } from './challenges';
import { ACHIEVEMENTS } from './achievements';
import { type DevResourceTarget, type GameCore, type PayWith, type TickReport, type UiTheme } from './core';
import { MACHINE_MODELS, type MachineModel } from './models';
import { getCore, resetCore, setCore } from './engine';
import { playSound, SOUNDS, type SoundId } from './audio';
import { emitFx } from './fx';
import * as C from './constants';
import { cleanDisplayMode, cleanUiTheme, clearStorage, loadFromStorage, parseImportedSave, saveToStorage, secondsSinceLastSave, serialize, writeSaveTime, readSavedTheme, writeSavedTheme } from './save';
import { crashDetail } from './diagnostics';
import { appVersion, buildStamp } from './build-info';
import { batchLogEvents, flushLog, logEntries, logEvent, onLogChange, setLogGameSeconds, type LogContext } from './log';

import { buildSnapshot } from './presentation/snapshot';
import type { Snapshot } from './presentation/types';
import { advanceSimulation, ElapsedClock } from './runtime';
import type { ArcaneCommand } from './arcane-expedition';

const CRASH_STREAK_LIMIT = 5;

export const REBIRTH_TABS = ['bonuses', 'universes', 'challenges', 'history'] as const;
export type RebirthTab = (typeof REBIRTH_TABS)[number];

const POLLUTION_BAND_NAME = {
  clean: '清洁',
  mutating: '中度污染',
  critical: '重度污染',
} as const;

// 自动存档定时器句柄：只有 restartAutosave 碰它
let autosaveTimer: ReturnType<typeof setInterval> | null = null;

// 按当前存档的音效设置播一声（总开关 + 单独关掉的都在 core 上）
function sound(id: SoundId): void {
  const core = getCore();
  playSound(id, core.soundEnabled, core.soundMuted);
}

let simulationTimer: ReturnType<typeof setInterval> | null = null;
let catchUpController: AbortController | null = null;
let catchUpSaveTime: number | null = null;
const clock = new ElapsedClock();
const cleanups: (() => void)[] = [];

export interface OfflineInventoryChange {
  kind: 'ore' | 'coin';
  name: string;
  tier: number;
  before: string;
  after: string;
  delta: string;
  produced: string;
  spent: string;
}

export interface OfflineCatchupResult {
  away: string;
  advanced: number;
  total: number;
  failed: boolean;
  changes: OfflineInventoryChange[];
}

// 设置页界面状态落盘的去重缓存：状态没变就不写 localStorage
let lastUiStateJson = '';

export const useGameStore = defineStore('game', {
  state: () => ({
    snapshot: null as Snapshot | null,
    running: false,
    // 成就列表收起来没有（纯界面状态，不进存档）
    achievementsCollapsed: false,
    // 待研究机器列表收起来没有（纯界面状态，不进存档）
    researchListCollapsed: false,
    // 星图下方当前打开的标签页（纯界面状态，不进存档）
    rebirthTab: 'bonuses' as RebirthTab,
    // 科技页的电网列表，同样默认收起（摘要显示使用中的电网）
    gridPanelCollapsed: true,
    // 设置页的单效开关列表，默认收起（总开关开着就够了，细调时才展开）
    soundListCollapsed: true,
    // 模拟连续出错时暂停（纯运行时状态，不进存档；刷新页面即可恢复）
    simulationPaused: false,
    crashStreak: 0,
    // 这次启动补算了多少离线收益（纯界面提示，不进存档）
    offlineNote: '',
    // 离线横幅被玩家关掉了（只管这次打开页面期间，换页不复活、刷新后重新出现）
    offlineBannerDismissed: false,
    // 正在补算离线收益（这期间不让在线模拟叠上去）
    catchingUp: false,
    catchUpProgress: 0,
    catchUpRemainingSeconds: null as number | null,
    offlineResult: null as OfflineCatchupResult | null,
    // 未读以事件序号为游标；轮转和合并不会掩盖后续发生的新错误。
    logErrors: 0,
    seenErrorSeq: 0,
    unseenErrors: 0,
    // 上一拍的关键状态，用来只在「状态变了」的时候记一笔日志
    phase: {
      maxTier: 1,
      band: 'clean',
      powerShort: false,
      riftPending: false,
      challengeFailed: null as string | null,
    },
  }),
  getters: {
    snap: (state): Snapshot => state.snapshot ?? buildSnapshot(getCore()),
    unseenLogErrors: (state): number => state.unseenErrors,
  },
  actions: {
    toggleAchievements(): void {
      this.achievementsCollapsed = !this.achievementsCollapsed;
    },
    toggleResearchList(): void {
      this.researchListCollapsed = !this.researchListCollapsed;
    },
    setRebirthTab(tab: RebirthTab): void {
      this.rebirthTab = tab;
    },
    toggleGridPanel(): void {
      this.gridPanelCollapsed = !this.gridPanelCollapsed;
    },
    toggleSoundList(): void {
      this.soundListCollapsed = !this.soundListCollapsed;
    },
    boot() {
      this.stop();
      this.simulationPaused = false;
      this.crashStreak = 0;
      setLogGameSeconds(0);
      const loaded = loadFromStorage();
      // 先读时间戳再补算：补算之后马上会写一次档，时间戳会被刷新
      const away = loaded ? secondsSinceLastSave() : 0;
      if (loaded) setCore(loaded);
      setLogGameSeconds(getCore().playSeconds);
      this.applySavedTheme();
      logEvent('info', 'app.boot', `启动游戏（版本 v${appVersion()}，构建 ${buildStamp()}）`);
      this.syncPhase();
      // 日志变了就刷新错误条数：设置页按钮上的小红点靠它
      cleanups.push(onLogChange(() => this.syncLogErrors()));
      this.syncLogErrors();
      this.loadUiState();
      // 状态有变就落盘（persistUiState 内部做 JSON 去重，每拍空转不写 localStorage）
      cleanups.push(this.$subscribe(() => this.persistUiState()));
      this.refresh();
      void this.catchUp(away);
    },
    async catchUp(seconds: number): Promise<void> {
      const core = getCore();
      const cap = core.offlineCapSeconds();
      const total = Number.isFinite(seconds) ? Math.min(Math.max(0, seconds), cap) : 0;
      if (total < 1 || this.simulationPaused || this.catchingUp) return;
      const controller = new AbortController();
      catchUpController = controller;
      const oresBefore = core.ores.map(value => value.toString());
      const coinValuesBefore = core.coins.map(value => value.toString());
      const oreProduced = core.ores.map(() => dec('0'));
      const oreSpent = core.ores.map(() => dec('0'));
      const coinProduced = core.coins.map(() => dec('0'));
      const oreBefore = core.totalOre;
      const coinsBefore = core.totalCoins;
      const arcaneBefore = core.hasUniverse('arcane') && core.arcaneExpedition.state.research >= 0 ? {
        discoveries: core.arcaneExpedition.state.discoveries,
        jobs: core.arcaneExpedition.state.completedJobs,
        research: core.arcaneExpedition.state.research,
        garden: core.arcaneExpedition.state.garden,
        blood: core.arcaneExpedition.state.blood,
        vis: core.arcaneExpedition.visOutput(core.arcaneContext()),
      } : null;
      const away = formatDuration(total);
      const baseTime = Date.now() - total * 1000;
      let advanced = 0;
      let failed = false;
      this.catchingUp = true;
      this.catchUpProgress = 0;
      this.catchUpRemainingSeconds = null;
      this.offlineResult = null;
      this.offlineBannerDismissed = false;
      catchUpSaveTime = baseTime;
      this.offlineNote = `离线 ${away}，正在补算生产进度…`;
      const startedAt = performance.now();
      logEvent('info', 'offline.start', `开始离线补算 ${away}`, undefined, { requestedSeconds: seconds, seconds: total });
      const finishLogs = batchLogEvents();
      try {
        await advanceSimulation({
          seconds: total,
          signal: controller.signal,
          tick: step => {
            if (getCore() !== core) { controller.abort(); return; }
            core.tick(step);
            core.lastReport.oreGained.forEach((value, index) => { oreProduced[index] = oreProduced[index]!.plus(value); });
            core.lastReport.oreSpent.forEach((value, index) => { oreSpent[index] = oreSpent[index]!.plus(value); });
            core.lastReport.coinsGained.forEach((value, index) => { coinProduced[index] = coinProduced[index]!.plus(value); });
            setLogGameSeconds(core.playSeconds);
            this.watch(core, core.lastReport, true);
            advanced += step;
            catchUpSaveTime = baseTime + advanced * 1000;
          },
          onProgress: done => {
            this.catchUpProgress = done / total;
            if (done > 0) {
              const elapsed = (performance.now() - startedAt) / 1000;
              this.catchUpRemainingSeconds = Math.max(0, (total - done) * elapsed / done);
            }
          },
        });
      } catch (error) {
        failed = true;
        this.simulationPaused = true;
        logEvent('error', 'offline.crash', '离线补算出错，已暂停模拟并保留未补算的时间', crashDetail(error, core), { advanced, remaining: total - advanced });
      } finally {
        finishLogs();
      }
      // 重置、导入或卸载后，旧异步任务不能刷新界面或覆盖新存档。
      if (controller.signal.aborted || catchUpController !== controller) return;
      catchUpController = null;
      this.catchingUp = false;
      this.catchUpRemainingSeconds = null;
      this.refresh();
      this.save();
      if (!failed) catchUpSaveTime = null;
      const gainedOre = core.totalOre.minus(oreBefore);
      const gainedCoins = core.totalCoins.minus(coinsBefore);
      this.offlineNote = failed
        ? `离线补算已暂停，已处理 ${formatDuration(advanced)}；刷新后可继续补算剩余时间。`
        : `离线 ${away}，已补算：矿石 +${formatNumber(gainedOre)}、GT 币 +${formatNumber(gainedCoins)}` +
          (total < seconds ? `（超过当前上限 ${formatDuration(cap)} 的部分不计）` : '');
      if (arcaneBefore) {
        const state = this.snap.arcaneExpedition;
        const completedResearch = state.research - arcaneBefore.research +
          Number(core.arcaneExpedition.state.garden && !arcaneBefore.garden) +
          Number(core.arcaneExpedition.state.blood && !arcaneBefore.blood);
        const pending = state.nodes.filter(node => node.location === 'candidate').length;
        const full = state.surveys.filter(survey => survey.candidates.length >= survey.capacity).length;
        const paused = state.surveys.filter(survey => survey.paused).length + state.benches.filter(bench => bench.paused).length + Number(state.researchJob?.paused === true);
        const reasons = [full ? `${full} 处候选已满` : '', paused ? `${paused} 处人工暂停` : '',
          core.lastReport.sheddedKinds.includes('research') ? '魔导设施已被电网停机' : Number(state.energy) > 0 && core.lastReport.powerRatio < 1 ? `供电 ${(core.lastReport.powerRatio * 100).toFixed(0)}%` : ''].filter(Boolean);
        this.offlineNote += `；奥术调查新增 ${state.discoveries - arcaneBefore.discoveries} 颗、完成 ${state.completedJobs - arcaneBefore.jobs} 项作业与 ${completedResearch} 项研究、待处理 ${pending} 颗；实体节点供能 ${formatNumber(arcaneBefore.vis)} → ${formatNumber(state.vis)} 灵气/秒` +
          (reasons.length ? `；当前：${reasons.join('、')}` : '');
      }
      const inventoryChanges: OfflineInventoryChange[] = [];
      const appendChanges = (
        kind: 'ore' | 'coin',
        beforeValues: string[],
        values: typeof core.ores,
        producedValues: typeof oreProduced,
        spentValues: typeof oreSpent,
      ): void => {
        const maxTier = Math.max(core.maxTier, beforeValues.length);
        const indices = Array.from({ length: maxTier }, (_, index) => index).reverse();
        for (const index of indices) {
          const before = dec(beforeValues[index] ?? '0');
          const after = values[index] ?? dec('0');
          const delta = after.minus(before);
          const produced = producedValues[index] ?? dec('0');
          const spent = spentValues[index] ?? dec('0');
          if (delta.eq(0) && produced.eq(0) && spent.eq(0)) continue;
          inventoryChanges.push({
            kind,
            name: kind === 'ore' ? oreMaterial(index) : coinName(index + 1),
            tier: kind === 'ore' ? index : index + 1,
            before: before.toString(),
            after: after.toString(),
            delta: delta.toString(),
            produced: produced.toString(),
            spent: spent.toString(),
          });
        }
      };
      appendChanges('ore', oresBefore, core.ores, oreProduced, oreSpent);
      appendChanges('coin', coinValuesBefore, core.coins, coinProduced, core.coins.map(() => dec('0')));
      const inventoryDecreases = [
        ...core.ores.map((after, index) => ({ kind: 'ore' as const, index, before: dec(oresBefore[index] ?? '0'), after })),
        ...core.coins.map((after, index) => ({ kind: 'coin' as const, index, before: dec(coinValuesBefore[index] ?? '0'), after })),
      ].flatMap(({ kind, index, before, after }) => {
        const delta = after.minus(before);
        return delta.lt(0) ? [`${kind === 'ore' ? oreMaterial(index) : coinName(index + 1)}: ${formatNumber(before)} → ${formatNumber(after)} (${formatNumber(delta)})`] : [];
      });
      this.offlineResult = {
        away,
        advanced,
        total,
        failed,
        changes: inventoryChanges,
      };
      logEvent('info', 'offline.catchup', failed ? '离线补算已暂停' : `离线补算 ${away}`, this.offlineNote, {
        advanced, remaining: total - advanced, durationMs: Math.round(performance.now() - startedAt),
        oreGained: gainedOre.toString(), coinsGained: gainedCoins.toString(), failed,
        inventoryIncreases: inventoryChanges.map(change => `${change.name}:${change.delta}`).join('; '),
        inventoryDecreases: inventoryDecreases.join('; '),
      });
    },
    dismissOfflineResult(): void {
      this.offlineResult = null;
      this.offlineBannerDismissed = true;
    },
    cancelCatchUp(): void {
      catchUpController?.abort();
      catchUpController = null;
      catchUpSaveTime = null;
      this.catchingUp = false;
      this.catchUpProgress = 0;
      this.catchUpRemainingSeconds = null;
      this.offlineResult = null;
      clock.reset();
    },
    syncLogErrors(): void {
      const errors = logEntries().filter(entry => entry.level === 'error');
      this.logErrors = errors.reduce((sum, entry) => sum + entry.repeat, 0);
      this.unseenErrors = errors.filter(entry => entry.lastSeq > this.seenErrorSeq).length;
    },
    // 玩家翻到日志面板就算看过了
    markLogSeen(): void {
      this.seenErrorSeq = Math.max(this.seenErrorSeq, ...logEntries().map(entry => entry.lastSeq));
      this.syncLogErrors();
    },
    refresh() {
      const core = getCore();
      // 界面偏好在 core 上（跟存档走），这里的全局默认每次刷新都对齐：
      // 读档、开新局、切设置后格式化口径都跟当前存档一致
      setDefaultDisplayMode(core.displayMode);
      setLogGameSeconds(core.playSeconds);
      this.snapshot = markRaw(buildSnapshot(core));
    },
    manualMine() {
      const core = getCore();
      core.manualMine();
      logEvent('debug', 'machine.mine', '手动采矿', undefined, { veinTier: core.pickaxeVeinTier(), output: core.pickaxeOutput().toString() });
      emitFx('mine');
      sound('mine');
      this.refresh();
    },
    upgradePickaxe(line: PickaxeLine) {
      const core = getCore();
      const before = balances(core);
      const previous = core.pickaxeLevel(line);
      if (!core.upgradePickaxe(line)) {
        logEvent('debug', 'pickaxe.rejected', '镐子升级未满足条件', undefined, { line, level: previous });
        return;
      }
      recordAction(core, 'pickaxe.upgrade', '升级镐子', before, { line, before: previous, after: core.pickaxeLevel(line) });
      sound('buy');
      this.refresh();
      this.save();
    },
    buy(modelId: string, count: number, payWith: PayWith = 'coin'): number {
      const core = getCore();
      const model = findModel(modelId);
      if (!model) {
        // 界面上点了没反应时，这一条能说明是「找不到机型」而不是「钱不够」
        logEvent('warn', 'buy.missing', `找不到机型 ${modelId}，这次建造被跳过`);
        return 0;
      }
      const before = balances(core);
      const ownedBefore = core.countOf(model.id);
      const bought = core.buy(model, count, payWith);
      if (bought > 0) recordAction(core, 'machine.buy', `建造 ${model.name} ×${bought}`, before,
        { modelId, requested: count, actual: bought, payWith, before: ownedBefore, after: core.countOf(model.id) });
      else logEvent('debug', 'buy.rejected', `未能建造 ${model.name}`, undefined, { modelId, requested: count, payWith });
      if (bought > 0) sound('buy');
      this.refresh();
      this.save();
      return bought;
    },
    // 出售：退回该机型结算等级的资源（买的时候用什么付，卖的时候就退什么）
    sell(modelId: string, count: number, payWith: PayWith = 'coin'): number {
      const core = getCore();
      const model = findModel(modelId);
      if (!model) return 0;
      const before = balances(core);
      const ownedBefore = core.countOf(model.id);
      const sold = core.sell(model, count, payWith);
      if (sold > 0) {
        recordAction(core, 'machine.sell', `出售 ${model.name} ×${sold}`, before,
          { modelId, requested: count, actual: sold, payWith, before: ownedBefore, after: core.countOf(model.id) });
        sound('sell');
        this.refresh();
        this.save();
      }
      return sold;
    },
    unlock(): boolean {
      const core = getCore();
      const target = core.maxTier + 1;
      const ok = core.unlock(target);
      if (ok) this.watchVoltage(core);
      this.refresh();
      this.save();
      return ok;
    },
    // 超频档位：0-3。档位越高越快、越费电，也越容易坏
    setOverclock(modelId: string, level: number): boolean {
      const core = getCore();
      const before = core.overclockOf(modelId);
      const ok = core.setOverclock(modelId, level);
      if (ok && before !== core.overclockOf(modelId)) logEvent('info', 'machine.overclock', `调整 ${findModel(modelId)?.name ?? modelId} 超频`, undefined,
        { modelId, before, after: core.overclockOf(modelId) });
      if (ok) sound('toggle');
      this.refresh();
      this.save();
      return ok;
    },
    // 手动维护：把该机型坏掉的机器全部修好
    repair(modelId: string): number {
      const fixed = getCore().repair(modelId);
      if (fixed > 0) logEvent('info', 'machine.repair', `维护 ${findModel(modelId)?.name ?? modelId}，修复 ${fixed} 台`, undefined, { modelId, fixed });
      this.refresh();
      this.save();
      return fixed;
    },
    // 手动停机 / 恢复运行。停机的一台都不产不耗，也不产生污染
    toggleStopped(modelId: string): boolean {
      const core = getCore();
      const ok = core.toggleStopped(modelId);
      if (ok) sound('toggle');
      if (ok) {
        const name = findModel(modelId)?.name ?? modelId;
        logEvent(
          'info',
          'machine.run',
          core.isStopped(modelId) ? `${name}：全部停机` : `${name}：恢复运行`,
          undefined, { modelId, stopped: core.isStopped(modelId), count: core.countOf(modelId) },
        );
        this.refresh();
        this.save();
      }
      return ok;
    },
    // 手选研究项目：算力只往选中的那一项上投
    // 手选研究项目：算力只往选中的那台机器上投
    setResearchTarget(modelId: string): boolean {
      const core = getCore();
      const before = core.researchTarget;
      const ok = core.setResearchTarget(modelId);
      if (ok) {
        const name = findModel(modelId)?.name ?? modelId;
        if (before !== core.researchTarget) logEvent('info', 'research.target', `研究项目改成 ${name}`, undefined, { modelId, before });
        this.refresh();
        this.save();
      }
      return ok;
    },
    setReactorRisk(enabled: boolean, confirmed = false): boolean {
      const core = getCore();
      if (!core.setReactorRisk(enabled, confirmed)) return false;
      logEvent(enabled ? 'warn' : 'info', 'reactor.risk', enabled ? '确认启用硅岩反应堆高风险模式' : '关闭硅岩反应堆高风险模式');
      this.refresh();
      this.save();
      return true;
    },
    arcaneAction(command: ArcaneCommand): boolean {
      const core = getCore();
      if (!core.arcaneExpedition.act(command, core.arcaneContext())) return false;
      logEvent('info', 'arcane.action', '奥术操作已执行', undefined, { action: command.type });
      this.refresh();
      this.save();
      return true;
    },
    enchant(modelId: string, level: number): boolean {
      if (!getCore().enchant(modelId, level)) return false;
      logEvent('info', 'arcane.enchant', `${findModel(modelId)?.name ?? modelId}：安装 ${level} 级附魔`);
      this.refresh(); this.save();
      return true;
    },
    setVisPriority(modelId: string, priority: number): boolean {
      if (!getCore().setVisPriority(modelId, priority)) return false;
      this.refresh(); this.save();
      return true;
    },
    setGeneratorFuelPriority(modelId: string, priority: number[]): boolean {
      const core = getCore();
      if (!core.setGeneratorFuelPriority(modelId, priority)) return false;
      logEvent('info', 'generator.fuel-priority', '调整 ' + (findModel(modelId)?.name ?? modelId) + ' 的燃料顺序', undefined,
        { modelId, priority: priority.join(',') });
      this.refresh(); this.save();
      return true;
    },
    // 换电网 / 开关污染机制：都属于设置，改完立刻生效并存档
    setGrid(mode: GridMode): void {
      const core = getCore();
      const before = core.grid;
      if (core.setGrid(mode) && core.grid !== before) logEvent('info', 'grid.change', '切换电网', undefined, { before, after: core.grid });
      this.refresh();
      this.save();
    },
    // 硅基宇宙的三项 AI 开关
    setSiliconOption(option: 'repair' | 'overclock' | 'shedding', value: boolean): void {
      const core = getCore();
      const before = option === 'repair' ? core.siliconAutoRepair : option === 'overclock' ? core.siliconAutoOverclock : core.siliconShedding;
      if (option === 'repair') core.siliconAutoRepair = value;
      else if (option === 'overclock') core.siliconAutoOverclock = value;
      else core.siliconShedding = value;
      if (before !== value) logEvent('info', 'silicon.option', '调整硅基自动控制', undefined, { option, before, after: value });
      this.refresh();
      this.save();
    },
    // 解锁电网要花对应等级的 GT 币
    unlockGrid(mode: GridMode): boolean {
      const core = getCore();
      const before = balances(core);
      const ok = core.unlockGrid(mode);
      if (ok) recordAction(core, 'grid.unlock', '解锁电网', before, { mode });
      this.refresh();
      this.save();
      return ok;
    },
    setPollutionEnabled(enabled: boolean): void {
      const core = getCore();
      if (core.pollutionEnabled !== enabled) logEvent('info', 'settings.pollution', enabled ? '开启污染机制' : '关闭污染机制', undefined, { enabled });
      core.setPollutionEnabled(enabled);
      this.refresh();
      this.save();
    },
    // 开发者模式：只是测试用的开关，关着的时候下面这些快捷操作都不生效
    setDevMode(enabled: boolean): void {
      const core = getCore();
      if (core.devMode !== enabled) logEvent('info', 'dev.mode', enabled ? '开启开发者模式' : '关闭开发者模式', undefined, { enabled });
      core.setDevMode(enabled);
      this.refresh();
      this.save();
    },
    // 数字显示模式：纯界面偏好（计划书第二十一章 #9），存档跟走、转生不清
    setDisplayMode(mode: DisplayMode): void {
      getCore().setDisplayMode(mode);
      this.refresh();
      this.save();
    },
    // 界面主题：纯外观偏好，除存档外在独立键再存一份——重开一局（清存档）不清
    setUiTheme(theme: UiTheme): void {
      getCore().setUiTheme(theme);
      writeSavedTheme(theme);
      this.refresh();
      this.save();
    },
    // 音效：总开关与每种音效的单独开关（纯听感设置，随存档走）
    setSoundEnabled(enabled: boolean): void {
      getCore().setSoundEnabled(enabled);
      this.refresh();
      this.save();
    },
    setSoundMuted(id: SoundId, muted: boolean): boolean {
      const nowMuted = getCore().setSoundMuted(id, muted);
      this.refresh();
      this.save();
      return nowMuted;
    },
    // 试听：无视单独开关直接播一声（列表里点「试听」用），总开关关着时不响
    previewSound(id: SoundId): void {
      playSound(id, getCore().soundEnabled, []);
    },
    // 自动存档间隔（秒）：存档框的滑条，改完立刻按新间隔重启定时器
    setAutosaveSeconds(seconds: number): boolean {
      const before = getCore().autosaveSeconds;
      const ok = getCore().setAutosaveSeconds(seconds);
      if (ok) {
        if (before !== seconds) logEvent('info', 'settings.autosave', '调整自动存档间隔', undefined, { before, after: getCore().autosaveSeconds });
        this.restartAutosave();
        this.refresh();
        this.save();
      }
      return ok;
    },
    devUnlockTo(tier: number): boolean {
      const ok = getCore().devUnlockTo(tier);
      if (ok) logEvent('info', 'dev.voltage', '开发者调整电压', undefined, { tier });
      this.refresh();
      this.save();
      return ok;
    },
    devAdjustResource(target: DevResourceTarget, amount: string, sign: 1 | -1): boolean {
      const core = getCore();
      const before = balances(core);
      const ok = core.devAdjustResource(target, amount, sign);
      if (ok) recordAction(core, 'dev.resource', '开发者调整资源', before, { target: JSON.stringify(target), amount, sign });
      this.refresh();
      this.save();
      return ok;
    },
    devAdvance(seconds: number): boolean {
      const ok = getCore().devAdvance(seconds);
      if (ok) {
        setLogGameSeconds(getCore().playSeconds);
        logEvent('info', 'dev.advance', '开发者推进时间', undefined, { seconds });
        this.watch(getCore(), getCore().lastReport);
      }
      this.refresh();
      this.save();
      return ok;
    },
    devClearMachines(): boolean {
      const ok = getCore().devClearMachines();
      if (ok) logEvent('info', 'dev.machines', '开发者清空机器');
      this.refresh();
      this.save();
      return ok;
    },
    // 测试用：直接把某个宇宙加进来
    devGrantUniverse(id: string): boolean {
      const ok = getCore().devGrantUniverse(id);
      if (ok) logEvent('info', 'dev.universe', '开发者添加宇宙', undefined, { id });
      this.refresh();
      this.save();
      return ok;
    },
    // 测试用：把某个宇宙撤掉
    devRevokeUniverse(id: string): boolean {
      const ok = getCore().devRevokeUniverse(id);
      if (ok) logEvent('info', 'dev.universe', '开发者移除宇宙', undefined, { id });
      this.refresh();
      this.save();
      return ok;
    },
    // 记住「下次转生带哪个宇宙」，跟着存档走
    setPendingUniverse(id: string | null): boolean {
      const core = getCore();
      const before = core.pendingUniverse;
      const ok = core.setPendingUniverse(id);
      if (ok && before !== core.pendingUniverse) logEvent('info', 'rebirth.universe', '调整下次转生宇宙', undefined, { before, after: core.pendingUniverse });
      this.refresh();
      this.save();
      return ok;
    },
    // 转生：走时空裂缝（固定 1 条）或打到 MAX（按公式结算）；可以顺带选一个平行宇宙
    rebirth(route: 'rift' | 'max', universe?: string): string | null {
      const core = getCore();
      // 结算口径要在 rebirth() 改写状态之前取好
      const previousRun = core.rebirthCount + 1;
      const challenge = core.activeChallenge;
      const passed =
        challenge !== null &&
        challengeSettles(challenge, core.challengeViolated, core.challengePrimed);
      const gained = core.rebirth(route, universe);
      if (gained !== null) {
        setLogGameSeconds(core.playSeconds);
        const note =
          challenge === null
            ? ''
            : passed
              ? `，挑战「${challengeById(challenge)!.name}」结算通过`
              : `，挑战「${challengeById(challenge)!.name}」已失效（未加成）`;
        logEvent(
          'info',
          'rebirth.done',
          `转生完成（${route === 'rift' ? '时空裂缝' : '打到 MAX'}），获得 ${gained.toString()} 条时空线缆${note}`,
          undefined, { route, gained: gained.toString(), previousRun, run: core.rebirthCount + 1, universe: universe ?? null, challenge, passed },
        );
        sound('rebirth');
        sound(passed ? 'challengePass' : 'challengeFail');
        this.syncPhase();
      }
      this.refresh();
      this.save();
      return gained === null ? null : formatNumber(gained);
    },
    declineRift(): void {
      getCore().declineRift();
      logEvent('info', 'rebirth.decline', '放弃本周目的时空裂缝');
      this.refresh();
      this.save();
    },
    buyPlanckAnchor(): void {
      const before = getCore().cables.toString();
      const owned = getCore().planckAnchor;
      getCore().buyPlanckAnchor();
      if (!owned && getCore().planckAnchor) logEvent('info', 'rebirth.anchor', '购买普朗克锚', undefined,
        { cablesBefore: before, cablesAfter: getCore().cables.toString() });
      sound('planck');
      this.refresh();
      this.save();
    },
    setPendingChallenge(id: string | null): void {
      const before = getCore().pendingChallenge;
      getCore().setPendingChallenge(id);
      if (before !== getCore().pendingChallenge) logEvent('info', 'challenge.select', '调整下周目挑战', undefined, { before, after: getCore().pendingChallenge });
      this.refresh();
      this.save();
    },
    buyRebirthNode(id: string): boolean {
      const before = getCore().cables.toString();
      const ok = getCore().buyRebirthNode(id);
      if (ok) logEvent('info', 'rebirth.node', '购买星图节点', undefined, { id, cablesBefore: before, cablesAfter: getCore().cables.toString() });
      if (ok) sound('buy');
      this.refresh();
      this.save();
      return ok;
    },
    step(dtSeconds: number) {
      // 补算离线收益时不让在线模拟叠上去，否则同一段时间会被算两遍
      if (this.catchingUp || this.simulationPaused) return;
      const core = getCore();
      try {
        const report = core.tick(dtSeconds);
        setLogGameSeconds(core.playSeconds);
        if (this.crashStreak > 0) logEvent('info', 'tick.recovered', '模拟运算已恢复', undefined, { failedTicks: this.crashStreak });
        this.crashStreak = 0;
        this.watch(core, report);
      } catch (error) {
        this.crashStreak += 1;
        setLogGameSeconds(core.playSeconds);
        // 连崩到上限就停下模拟：推不动的游戏继续空转会一直刷屏，
        // 而日志里已经有现场，玩家刷新页面就能重来
        if (this.crashStreak === 1 || this.crashStreak === CRASH_STREAK_LIMIT) {
          logEvent(
            'error',
            'tick.crash',
            `模拟运算出错（连续第 ${this.crashStreak} 次）`,
            crashDetail(error, core),
          );
        }
        if (this.crashStreak >= CRASH_STREAK_LIMIT && !this.simulationPaused) {
          this.simulationPaused = true;
          logEvent(
            'error',
            'tick.paused',
            '连续出错，模拟已暂停；可下载日志保留现场，再刷新页面重试',
          );
        }
      }
      this.refresh();
    },
    save() {
      saveToStorage(getCore(), catchUpSaveTime ?? Date.now());
    },
    // 自动存档的定时器：间隔存在 core 上（随存档走），玩家改滑条时按新间隔重启。
    // 定时器句柄放模块级，不进 Pinia 的响应式状态
    restartAutosave(): void {
      if (autosaveTimer !== null) clearInterval(autosaveTimer);
      autosaveTimer = this.running ? setInterval(() => this.save(), getCore().autosaveSeconds * 1000) : null;
    },
    // 导出当前存档为格式化 JSON（供下载）
    exportSave(): string {
      logEvent('info', 'save.export', '导出当前存档');
      return JSON.stringify(serialize(getCore()), null, 2);
    },
    /*
      导入存档文本：解析与清洗全部成功才整体生效（绝不部分应用）；
      成功后时间戳记为现在——导入的存档不知道上次玩是什么时候，不给离线补算。
    */
    importSave(text: string): { ok: boolean; message: string } {
      try {
        const core = parseImportedSave(text);
        this.cancelCatchUp();
        this.simulationPaused = false;
        this.crashStreak = 0;
        setCore(core);
        writeSaveTime();
        this.applySavedTheme();
        this.loadUiState();
        this.syncPhase();
        this.syncLogErrors();
        this.refresh();
        this.save();
        this.restartAutosave();
        logEvent('info', 'save.import', '导入存档成功，已按新存档继续');
        return { ok: true, message: '导入成功，已按新存档继续' };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logEvent('error', 'save.import', '导入存档失败，当前存档没有被动过', reason);
        return { ok: false, message: `导入失败：${reason}` };
      }
    },
    reset() {
      this.cancelCatchUp();
      this.simulationPaused = false;
      this.crashStreak = 0;
      clearStorage();
      resetCore();
      setLogGameSeconds(getCore().playSeconds);
      this.syncPhase();
      logEvent('info', 'save.reset', '重开一局（本地存档已清除）');
      // 主题与设置页的界面状态都是纯界面偏好（各自存在独立键里），重开一局不清
      this.applySavedTheme();
      this.loadUiState();
      this.refresh();
    },
    // 把独立键里的主题偏好套到当前核心上（boot 与重开一局时各调一次）
    applySavedTheme() {
      const theme = cleanUiTheme(readSavedTheme());
      getCore().setUiTheme(theme);
    },
    /*
      设置页的界面状态（折叠开关、离线横幅关闭态、开发者模式）持久化到独立键：
      折叠状态原来只在内存里，刷新就丢；开发者模式在存档里，重开一局会被清掉。
      $subscribe 每拍都会触发，靠 JSON 比对去重，状态没变就不写。
    */
    loadUiState() {
      try {
        const raw = localStorage.getItem(C.UI_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const fields = [
          'achievementsCollapsed',
          'researchListCollapsed',
          'gridPanelCollapsed',
          'soundListCollapsed',
          'offlineBannerDismissed',
        ] as const;
        const self = this as unknown as Record<string, unknown>;
        for (const field of fields) {
          if (typeof obj[field] === 'boolean') self[field] = obj[field];
        }
        if (REBIRTH_TABS.includes(obj.rebirthTab as RebirthTab)) this.rebirthTab = obj.rebirthTab as RebirthTab;
        if (typeof obj.devMode === 'boolean' && obj.devMode !== getCore().devMode) {
          this.setDevMode(obj.devMode);
        }
        // 计数方法与音效原来只随存档走，重开一局会被清掉——这里从独立键还原
        if (typeof obj.displayMode === 'string') {
          this.setDisplayMode(cleanDisplayMode(obj.displayMode));
        }
        if (typeof obj.soundEnabled === 'boolean' && obj.soundEnabled !== getCore().soundEnabled) {
          this.setSoundEnabled(obj.soundEnabled);
        }
        if (Array.isArray(obj.soundMuted)) {
          const valid = new Set(SOUNDS.map((item) => item.id));
          for (const id of obj.soundMuted) {
            if (valid.has(id) && !getCore().soundMuted.includes(id)) {
              this.setSoundMuted(id, true);
            }
          }
        }
      } catch {
        // 坏数据就当没有
      }
    },
    persistUiState() {
      const obj = {
        achievementsCollapsed: this.achievementsCollapsed,
        researchListCollapsed: this.researchListCollapsed,
        rebirthTab: this.rebirthTab,
        gridPanelCollapsed: this.gridPanelCollapsed,
        soundListCollapsed: this.soundListCollapsed,
        offlineBannerDismissed: this.offlineBannerDismissed,
        devMode: getCore().devMode,
        displayMode: getCore().displayMode,
        soundEnabled: getCore().soundEnabled,
        soundMuted: [...getCore().soundMuted],
      };
      const json = JSON.stringify(obj);
      if (json === lastUiStateJson) return;
      lastUiStateJson = json;
      try {
        localStorage.setItem(C.UI_KEY, json);
      } catch {
        // 写不进去就只在当前局生效
      }
    },
    pollTime(): void {
      if (this.catchingUp) return;
      const elapsed = clock.take(this.simulationPaused);
      if (!elapsed) return;
      if (elapsed > 5) { void this.catchUp(elapsed); return; }
      for (let i = 0; i < elapsed && !this.simulationPaused; i++) this.step(1);
    },
    start() {
      if (this.running) return;
      this.running = true;
      clock.reset();
      simulationTimer = setInterval(() => this.pollTime(), C.SIM_STEP_MS);
      this.restartAutosave();
      const save = () => { this.pollTime(); this.save(); flushLog(); };
      const visibility = () => {
        this.pollTime();
        if (document.hidden) { this.save(); flushLog(); }
      };
      window.addEventListener('beforeunload', save);
      window.addEventListener('pagehide', save);
      document.addEventListener('visibilitychange', visibility);
      cleanups.push(() => {
        window.removeEventListener('beforeunload', save);
        window.removeEventListener('pagehide', save);
        document.removeEventListener('visibilitychange', visibility);
      });
    },
    stop(): void {
      if (simulationTimer !== null) clearInterval(simulationTimer);
      if (autosaveTimer !== null) clearInterval(autosaveTimer);
      simulationTimer = null;
      autosaveTimer = null;
      this.running = false;
      this.cancelCatchUp();
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
    // 关键状态变化各记一笔：玩家来问「产出为什么不对」时，
    // 「什么时候断电的、什么时候进重度污染的」比最后一刻的数值更能说明问题
    syncPhase(): void {
      const core = getCore();
      this.phase = {
        maxTier: core.maxTier, band: core.pollutionEnabled ? pollutionBand(core.pollution) : 'clean',
        powerShort: core.lastReport.powerRatio < 1, riftPending: core.riftPending(),
        challengeFailed: core.challengeViolated ? core.activeChallenge : null,
      };
    },
    watch(core: GameCore, report: TickReport, offline = false): void {
      setLogGameSeconds(core.playSeconds);
      this.watchVoltage(core, offline);
      const phase = this.phase;
      if (report.researchUnlocked !== null) {
        const done = MACHINE_MODELS.find((item) => item.id === report.researchUnlocked);
        logEvent(
          'info',
          'research.done',
          `研究完成：${done?.name ?? report.researchUnlocked} 可以建造了`,
          undefined, { modelId: report.researchUnlocked },
        );
        if (!offline) sound('achievement');
      }
      if (report.achievementsGained > 0) {
        const ids = Object.keys(core.achieved).slice(-report.achievementsGained);
        const names = ids.map(id => ACHIEVEMENTS.find(item => item.id === id)?.name ?? id);
        logEvent('info', 'achievement.gained', `达成成就：${names.join('、')}`, undefined, { count: report.achievementsGained, ids: ids.join(',') });
        if (!offline) sound('achievement');
      }
      const band = core.pollutionEnabled ? pollutionBand(core.pollution) : 'clean';
      if (band !== phase.band) {
        logEvent(
          band === 'clean' ? 'info' : 'warn',
          'pollution.band',
          `污染进入${POLLUTION_BAND_NAME[band]}（${formatNumber(core.pollution)}%）`,
          undefined, { before: phase.band, after: band, pollution: core.pollution.toString() },
        );
        phase.band = band;
        if (!offline && band !== 'clean') sound('pollution');
      }
      const short = report.powerRatio < 1;
      if (short !== phase.powerShort) {
        logEvent(
          short ? 'warn' : 'info',
          'power.ratio',
          short ? '电力不足，产出开始降载' : '供电恢复正常',
          `供电比 ${(report.powerRatio * 100).toFixed(0)}%`,
          { powerRatio: report.powerRatio, generated: report.euGenerated.toString(), capacity: report.euCapacity.toString(),
            consumed: report.euConsumed.toString(), storedEU: core.storedEU.toString(), grid: core.grid },
        );
        if (!offline) sound(short ? 'outage' : 'restore');
        phase.powerShort = short;
      }
      if (report.mutations > 0) {
        logEvent('info', 'pollution.mutation', '污染变异产生额外收益', undefined, { count: report.mutations });
        if (!offline) sound('mutation');
      }
      if (report.siphons > 0) {
        logEvent('warn', 'power.siphon', '黑市电网窃取了 GT 币', undefined, { count: report.siphons, totalSiphoned: core.siphoned.toString() });
        if (!offline) sound('steal');
      }
      if (report.faultsGained + report.corrosionFaults > 0) logEvent('warn', 'machine.fault', '机器新增故障', undefined,
        { overclockFaults: report.faultsGained, corrosionFaults: report.corrosionFaults });
      if (report.autoRepairs > 0) logEvent('info', 'machine.autoRepair', '自动维护修复机器', undefined, { count: report.autoRepairs });
      if (report.autoOverclockUp + report.autoOverclockDown > 0) logEvent('info', 'machine.autoOverclock', '自动调整机器超频', undefined,
        { increased: report.autoOverclockUp, decreased: report.autoOverclockDown });
      if (report.sheddedKinds.length > 0) logEvent('warn', 'silicon.shedding', '自动停机以降低负载', undefined, { models: report.sheddedKinds.join(',') });
      if (report.collapses > 0) {
        logEvent('warn', 'pollution.collapse', `污染导致 ${report.collapses} 台机器故障停机，可维护恢复`, undefined,
          { count: report.collapses, pollution: core.pollution.toString() });
        if (!offline) sound('collapse');
      }
      if (report.reactorAccidents > 0) {
        logEvent('warn', 'reactor.accident', `硅岩反应堆事故：损失 ${report.reactorAccidents} 台同机型设备，其他设备不受影响`);
        if (!offline) sound('collapse');
      }
      const rift = core.riftPending();
      if (rift !== phase.riftPending) {
        phase.riftPending = rift;
        if (rift) {
          logEvent('info', 'rebirth.rift', '时空裂缝出现（本周目第一次到 LuV）');
          if (!offline) sound('rebirth');
        }
      }
      // 挑战违规只在失效那一拍上报，记一条日志让玩家知道这局拿不到加成了
      if (report.challengeFailed && report.challengeFailed !== phase.challengeFailed) {
        phase.challengeFailed = report.challengeFailed;
        const failed = challengeById(report.challengeFailed);
        logEvent(
          'warn',
          'challenge.failed',
          failed ? `挑战「${failed.name}」已失效：${failed.desc} 的规矩破掉了` : '挑战已失效',
        );
      }
    },
    watchVoltage(core: GameCore, offline = false): void {
      if (core.maxTier === this.phase.maxTier) return;
      const before = this.phase.maxTier;
      this.phase.maxTier = core.maxTier;
      setLogGameSeconds(core.playSeconds);
      logEvent('info', 'voltage.unlock', `电压上限变为 ${VOLTAGE_TIERS[core.maxTier - 1]}`, undefined,
        { before, after: core.maxTier, voltage: VOLTAGE_TIERS[core.maxTier - 1] });
      if (!offline) { sound('unlock'); emitFx('voltage-unlock'); }
    },
  },
});

function findModel(id: string): MachineModel | undefined {
  return MACHINE_MODELS.find((model) => model.id === id);
}

function balances(core: GameCore): { ores: GameCore['ores']; coins: GameCore['coins']; cables: string } {
  return { ores: [...core.ores], coins: [...core.coins], cables: core.cables.toString() };
}

function recordAction(core: GameCore, code: string, message: string, before: ReturnType<typeof balances>, context: LogContext): void {
  const changes = (previous: GameCore['ores'], current: GameCore['ores']) => current.flatMap((amount, index) =>
    amount.eq(previous[index]!) ? [] : [`${VOLTAGE_TIERS[index]}: ${previous[index]!.toString()} → ${amount.toString()} (${amount.minus(previous[index]!).toString()})`],
  ).join('; ');
  setLogGameSeconds(core.playSeconds);
  logEvent('info', code, message, undefined, {
    ...context, oreChanges: changes(before.ores, core.ores), coinChanges: changes(before.coins, core.coins),
    ...(before.cables !== core.cables.toString() ? { cablesBefore: before.cables, cablesAfter: core.cables.toString() } : {}),
  });
}

