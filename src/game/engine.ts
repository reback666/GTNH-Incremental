import { GameCore } from './core';

// 模拟状态不进入 Vue 的深层代理；界面只接收按模拟拍与操作更新的只读快照。
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
