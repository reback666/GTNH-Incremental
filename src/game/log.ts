import { formatDuration, formatStamp } from '../numeric/time';
import { appVersion, buildStamp } from './build-info';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export const LOG_CATEGORIES = ['system', 'save', 'machine', 'progress', 'simulation', 'settings', 'developer'] as const;
export type LogCategory = typeof LOG_CATEGORIES[number];
export type LogContext = Record<string, string | number | boolean | null>;

export interface LogEntry {
  seq: number;
  lastSeq: number;
  at: string;
  timestamp: string;
  lastTimestamp: string;
  gameSeconds: number;
  lastGameSeconds: number;
  sessionId: string;
  version: string;
  build: string;
  level: LogLevel;
  category: LogCategory;
  code: string;
  message: string;
  detail?: string;
  context?: LogContext;
  repeat: number;
}

export const LOG_LIMIT = 300;
export const LOG_STORAGE_KEY = 'gtnh-incremental-log';
const DETAIL_LIMIT = 1600;
const FLUSH_DELAY_MS = 500;
const REPEAT_WINDOW_MS = 5000;
const LEVEL_NAME: Record<LogLevel, string> = { debug: '调试', info: '提示', warn: '警告', error: '错误' };
const CATEGORY_NAME: Record<LogCategory, string> = {
  system: '系统', save: '存档', machine: '设备', progress: '进展',
  simulation: '生产', settings: '设置', developer: '开发者',
};
const PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

let entries: LogEntry[] = [];
let nextSeq = 1;
let gameSeconds = 0;
let debugEnabled = false;
let discarded = 0;
let storageState: 'pending' | 'saved' | 'memory' = 'memory';
let storageError = '';
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let listeners: (() => void)[] = [];
let batchDepth = 0;

export function batchLogEvents(): () => void {
  batchDepth += 1;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    batchDepth -= 1;
    if (batchDepth === 0) flushLog();
  };
}

export function levelName(level: LogLevel): string { return LEVEL_NAME[level]; }
export function categoryName(category: LogCategory): string { return CATEGORY_NAME[category]; }

export function logStatus() {
  return { sessionId, debugEnabled, discarded, storageState, storageError, limit: LOG_LIMIT };
}

export function setLogDebugEnabled(enabled: boolean): void {
  if (debugEnabled === enabled) return;
  debugEnabled = enabled;
  logEvent('info', 'log.debug', enabled ? '已开启本次打开期间的调试日志' : '已关闭调试日志');
}

export function setLogGameSeconds(seconds: number): void {
  if (Number.isFinite(seconds) && seconds >= 0) gameSeconds = seconds;
}

export function logEvent(
  level: LogLevel, code: string, message: string, detail?: string, context?: LogContext,
): LogEntry {
  const now = new Date();
  const entry: LogEntry = {
    seq: nextSeq, lastSeq: nextSeq, at: formatStamp(now), timestamp: now.toISOString(),
    lastTimestamp: now.toISOString(), gameSeconds, lastGameSeconds: gameSeconds,
    sessionId, version: appVersion(), build: buildStamp(), level, category: categoryOf(code), code: clip(code, 96),
    message: clip(message, 400), repeat: 1,
    ...(detail ? { detail: clip(detail, DETAIL_LIMIT) } : {}),
    ...(context ? { context: cleanContext(context) } : {}),
  };
  if (level === 'debug' && !debugEnabled) return cloneEntry(entry);
  nextSeq += 1;
  const previous = entries.at(-1);
  // 仅合并同一次打开中紧邻且现场相同的事件，保留首末时间及实际发生次数。
  const gap = previous ? now.getTime() - Date.parse(previous.lastTimestamp) : Infinity;
  let recorded = entry;
  if (previous && previous.sessionId === sessionId && gap >= 0 && gap <= REPEAT_WINDOW_MS &&
    previous.level === level && previous.code === entry.code && previous.message === entry.message &&
    previous.detail === entry.detail && JSON.stringify(previous.context) === JSON.stringify(entry.context)) {
    previous.repeat += 1;
    previous.lastSeq = entry.seq;
    previous.lastTimestamp = entry.timestamp;
    previous.lastGameSeconds = gameSeconds;
    recorded = previous;
  } else {
    entries.push(entry);
    trimEntries();
  }
  schedulePersist((level === 'error' || level === 'warn') && recorded === entry);
  notify();
  return cloneEntry(recorded);
}

export function logEntries(): LogEntry[] { return entries.map(cloneEntry); }

export function clearLog(): void {
  entries = [];
  discarded = 0;
  schedulePersist(true);
  notify();
}

export function onLogChange(listener: () => void): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter(item => item !== listener); };
}

export function filterLogEntries(list: LogEntry[], filter: {
  level?: LogLevel | ''; category?: LogCategory | ''; query?: string; currentSession?: boolean; since?: number;
}): LogEntry[] {
  const words = filter.query?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return list.filter(entry => {
    if (filter.level && entry.level !== filter.level) return false;
    if (filter.category && entry.category !== filter.category) return false;
    if (filter.currentSession && entry.sessionId !== sessionId) return false;
    if (filter.since !== undefined && Date.parse(entry.lastTimestamp) < filter.since) return false;
    const text = [entry.message, entry.code, entry.detail, entry.at, entry.sessionId,
      categoryName(entry.category), JSON.stringify(entry.context)].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}

export function errorText(error: unknown): string {
  try {
    if (error instanceof Error) return error.stack ?? error.name + ': ' + error.message;
    if (typeof error === 'string') return error;
    return JSON.stringify(error) ?? String(error);
  } catch {
    try { return String(error); } catch { return '无法读取异常内容'; }
  }
}

export function formatLogEntry(entry: LogEntry): string {
  const head = '[' + entry.timestamp + '] [' + levelName(entry.level) + '] [' + categoryName(entry.category) + '] ' +
    entry.message + ' (' + entry.code + ') #' + entry.seq + ' 会话 ' + entry.sessionId + ' 版本 ' + entry.version + ' 构建 ' + entry.build +
    ' 游戏内 ' + formatDuration(entry.gameSeconds) +
    (entry.repeat > 1 ? ' ×' + entry.repeat + '，最后发生 ' + entry.lastTimestamp + '，游戏内 ' + formatDuration(entry.lastGameSeconds) : '');
  const detail = [entry.context ? JSON.stringify(entry.context) : '', entry.detail].filter(Boolean).join('\n');
  return detail ? head + '\n' + detail.split('\n').map(line => '    ' + line).join('\n') : head;
}

export interface CrashTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener?(type: string, listener: (event: unknown) => void): void;
}

const crashCaptures = new WeakMap<CrashTarget, () => void>();

export function installCrashCapture(target: CrashTarget, probe?: () => string): () => void {
  const installed = crashCaptures.get(target);
  if (installed) return installed;
  const scene = (): string => {
    try { return probe?.() ?? ''; } catch { return '无法读取错误现场'; }
  };
  const error = (raw: unknown) => {
    const event = raw as ErrorEvent;
    const where = event.filename ? event.filename + ':' + event.lineno + ':' + event.colno : '';
    logEvent('error', 'window.error', '出现未捕获的错误',
      [errorText(event.error ?? event.message).slice(0, 900), where, scene()].filter(Boolean).join('\n'));
  };
  const rejection = (raw: unknown) => {
    logEvent('error', 'window.rejection', '出现未处理的异步错误',
      [errorText((raw as PromiseRejectionEvent).reason).slice(0, 900), scene()].filter(Boolean).join('\n'));
  };
  target.addEventListener('error', error);
  target.addEventListener('unhandledrejection', rejection);
  target.addEventListener('pagehide', flushLog);
  target.addEventListener('beforeunload', flushLog);
  const cleanup = () => {
    for (const [type, listener] of [['error', error], ['unhandledrejection', rejection],
      ['pagehide', flushLog], ['beforeunload', flushLog]] as const) {
      target.removeEventListener?.(type, listener);
    }
    crashCaptures.delete(target);
  };
  crashCaptures.set(target, cleanup);
  return cleanup;
}

export function loadPersistedLog(): void {
  cancelFlush();
  storageError = '';
  try {
    if (typeof localStorage === 'undefined') { storageState = 'memory'; return; }
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) throw new Error('日志内容不是事件列表');
    entries = parsed.map(restoreEntry).filter((entry): entry is LogEntry => entry !== null);
    entries.sort((a, b) => a.seq - b.seq);
    trimEntries();
    nextSeq = Math.max(nextSeq, ...entries.map(entry => entry.lastSeq + 1));
    storageState = 'saved';
  } catch (error) {
    storageState = 'memory';
    storageError = errorText(error);
  }
  notify();
}

// 普通事件合并写入；警告、错误、清空和关闭页面时立即写入。写失败保留内存，之后可重试。
export function flushLog(): void {
  persistNow();
  notify();
}

function persistNow(): void {
  cancelFlush();
  try {
    if (typeof localStorage === 'undefined') storageState = 'memory';
    else {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries));
      storageState = 'saved';
      storageError = '';
    }
  } catch (error) {
    storageState = 'memory';
    storageError = errorText(error);
  }
}

function schedulePersist(immediate: boolean): void {
  if (batchDepth > 0) { storageState = 'pending'; return; }
  if (immediate) { persistNow(); return; }
  storageState = 'pending';
  if (flushTimer === undefined) flushTimer = setTimeout(flushLog, FLUSH_DELAY_MS);
}

function cancelFlush(): void {
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
}

function trimEntries(): void {
  while (entries.length > LOG_LIMIT) {
    const lowest = Math.min(...entries.map(entry => PRIORITY[entry.level]));
    const index = entries.findIndex(entry => PRIORITY[entry.level] === lowest);
    discarded += entries[index]!.repeat;
    entries.splice(index, 1);
  }
}

function categoryOf(code: string): LogCategory {
  const prefix = code.split('.')[0];
  if (prefix === 'save') return 'save';
  if (['buy', 'sell', 'machine', 'pickaxe'].includes(prefix)) return 'machine';
  if (['research', 'voltage', 'rebirth', 'challenge', 'achievement'].includes(prefix)) return 'progress';
  if (['tick', 'offline', 'power', 'pollution'].includes(prefix)) return 'simulation';
  if (['settings', 'grid', 'silicon'].includes(prefix)) return 'settings';
  if (prefix === 'dev') return 'developer';
  return 'system';
}

function cleanContext(value: LogContext): LogContext {
  const result: LogContext = {};
  let remaining = 1600;
  for (const key of Object.keys(value).sort().slice(0, 24)) {
    if (remaining <= 0) break;
    const item = value[key];
    if (typeof item === 'string') {
      result[clip(key, 64)] = clip(item, Math.min(512, remaining));
      remaining -= Math.min(item.length, 512);
    }
    else if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) {
      result[clip(key, 64)] = item;
    }
  }
  return result;
}

function restoreEntry(value: unknown): LogEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<LogEntry>;
  if (!Number.isSafeInteger(item.seq) || item.seq! < 1 || item.seq! >= Number.MAX_SAFE_INTEGER - LOG_LIMIT ||
    typeof item.at !== 'string' || !Object.hasOwn(LEVEL_NAME, item.level ?? '') ||
    typeof item.code !== 'string' || typeof item.message !== 'string') return null;
  const timestamp = typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp))
    ? item.timestamp : Number.isFinite(Date.parse(item.at)) ? new Date(item.at).toISOString() : new Date(0).toISOString();
  const seconds = typeof item.gameSeconds === 'number' && Number.isFinite(item.gameSeconds) && item.gameSeconds >= 0 ? item.gameSeconds : 0;
  return {
    seq: item.seq!, lastSeq: Number.isSafeInteger(item.lastSeq) && item.lastSeq! >= item.seq! &&
      item.lastSeq! < Number.MAX_SAFE_INTEGER - LOG_LIMIT ? item.lastSeq! : item.seq!,
    at: clip(item.at, 40), timestamp,
    lastTimestamp: typeof item.lastTimestamp === 'string' && Number.isFinite(Date.parse(item.lastTimestamp)) ? item.lastTimestamp : timestamp,
    gameSeconds: seconds,
    lastGameSeconds: typeof item.lastGameSeconds === 'number' && Number.isFinite(item.lastGameSeconds) && item.lastGameSeconds >= seconds ? item.lastGameSeconds : seconds,
    sessionId: typeof item.sessionId === 'string' ? clip(item.sessionId, 80) : 'previous',
    version: typeof item.version === 'string' ? clip(item.version, 80) : '未知',
    build: typeof item.build === 'string' ? clip(item.build, 80) : '未知',
    level: item.level!, category: categoryOf(item.code), code: clip(item.code, 96), message: clip(item.message, 400),
    repeat: Number.isSafeInteger(item.repeat) && item.repeat! > 0 ? item.repeat! : 1,
    ...(typeof item.detail === 'string' ? { detail: clip(item.detail, DETAIL_LIMIT) } : {}),
    ...(item.context && typeof item.context === 'object' && !Array.isArray(item.context) ? { context: cleanContext(item.context) } : {}),
  };
}

function cloneEntry(entry: LogEntry): LogEntry {
  return { ...entry, ...(entry.context ? { context: { ...entry.context } } : {}) };
}

function notify(): void {
  if (batchDepth > 0) return;
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* 日志订阅失败不阻断游戏操作。 */ }
  }
}

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit) + '…（已截断）';
}
