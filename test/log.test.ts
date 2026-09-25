import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  LOG_LIMIT,
  clearLog,
  formatLogEntry,
  installCrashCapture,
  logEntries,
  logEvent,
  onLogChange,
  setLogGameSeconds,
  type CrashTarget,
} from '../src/game/log';
import { buildDiagnosticReport, stateSnapshot } from '../src/game/diagnostics';
import { GameCore } from '../src/game/core';
import { loadFromStorage, saveToStorage } from '../src/game/save';
import { getCore } from '../src/game/engine';
import { useGameStore } from '../src/game/store';

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
  clearLog();
  setLogGameSeconds(0);
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
