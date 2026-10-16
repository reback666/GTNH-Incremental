// 几何小工具：按世界尺寸平铺 UV 的方块（贴图 1 格 = tile 个世界单位）。
import { BoxGeometry, type BufferGeometry } from 'three';

/**
 * BoxGeometry 的面顺序：+x, -x, +y, -y, +z, -z，每面 4 个顶点（分段为 1）。
 * 按每个面的实际宽高缩放 UV，配合 RepeatWrapping 让像素贴图不被拉伸。
 */
export function tiledBox(w: number, h: number, d: number, tile = 1): BufferGeometry {
  const geometry = new BoxGeometry(w, h, d);
  const uv = geometry.getAttribute('uv');
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = faces[face]!;
    for (let v = 0; v < 4; v += 1) {
      const i = face * 4 + v;
      uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * 机身外壳：侧面（+x、-x、-z，可选 +z）为材质组 0，顶面为材质组 1；底面贴地看不见，不画。
 * front = false 时正面由单独的机型图标面片画。每个批次只需两次绘制。
 */
export function shellBox(w: number, h: number, d: number, tile = 1, front = false): BufferGeometry {
  const geometry = tiledBox(w, h, d, tile);
  const source = geometry.getIndex()!;
  const faceIndices = (face: number) => Array.from({ length: 6 }, (_, i) => source.getX(face * 6 + i));
  const sides = [0, 1, 5, ...(front ? [4] : [])];
  const index = [...sides.flatMap(faceIndices), ...faceIndices(2)];
  geometry.setIndex(index);
  geometry.clearGroups();
  geometry.addGroup(0, sides.length * 6, 0);
  geometry.addGroup(sides.length * 6, 6, 1);
  return geometry;
}

export function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}
