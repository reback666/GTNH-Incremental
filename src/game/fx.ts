// 界面反馈事件总线：store 在「操作真的成功了」的那一刻 emit，
// FxLayer（全屏粒子 + 文字提示）与基地场景各自订阅，彼此不认识。
// 与音效（audio.ts）同一触发点但独立通道：关特效不影响音效，反之亦然。

/** 屏幕坐标（CSS 像素，视口左上原点） */
export interface FxPoint {
  x: number;
  y: number;
}

export interface FxPayloads {
  /** 电压上限提升（tier 为新上限，1 起） */
  'voltage-unlock': { tier?: number; name?: string };
  mine: { origin?: FxPoint | undefined; amount: string; veinTier: number };
  build: { modelId: string; name: string; count: number; tier: number; origin?: FxPoint | undefined };
  sell: { modelId: string; name: string; count: number; tier: number; origin?: FxPoint | undefined };
  repair: { modelId: string; name: string; count: number; origin?: FxPoint | undefined };
  'pickaxe-upgrade': { line: string; name: string; level: number; origin?: FxPoint | undefined };
  'research-done': { modelId: string; name: string };
}

export type FxKind = keyof FxPayloads;

export type FxEvent = {
  [K in FxKind]: {
    kind: K;
    payload: FxPayloads[K];
    /** 同一次状态变化只放一次，订阅方拿它去重 */
    seq: number;
  };
}[FxKind];

// 载荷字段全是可选的事件（voltage-unlock）允许省略载荷，保持旧调用 emitFx('voltage-unlock') 可用
type PayloadArgs<K extends FxKind> = {} extends FxPayloads[K]
  ? [payload?: FxPayloads[K]]
  : [payload: FxPayloads[K]];

let seq = 0;
const listeners = new Set<(event: FxEvent) => void>();

export function emitFx<K extends FxKind>(kind: K, ...args: PayloadArgs<K>): void {
  const payload = (args[0] ?? {}) as FxPayloads[K];
  const event = { kind, payload, seq: ++seq } as FxEvent;
  for (const listener of listeners) {
    // 订阅方出错不能打断 store 的操作流程
    try {
      listener(event);
    } catch {
      /* 忽略 */
    }
  }
}

/** 返回取消订阅的函数（组件卸载时调用） */
export function onFx(listener: (event: FxEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 从点击事件取反馈原点：真实指针点击用指针坐标；
 * 键盘激活（Enter/空格，detail === 0）没有指针坐标，用按钮中心。
 */
export function eventOrigin(event: Event | undefined): FxPoint | undefined {
  if (!event) return undefined;
  const mouse = event as MouseEvent;
  if (typeof mouse.clientX === 'number' && mouse.detail > 0) {
    return { x: mouse.clientX, y: mouse.clientY };
  }
  const target = event.currentTarget as Element | null;
  if (!target || typeof target.getBoundingClientRect !== 'function') return undefined;
  const rect = target.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
