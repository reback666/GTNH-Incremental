import { describe, expect, it } from 'vitest';
import { miningOrigin } from '../src/scene/mining-effects';

// 防止键盘坐标、文字区点击和缩放后的矿石使粒子偏到按钮角落。
describe('mining effect origin', () => {
  const rect = { left: 100, top: 200, width: 168, height: 168 };
  it('uses the stone center for keyboard and caption activation', () => {
    expect(miningOrigin(rect, null)).toEqual({ x: 84, y: 84 });
    expect(miningOrigin(rect, { x: 150, y: 420 })).toEqual({ x: 84, y: 84 });
  });
  it('anchors pointer effects within the actual stone', () => {
    expect(miningOrigin(rect, { x: 140, y: 260 })).toEqual({ x: 40, y: 60 });
    expect(miningOrigin(rect, { x: 100, y: 200 })).toEqual({ x: 16, y: 16 });
  });
  it('converts scaled screen coordinates into local CSS coordinates', () => {
    expect(miningOrigin({ ...rect, width: 336, height: 336 }, { x: 184, y: 368 }, { width: 168, height: 168 }))
      .toEqual({ x: 42, y: 84 });
  });
});
