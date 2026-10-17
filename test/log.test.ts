import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  LOG_LIMIT,
  LOG_STORAGE_KEY,
  batchLogEvents,
  clearLog,
  formatLogEntry,
  filterLogEntries,
  flushLog,
  installCrashCapture,
  logEntries,
  logEvent,
  logStatus,
  loadPersistedLog,
  onLogChange,
  setLogGameSeconds,
  setLogDebugEnabled,
  errorText,
  type CrashTarget,
} from '../src/game/log';
import { buildDiagnosticJson, buildDiagnosticReport, crashDetail, stateSnapshot } from '../src/game/diagnostics';
import { GameCore } from '../src/game/core';
import { loadFromStorage, saveToStorage, serialize } from '../src/game/save';
import { getCore, setCore } from '../src/game/engine';
import { useGameStore } from '../src/game/store';
import { dec } from '../src/numeric/decimal';
import { appVersion } from '../src/game/build-info';

// 假的事件源：只用到 addEventListener，记下监听器后由测试自己触发
function fakeTarget() {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  return {
    addEventListener(type: string, listener: (event: unknown) => void): void {
      (listeners[type] ??= []).push(listener);
    },
    fire(type: string, event: unknown): void {
      for (const listener of listeners[type] ?? []) listener(event);
    },
  };
}

beforeEach(() => {
  setLogDebugEnabled(false);
  clearLog();
  setLogGameSeconds(0);
});

afterEach(() => {
  flushLog();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('游戏日志', () => {
  it('按发生顺序记下事件，级别与标识都保留', () => {
    logEvent('info', 'app.boot', '启动游戏');
    logEvent('error', 'save.read', '存档读取失败', '原因：版本不认识');

    const entries = logEntries();
    expect(entries.map((entry) => entry.code)).toEqual(['app.boot', 'save.read']);
    expect(entries[0]!.level).toBe('info');
    expect(entries[1]!.level).toBe('error');
    expect(entries[1]!.detail).toContain('版本不认识');
    expect(entries[0]!.seq).toBeLessThan(entries[1]!.seq);
  });

  it('取出来的是副本，调用方改不动缓冲', () => {
    logEvent('info', 'test', '一条');
    const copy = logEntries();
    copy.length = 0;
    expect(logEntries().length).toBe(1);
  });

  it('容量封顶，只留最近的条目', () => {
    for (let index = 0; index < LOG_LIMIT + 20; index += 1) {
      logEvent('info', 'test', `第 ${index} 条`);
    }
    const entries = logEntries();
    expect(entries.length).toBe(LOG_LIMIT);
    expect(entries[0]!.message).toBe('第 20 条');
    expect(entries[entries.length - 1]!.message).toBe(`第 ${LOG_LIMIT + 19} 条`);
  });

  it('超长详情被截断，不会撑爆本地存储', () => {
    const entry = logEvent('error', 'test', '炸了', 'x'.repeat(5000));
    expect(entry.detail!.length).toBeLessThan(2000);
    expect(entry.detail!.endsWith('（已截断）')).toBe(true);
  });

  it('每条日志能拼成人能读的一行', () => {
    setLogGameSeconds(3725);
    const entry = logEvent('warn', 'power.ratio', '电力不足');
    const text = formatLogEntry(entry);
    expect(text).toContain('[警告]');
    expect(text).toContain('电力不足');
    expect(text).toContain('power.ratio');
    expect(text).toContain('1 小时 2 分');
  });

  it('界面订阅能收到变化通知，退订后不再收到', () => {
    let hits = 0;
    const off = onLogChange(() => {
      hits += 1;
    });
    logEvent('info', 'test', 'a');
    expect(hits).toBe(1);
    off();
    logEvent('info', 'test', 'b');
    expect(hits).toBe(1);
  });

  it('没有浏览器环境时也能用，不抛错（测试就跑在这里）', () => {
    expect(typeof localStorage).toBe('undefined');
    expect(() => logEvent('info', 'test', '无存储环境下记一条')).not.toThrow();
  });

  it('未捕获的错误与异步拒绝都会被记下来，并带上现场', () => {
    const target = fakeTarget();
    installCrashCapture(target as unknown as CrashTarget, () => '现场：电压 ULV');

    target.fire('error', {
      message: 'x is not defined',
      error: new Error('x is not defined'),
      filename: 'app.html',
      lineno: 3,
      colno: 9,
    });
    target.fire('unhandledrejection', { reason: new Error('异步炸了') });

    const entries = logEntries();
    expect(entries.map((entry) => entry.code)).toEqual(['window.error', 'window.rejection']);
    expect(entries[0]!.level).toBe('error');
    expect(entries[0]!.detail).toContain('现场：电压 ULV');
    expect(entries[1]!.detail).toContain('异步炸了');
  });
});

describe('反馈材料', () => {
  it('快照写清了当时的厂况', () => {
    const core = new GameCore();
    core.counts['m-1'] = 40;
    core.counts['g-ulv'] = 26;
    core.counts['c-1'] = 15;

    const text = stateSnapshot(core).join('\n');
    expect(text).toContain('历史最高：ULV');
    expect(text).toContain('原始采矿机');
    expect(text).toContain('×40');
    expect(text).toContain('共 81 台');
    expect(text).toContain('上一拍：');
  });

  it('报告里有环境信息、游戏状态与日志', () => {
    const core = new GameCore();
    logEvent('error', 'save.read', '存档读取失败');

    const text = buildDiagnosticReport(core);
    expect(text).toContain('=== GTNH 增量 诊断日志 ===');
    expect(text).toContain('打开方式：');
    expect(text).toContain('--- 导出时的游戏状态 ---');
    expect(text).toContain('--- 日志（共 1 条：错误 1、警告 0）---');
    expect(text).toContain('存档读取失败');
    expect(text).toContain('--- 日志结束');
  });
});

describe('结构化日志与留存', () => {
  it('调试默认关闭，开启后能按级别、分类、关键词和会话组合查询', () => {
    logEvent('debug', 'buy.rejected', '余额不足');
    expect(logEntries()).toHaveLength(0);
    setLogDebugEnabled(true);
    logEvent('debug', 'buy.rejected', '余额不足', '需要矿石', { modelId: 'm-1' });
    logEvent('info', 'save.export', '导出存档');
    const result = filterLogEntries(logEntries(), { level: 'debug', category: 'machine', query: 'M-1 矿石', currentSession: true });
    expect(result).toHaveLength(1);
    expect(result[0]!.timestamp).toMatch(/\.\d{3}Z$/);
    expect(result[0]!.sessionId).toBe(logStatus().sessionId);
    expect(result[0]!.version).toBe(appVersion());
    expect(filterLogEntries(logEntries(), { category: 'save' })).toHaveLength(1);
    expect(filterLogEntries(logEntries(), { since: Date.now() + 60000 })).toHaveLength(0);
  });

  it('合并相同现场的连续事件，保留首末时间、序号和真实次数', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T01:00:00Z'));
    const first = logEvent('warn', 'machine.fault', '故障', undefined, { count: 1 });
    vi.advanceTimersByTime(1000);
    setLogGameSeconds(1);
    logEvent('warn', 'machine.fault', '故障', undefined, { count: 1 });
    const merged = logEntries()[0]!;
    expect(logEntries()).toHaveLength(1);
    expect(merged).toMatchObject({ seq: first.seq, lastSeq: first.seq + 1, repeat: 2, gameSeconds: 0, lastGameSeconds: 1 });
    expect(merged.lastTimestamp).not.toBe(merged.timestamp);
    logEvent('warn', 'machine.fault', '故障', undefined, { count: 2 });
    expect(logEntries()).toHaveLength(2);
    vi.advanceTimersByTime(6000);
    logEvent('warn', 'machine.fault', '故障', undefined, { count: 2 });
    expect(logEntries()).toHaveLength(3);
  });

  it('容量轮转优先保留错误与警告，普通操作不会冲掉故障线索', () => {
    logEvent('error', 'window.error', '重要错误');
    logEvent('warn', 'save.write', '重要警告');
    for (let index = 0; index < LOG_LIMIT + 10; index++) logEvent('info', 'machine.buy', '建造 ' + index);
    expect(logEntries()).toHaveLength(LOG_LIMIT);
    expect(logEntries().slice(0, 2).map(entry => entry.level)).toEqual(['error', 'warn']);
    expect(logStatus().discarded).toBe(12);
  });

  it('返回值和读取结果的上下文都不能修改缓冲区', () => {
    const context = { modelId: 'm-1' };
    const result = logEvent('info', 'machine.buy', '建造', undefined, context);
    context.modelId = 'changed';
    result.context!.modelId = 'changed-again';
    logEntries()[0]!.context!.modelId = 'third-change';
    expect(logEntries()[0]!.context!.modelId).toBe('m-1');
  });

  it('批量写入普通事件，错误立即保留，离开页面前能主动刷入尾部记录', () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    for (let index = 0; index < 30; index++) logEvent('info', 'test', '事件 ' + index);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(1);
    logEvent('error', 'window.error', '立即保存');
    expect(setItem).toHaveBeenCalledTimes(2);
    const target = fakeTarget();
    installCrashCapture(target);
    logEvent('info', 'test', '最后一条');
    target.fire('pagehide', {});
    expect(JSON.parse(setItem.mock.calls.at(-1)![1]).at(-1).message).toBe('最后一条');
  });

  it('离线补算期间的事件批量通知和保存，结束后错误仍完整保留', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    const changed = vi.fn();
    const off = onLogChange(changed);
    const finish = batchLogEvents();
    try {
      logEvent('warn', 'machine.fault', '故障');
      logEvent('info', 'research.done', '研究完成');
      expect(changed).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      finish();
      finish();
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(logEntries()).toHaveLength(2);
    } finally { finish(); off(); }
  });

  it('存储写入失败只影响持久化，恢复后可重试，清空不会被延迟写入复活', () => {
    vi.useFakeTimers();
    const setItem = vi.fn().mockImplementationOnce(() => { throw new Error('quota'); });
    vi.stubGlobal('localStorage', { setItem });
    expect(() => logEvent('error', 'window.error', '仍在内存')).not.toThrow();
    expect(logStatus().storageState).toBe('memory');
    expect(logEntries()).toHaveLength(1);
    flushLog();
    expect(logStatus().storageState).toBe('saved');
    logEvent('info', 'test', '待写入');
    clearLog();
    vi.advanceTimersByTime(1000);
    expect(JSON.parse(setItem.mock.calls.at(-1)![1])).toEqual([]);
  });

  it('读取日志时过滤坏条目、修正时间并限长，现有旧日志可以继续浏览', () => {
    const raw = [
      { seq: 7, at: '2026-10-17 09:00:00', level: 'error', code: 'save.read', message: '旧日志', detail: 'x'.repeat(5000), gameSeconds: -1 },
      { seq: -1, level: 'error' }, { seq: 1e100, at: 'bad', level: 'info', code: 'test', message: 'bad' },
    ];
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(raw), setItem: vi.fn() });
    loadPersistedLog();
    expect(logEntries()).toHaveLength(1);
    const restored = logEntries()[0]!;
    expect(restored.gameSeconds).toBe(0);
    expect(restored.detail!.length).toBeLessThan(2000);
    expect(filterLogEntries(logEntries(), { currentSession: true })).toEqual([]);
    expect(logEvent('info', 'test', '新日志').seq).toBeGreaterThan(7);
  });

  it('浏览器连访问存储对象都拒绝时，日志仍可记录和导出', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
      expect(() => loadPersistedLog()).not.toThrow();
      expect(() => logEvent('warn', 'test', '存储不可用')).not.toThrow();
      expect(logStatus().storageState).toBe('memory');
      expect(buildDiagnosticReport(new GameCore())).toContain('存储不可用');
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('异常无法转为字符串、现场读取失败时，捕获和导出仍可使用', () => {
    const error = Object.create(null);
    error.circular = error;
    expect(errorText(error)).toBe('无法读取异常内容');
    const target = fakeTarget();
    installCrashCapture(target, () => { throw new Error('现场失败'); });
    installCrashCapture(target);
    target.fire('unhandledrejection', { reason: error });
    expect(logEntries()).toHaveLength(1);
    const core = new GameCore();
    vi.spyOn(core, 'batteryCapacity').mockImplementation(() => { throw new Error('状态失败'); });
    expect(buildDiagnosticReport(core)).toContain('快照读取失败');
    expect(crashDetail(new Error('x'.repeat(3000)), new GameCore())).toContain('电压上限');
  });

  it('JSON 导出保留完整结构、上下文和毫秒时间，没有存档正文', () => {
    logEvent('info', 'machine.buy', '建造', undefined, { modelId: 'm-1', actual: 2 });
    const data = JSON.parse(buildDiagnosticJson(new GameCore()));
    expect(data.schemaVersion).toBe(1);
    expect(data.entries[0].context).toEqual({ actual: 2, modelId: 'm-1' });
    expect(data.entries[0].category).toBe('machine');
    expect(data.environment.join('\n')).toContain('游戏版本');
    expect(data).not.toHaveProperty('save');
  });

  it('损坏的整本日志不会阻断启动，也不会读取其他本地数据', () => {
    const getItem = vi.fn(() => '{broken');
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
    expect(() => loadPersistedLog()).not.toThrow();
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(LOG_STORAGE_KEY);
    expect(logStatus().storageError).not.toBe('');
  });
});

describe('玩家操作与模拟的日志入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setCore(new GameCore());
    useGameStore().boot();
    clearLog();
  });
  afterEach(() => useGameStore().stop());

  it('从真实操作入口记录建造和出售的实际台数、支付方式及资源变化', () => {
    const core = getCore();
    core.ores[0] = dec('1000000');
    const store = useGameStore();
    expect(store.buy('m-1', 3, 'ore')).toBe(3);
    expect(store.sell('m-1', 1, 'ore')).toBe(1);
    const bought = logEntries().find(entry => entry.code === 'machine.buy')!;
    expect(bought.context).toMatchObject({ actual: 3, before: 0, after: 3, payWith: 'ore', modelId: 'm-1' });
    expect(bought.context!.oreChanges).toContain('1000000 →');
    expect(logEntries().find(entry => entry.code === 'machine.sell')!.context).toMatchObject({ actual: 1, before: 3, after: 2 });
  });

  it('事件时间对应当前拍，暂停后不再调用模拟，偶发错误恢复会留痕', () => {
    const core = getCore();
    const store = useGameStore();
    core.playSeconds = 100;
    core.maxTier = 2;
    store.step(1);
    expect(logEntries().find(entry => entry.code === 'voltage.unlock')!.gameSeconds).toBe(101);
    vi.spyOn(core, 'tick').mockImplementationOnce(() => { throw new Error('偶发'); });
    store.step(1);
    store.step(1);
    expect(logEntries().some(entry => entry.code === 'tick.recovered')).toBe(true);
    const elapsed = core.playSeconds;
    store.simulationPaused = true;
    store.step(1);
    expect(core.playSeconds).toBe(elapsed);
  });

  it('清空和容量轮转后，新错误与重复错误仍会重新显示未读提示', () => {
    const store = useGameStore();
    logEvent('error', 'test', '旧错误');
    store.markLogSeen();
    clearLog();
    expect(store.unseenLogErrors).toBe(0);
    logEvent('error', 'test', '新错误');
    expect(store.unseenLogErrors).toBe(1);
    store.markLogSeen();
    logEvent('error', 'test', '新错误');
    expect(store.unseenLogErrors).toBe(1);
    for (let index = 0; index < LOG_LIMIT; index++) logEvent('error', 'test', '轮转 ' + index);
    store.markLogSeen();
    logEvent('error', 'test', '轮转后的错误');
    expect(store.unseenLogErrors).toBe(1);
  });

  it('导入和重开后重置状态基线，第一拍不会误报旧周目的状态恢复', () => {
    const store = useGameStore();
    store.phase.band = 'critical';
    store.phase.powerShort = true;
    store.phase.maxTier = 10;
    expect(store.importSave(JSON.stringify(serialize(new GameCore()))).ok).toBe(true);
    store.step(1);
    expect(logEntries().some(entry => ['pollution.band', 'power.ratio', 'voltage.unlock'].includes(entry.code))).toBe(false);
    store.phase.band = 'critical';
    store.reset();
    clearLog();
    store.step(1);
    expect(logEntries().some(entry => entry.code === 'pollution.band')).toBe(false);
  });

  it('离线补算记录中间拍的研究完成，汇总包含完成时长和耗时', async () => {
    const core = getCore();
    const tick = core.tick.bind(core);
    vi.spyOn(core, 'tick').mockImplementationOnce(seconds => {
      const report = tick(seconds);
      report.researchUnlocked = 'm-2';
      return report;
    });
    await useGameStore().catchUp(3);
    const done = logEntries().find(entry => entry.code === 'research.done')!;
    expect(done).toBeDefined();
    expect(done.gameSeconds).toBe(1);
    const summary = logEntries().find(entry => entry.code === 'offline.catchup')!;
    expect(summary.context).toMatchObject({ advanced: 3, remaining: 0, failed: false });
    expect(summary.context!.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// 存档出问题是玩家最可能来问的一类：要么进度没保住，要么读档后回到开局。
// 这两条验证「真的会记下来」，而且记日志本身不会把流程带崩。
describe('存档异常的留痕', () => {
  it('存档写不进去时记一条警告，不抛错', () => {
    const restore = withStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    try {
      const core = new GameCore();
      expect(() => saveToStorage(core)).not.toThrow();
      const last = logEntries().at(-1)!;
      expect(last.code).toBe('save.write');
      expect(last.level).toBe('warn');
      expect(last.detail).toContain('QuotaExceededError');
    } finally {
      restore();
    }
  });

  it('存档读坏时记一条错误，并说明旧存档没被删掉', () => {
    // 这条路径本身会往控制台喊一声，测试里按住它，别把输出刷花
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const restore = withStorage({
      getItem: () => JSON.stringify({ version: 99 }),
      setItem: () => {},
      removeItem: () => {},
    });
    try {
      expect(loadFromStorage()).toBeNull();
      const last = logEntries().at(-1)!;
      expect(last.code).toBe('save.read');
      expect(last.level).toBe('error');
      expect(last.message).toContain('没有被删除');
    } finally {
      restore();
      quiet.mockRestore();
    }
  });
});

// node 环境本来没有 localStorage，测试里临时装一个假的，用完立刻摘掉
function withStorage(fake: {
  getItem: () => string | null;
  setItem: () => void;
  removeItem: () => void;
}): () => void {
  const holder = globalThis as { localStorage?: unknown };
  const previous = holder.localStorage;
  holder.localStorage = fake;
  return () => {
    if (previous === undefined) delete holder.localStorage;
    else holder.localStorage = previous;
  };
}

// 模拟层崩了是最难排查的一类问题：现场必须留在日志里，
// 而且要能自己停下来，别每秒刷一条。
describe('模拟出错时的兜底', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('连续崩到上限就暂停模拟，并把现场写进日志', () => {
    const store = useGameStore();
    store.boot();
    clearLog();
    const core = getCore();
    const original = core.tick;
    try {
      core.tick = () => {
        throw new Error('数值炸了');
      };
      for (let index = 0; index < 6; index += 1) store.step(1);
    } finally {
      core.tick = original;
    }

    const errors = logEntries().filter((entry) => entry.level === 'error');
    expect(store.simulationPaused).toBe(true);
    expect(errors.some((entry) => entry.code === 'tick.paused')).toBe(true);
    const crash = errors.find((entry) => entry.code === 'tick.crash')!;
    expect(crash.detail).toContain('数值炸了');
    // 现场快照要跟着走，否则作者只知道「炸了」不知道当时什么状况
    expect(crash.detail).toContain('电压上限');
    // 六拍只记两条：第一拍与暂停那一拍，中间不刷屏
    expect(errors.filter((entry) => entry.code === 'tick.crash').length).toBe(2);
  });

  it('偶发崩一拍不会停掉模拟', () => {
    const store = useGameStore();
    store.boot();
    clearLog();
    const core = getCore();
    const original = core.tick;
    try {
      core.tick = () => {
        throw new Error('偶发');
      };
      store.step(1);
      expect(store.simulationPaused).toBe(false);
      core.tick = original;
      store.step(1);
    } finally {
      core.tick = original;
    }
    expect(store.crashStreak).toBe(0);
    expect(logEntries().some((entry) => entry.code === 'tick.paused')).toBe(false);
  });
});
