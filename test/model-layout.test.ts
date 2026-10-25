import { describe, expect, it } from 'vitest';
import { machineGridPosition, machineIndexAtCell } from '../src/scene/factory3d/model-layout';

describe('每个机型的完整场地布局', () => {
  it('同型号一万台占地不重复，追加数量不移动已放置的机器', () => {
    const before = Array.from({ length: 1000 }, (_, index) => machineGridPosition(index));
    const after = Array.from({ length: 10000 }, (_, index) => machineGridPosition(index));
    expect(new Set(after.map(point => `${point.x},${point.z}`)).size).toBe(10000);
    expect(after.slice(0, 1000)).toEqual(before);
    expect(Math.max(...after.map(point => point.x))).toBe(99); expect(Math.max(...after.map(point => point.z))).toBe(99);
  });
  it.each([[1, 1], [3, 4], [33, 33]])('按 %s×%s 占地保留一格通道，并准确定位占用格', (width, depth) => {
    for (let index = 0; index < 1000; index++) {
      const point = machineGridPosition(index), x = 8 - Math.floor(width / 2) + point.x * (width + 1), z = 8 - Math.floor(depth / 2) + point.z * (depth + 1);
      expect(machineIndexAtCell(x, z, width, depth, 8, 8)).toBe(index);
      expect(machineIndexAtCell(x + width - 1, z + depth - 1, width, depth, 8, 8)).toBe(index);
      expect(machineIndexAtCell(x + width, z, width, depth, 8, 8)).toBeNull();
    }
  });
});
