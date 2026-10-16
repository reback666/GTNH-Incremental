import type { Point } from './layout';

interface Rect { left: number; top: number; width: number; height: number }

// 键盘激活和文字区点击都从矿石中心反馈；指针坐标换算到矿石自己的坐标系。
export function miningOrigin(rect: Rect, point: Point | null, size = { width: rect.width, height: rect.height }): Point {
  const center = { x: size.width / 2, y: size.height / 2 };
  if (!point || rect.width <= 0 || rect.height <= 0 || point.x < rect.left || point.x > rect.left + rect.width ||
    point.y < rect.top || point.y > rect.top + rect.height) return center;
  const margin = Math.min(16, size.width / 4, size.height / 4);
  return {
    x: Math.max(margin, Math.min(size.width - margin, (point.x - rect.left) / rect.width * size.width)),
    y: Math.max(margin, Math.min(size.height - margin, (point.y - rect.top) / rect.height * size.height)),
  };
}
