import { GameCore } from './core';

// 模拟状态不放进 Pinia：Decimal 是不可变对象，被 Vue 的深层响应式包装后
// 既会丢掉类方法，也会给每次运算加上代理开销。这里用模块级单例持有它，
// 界面只读 20 Hz 刷新出来的快照。
let core = new GameCore();

export function getCore(): GameCore {
  return core;
}

export function setCore(next: GameCore): void {
  core = next;
}

export function resetCore(): void {
  core = new GameCore();
}
