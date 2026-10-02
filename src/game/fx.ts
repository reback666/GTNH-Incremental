// 界面特效事件总线：核心层的「状态变了」（电压解锁、污染升档）与界面层的
// 「放一段粒子」解耦。store 只管 emit，FxLayer 只管订阅，两边互不认识。
// 与音效（audio.ts）同一触发点，但走独立通道：关特效不该影响音效，反之亦然。

export type FxKind = 'voltage-unlock' | 'pollution-up';

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
