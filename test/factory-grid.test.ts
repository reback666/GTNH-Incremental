import { describe, expect, it } from 'vitest';
import { createCompactLayout, type Footprint, type Point } from '../src/scene/factory3d/compact-layout';

interface Placement extends Point, Footprint {}

function expectSeparated(placements: Placement[]) {
  const collisions: [number, number][] = [];
  for (let i = 0; i < placements.length; i++) {
    const a = placements[i];
    expect(Number.isInteger(a.x) && Number.isInteger(a.z)).toBe(true);
    for (let j = i + 1; j < placements.length; j++) {
      const b = placements[j];
      const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
      const gapZ = Math.max(b.z - (a.z + a.depth), a.z - (b.z + b.depth));
      if (gapX < 1 && gapZ < 1) collisions.push([i, j]);
    }
  }
  expect(collisions).toEqual([]);
}

function bounds(placements: Placement[]) {
  return {
    width: Math.max(...placements.map(point => point.x + point.width)) - Math.min(...placements.map(point => point.x)),
    depth: Math.max(...placements.map(point => point.z + point.depth)) - Math.min(...placements.map(point => point.z)),
  };
}

describe('整数方块工厂布局', () => {
  it('默认 1×1，返回左前格中心的整数偏移，外部平移后落在方块中心', () => {
    const layout = createCompactLayout();
    expect(layout.position('single', 0)).toEqual({ x: 0, z: 0 });
    const placements = Array.from({ length: 32 }, (_, index) => ({
      ...layout.position('single', index), width: 1, depth: 1,
    }));
    expectSeparated(placements);
    for (const point of placements) {
      expect((point.x + 74.5) % 1).toBe(0.5);
      expect((point.z + 75.5) % 1).toBe(0.5);
    }
    expect(placements.some((a, i) => placements.some((b, j) => i !== j
      && ((Math.abs(a.x - b.x) === 2 && a.z === b.z) || (Math.abs(a.z - b.z) === 2 && a.x === b.x))))).toBe(true);
  });

  it('1×1、3×4、7×7、63×63 的完整矩形在同类、异类混排时均留出通道', () => {
    const layout = createCompactLayout();
    const sizes: Footprint[] = [
      { width: 1, depth: 1 }, { width: 3, depth: 4 }, { width: 7, depth: 7 }, { width: 63, depth: 63 },
      { width: 1, depth: 63 }, { width: 63, depth: 1 }, { width: 4, depth: 3 },
    ];
    const placements: Placement[] = [];
    for (let index = 0; index < 112; index++) {
      const footprint = sizes[index % sizes.length];
      placements.push({ ...layout.position(`machine-${index % 3}`, index, footprint), ...footprint });
    }
    expectSeparated(placements);
  });

  it('追加同类实例和新类型、减少后恢复、筛选及逆序查询都保留原坐标和完整占地', () => {
    const layout = createCompactLayout();
    const original = ['miner', 'maker', 'reactor'].flatMap((id, kind) => Array.from({ length: 24 }, (_, index) => {
      const footprint = [{ width: 1, depth: 1 }, { width: 3, depth: 4 }, { width: 7, depth: 7 }][kind];
      return { id, index, ...layout.position(id, index, footprint), ...footprint };
    }));
    const added: Placement[] = [];
    for (let index = 24; index < 64; index++) {
      added.push({ ...layout.position('miner', index), width: 1, depth: 1 });
      added.push({ ...layout.position('new-type', index, { width: 63, depth: 63 }), width: 63, depth: 63 });
    }
    for (const previous of original.filter(point => point.id === 'maker' && point.index < 3)) {
      expect(layout.position(previous.id, previous.index)).toEqual({ x: previous.x, z: previous.z });
    }
    for (const previous of [...original].reverse()) {
      expect(layout.position(previous.id, previous.index, previous)).toEqual({ x: previous.x, z: previous.z });
    }
    expectSeparated([...original, ...added]);
  });

  it('稀疏下标只分配实际查询的实例，不因调用顺序预留百万台设备', () => {
    const layout = createCompactLayout();
    const entries = [['same', 1_000_000], ['same', 0], ['other', 1_000_000], ['same', 999_999]] as const;
    const placements = entries.map(([id, index]) => ({ ...layout.position(id, index), width: 1, depth: 1 }));
    expectSeparated(placements);
    expect(bounds(placements).width * bounds(placements).depth).toBeLessThanOrEqual(64);
    entries.forEach(([id, index], i) => expect(layout.position(id, index)).toEqual({ x: placements[i].x, z: placements[i].z }));
  });

  it('保留已隐藏或尺寸缩小的矩形，后续新设备不会占用其恢复空间', () => {
    const layout = createCompactLayout();
    const footprint = { width: 63, depth: 63 };
    const point = layout.position('large', 0, footprint);
    expect(layout.position('large', 0, { width: 1, depth: 1 })).toEqual(point);
    const added = Array.from({ length: 96 }, (_, index) => ({ ...layout.position('small', index), width: 1, depth: 1 }));
    expect(layout.position('large', 0, footprint)).toEqual(point);
    expectSeparated([{ ...point, ...footprint }, ...added]);
  });

  it('空间足够时支持原地扩大，后续分配避开扩大后的全部矩形', () => {
    const layout = createCompactLayout();
    const neighbor = layout.position('neighbor', 0);
    const point = layout.position('growing', 0);
    for (const footprint of [{ width: 3, depth: 4 }, { width: 7, depth: 7 }, { width: 63, depth: 63 }]) {
      expect(layout.position('growing', 0, footprint)).toEqual(point);
    }
    const added = Array.from({ length: 160 }, (_, index) => {
      const footprint = index % 2 ? { width: 3, depth: 4 } : { width: 1, depth: 1 };
      return { ...layout.position('added', index, footprint), ...footprint };
    });
    expect(layout.position('neighbor', 0)).toEqual(neighbor);
    expectSeparated([{ ...neighbor, width: 1, depth: 1 }, { ...point, width: 63, depth: 63 }, ...added]);
  });

  it('原地扩大冲突时明确报错，原布局仍可查询且可继续分配', () => {
    const layout = createCompactLayout();
    const first = layout.position('first', 0);
    const second = layout.position('second', 0);
    expect(() => layout.position('first', 0, { width: 63, depth: 63 })).toThrow(RangeError);
    expect(layout.position('first', 0)).toEqual(first);
    expect(layout.position('second', 0)).toEqual(second);
    expectSeparated([
      { ...first, width: 1, depth: 1 }, { ...second, width: 1, depth: 1 },
      { ...layout.position('third', 0, { width: 63, depth: 63 }), width: 63, depth: 63 },
    ]);
  });

  it('非整数尺寸向上取整后完整预留方块', () => {
    const layout = createCompactLayout();
    const placements = Array.from({ length: 48 }, (_, index) => ({
      ...layout.position('fractional', index, { width: 2.2, depth: 3.8 }), width: 3, depth: 4,
    }));
    expectSeparated(placements);
  });

  it('修改返回对象不会影响已登记的实例', () => {
    const layout = createCompactLayout();
    const point = layout.position('mutable', 0, { width: 7, depth: 7 });
    const original = { ...point };
    point.x += 1000;
    point.z -= 1000;
    expect(layout.position('mutable', 0)).toEqual(original);
  });

  it('拒绝无效尺寸和下标，避免错误占地或无限搜索', () => {
    const layout = createCompactLayout();
    for (const value of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
      expect(() => layout.position('invalid', 0, { width: value, depth: 1 })).toThrow(RangeError);
      expect(() => layout.position('invalid', 0, { width: 1, depth: value })).toThrow(RangeError);
    }
    for (const index of [-1, 0.5, NaN, Infinity]) expect(() => layout.position('invalid', index)).toThrow(RangeError);
    expect(layout.position('valid', 0)).toEqual({ x: 0, z: 0 });
  });

  it.each([1, 3, 2400])('2400 台单块设备分为 %i 类时仍紧凑、稳定且能快速分配', (types) => {
    const layout = createCompactLayout();
    const started = performance.now();
    const placements = Array.from({ length: 2400 }, (_, index) => ({
      ...layout.position(`type-${index % types}`, Math.floor(index / types)), width: 1, depth: 1,
    }));
    const elapsed = performance.now() - started;
    const extent = bounds(placements);
    expect(elapsed).toBeLessThan(2000);
    expect(extent.width).toBeLessThanOrEqual(160);
    expect(extent.depth).toBeLessThanOrEqual(160);
    expect(extent.width * extent.depth).toBeLessThanOrEqual(2400 * 8);
    expectSeparated(placements);
    for (let index = placements.length - 1; index >= 0; index--) {
      expect(layout.position(`type-${index % types}`, Math.floor(index / types))).toEqual({ x: placements[index].x, z: placements[index].z });
    }
  });
});
