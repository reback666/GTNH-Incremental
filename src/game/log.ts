// 游戏日志（诊断用）：玩家遇到说不清楚的问题时，把这份日志发给作者。
//
// 三条约束决定了它的形态：
//   1. 只落在本地（内存 + localStorage），永远不自动发送 —— 由玩家自己复制或下载后再决定给谁；
//   2. 不依赖浏览器环境：模拟层、界面层、node 测试都能用（没有 localStorage 时跳过持久化）；
//   3. 记日志本身不能把游戏带崩：容量封顶、写失败只降级、格式化失败兜底成纯文本。

export type LogLevel = 'info' | 'warn' | 'error';

import { formatDuration, formatStamp } from '../numeric/time';

export interface LogEntry {
  seq: number;
  // 真实本地时间，导出后给人看
  at: string;
  // 记这一条时的游戏内秒数
  gameSeconds: number;
  level: LogLevel;
  // 稳定的事件标识（如 'save.read'）：作者靠它搜索与统计，不翻译成中文
  code: string;
  message: string;
  detail?: string;
}

export const LOG_LIMIT = 300;
export const LOG_STORAGE_KEY = 'gtnh-incremental-log';

// 单条详情的字符上限。错误堆栈加现场快照也就一两千字，封顶是为了让整本日志
// 稳定塞进 localStorage（配额通常 5 MB），不至于因为某一条特别长而写不进去。
const DETAIL_LIMIT = 1600;

const LEVEL_NAME: Record<LogLevel, string> = { info: '提示', warn: '警告', error: '错误' };

let entries: LogEntry[] = [];
let nextSeq = 1;
let gameSeconds = 0;
let persistBroken = false;
let listeners: (() => void)[] = [];

export function levelName(level: LogLevel): string {
  return LEVEL_NAME[level] ?? level;
}

// 让日志带上游戏内时间，便于把「玩家的描述」和「什么时候出的事」对上。
export function setLogGameSeconds(seconds: number): void {
  if (Number.isFinite(seconds) && seconds >= 0) gameSeconds = seconds;
}

export function logEvent(
  level: LogLevel,
  code: string,
  message: string,
  detail?: string,
): LogEntry {
  const entry: LogEntry = {
    seq: nextSeq,
    at: formatStamp(new Date()),
    gameSeconds,
    level,
    code,
    message,
    ...(detail ? { detail: clip(detail, DETAIL_LIMIT) } : {}),
  };
  nextSeq += 1;
  entries.push(entry);
  if (entries.length > LOG_LIMIT) entries = entries.slice(entries.length - LOG_LIMIT);
  persist();
  notify();
  return entry;
}

// 返回副本：调用方拿去渲染或拼接，不会反过来改到缓冲。
export function logEntries(): LogEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

export function clearLog(): void {
  entries = [];
  persist();
  notify();
}

// 订阅日志变化（界面用）。返回退订函数。
export function onLogChange(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

// 把异常统一成可阅读的一段文本：优先堆栈，其次消息，最后兜底 String()
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function formatLogEntry(entry: LogEntry): string {
  const head =
    `[${entry.at}] [${levelName(entry.level)}] ${entry.message} (${entry.code})` +
    (entry.gameSeconds > 0 ? ` 游戏内 ${formatDuration(entry.gameSeconds)}` : '');
  if (!entry.detail) return head;
  return `${head}\n${entry.detail
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}`;
}

// ── 全局异常捕获 ─────────────────────────────────────────────

// 只用到 addEventListener 这一个方法，所以参数化后可以在测试里用假对象触发。
export interface CrashTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

// 捕获漏到最外层的异常与未处理的 Promise 拒绝。
// probe 由调用方传入：出错时顺手抓一份现场（通常是当前游戏状态快照）。
export function installCrashCapture(target: CrashTarget, probe?: () => string): void {
  const scene = (): string => {
    if (!probe) return '';
    try {
      return probe();
    } catch {
      return '';
    }
  };

  target.addEventListener('error', (raw) => {
    const event = raw as ErrorEvent;
    const where = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '';
    const detail = [errorText(event.error ?? event.message), where, scene()]
      .filter((line) => line !== '')
      .join('\n');
    logEvent('error', 'window.error', '出现未捕获的错误', detail);
  });

  target.addEventListener('unhandledrejection', (raw) => {
    const event = raw as PromiseRejectionEvent;
    const detail = [errorText(event.reason), scene()].filter((line) => line !== '').join('\n');
    logEvent('error', 'window.rejection', '出现未处理的异步错误', detail);
  });
}

// ── 本地留存 ─────────────────────────────────────────────────

// 启动时读回上次的日志：玩家上次遇到的问题可能就在里面
export function loadPersistedLog(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const restored = parsed.filter(isEntry);
    entries = restored.slice(-LOG_LIMIT);
    nextSeq = restored.reduce((max, item) => Math.max(max, item.seq), 0) + 1;
  } catch {
    // 日志坏了就丢掉。它是诊断材料，不该反过来打扰玩家
    entries = [];
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined' || persistBroken) return;
  try {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 隐私模式、配额满、被策略禁掉都会走到这里。标记后不再重试，
    // 否则「记一条写失败」会再触发一次写失败，转成死循环。
    persistBroken = true;
  }
}

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // 界面订阅方自己出错不该影响记录日志
    }
  }
}

function isEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<LogEntry>;
  return (
    typeof item.seq === 'number' &&
    typeof item.at === 'string' &&
    (item.level === 'info' || item.level === 'warn' || item.level === 'error') &&
    typeof item.code === 'string' &&
    typeof item.message === 'string' &&
    (item.detail === undefined || typeof item.detail === 'string')
  );
}

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…（已截断）`;
}
