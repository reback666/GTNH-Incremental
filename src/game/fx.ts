// 视觉反馈不参与结算；组件取消订阅后不会继续接收采矿或解锁事件。
export type FxKind = 'voltage-unlock' | 'mine';

export interface FxEvent {
  kind: FxKind;
  /** 同一次状态变化只放一次，订阅方拿它去重 */
  seq: number;
}

let seq = 0;
const listeners = new Set<(event: FxEvent) => void>();

export function emitFx(kind: FxKind): void {
  const event: FxEvent = { kind, seq: ++seq };
  for (const listener of listeners) listener(event);
}

/** 返回取消订阅的函数（组件 onUnmounted 时调用） */
export function onFx(listener: (event: FxEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
