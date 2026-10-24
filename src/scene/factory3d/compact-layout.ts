export interface Point { x: number; z: number }
export interface Footprint { width: number; depth: number }

interface Rectangle extends Point, Footprint {}

function overlaps(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.z < b.z + b.depth && b.z < a.z + a.depth;
}

function blockCount(value: number): number {
  const blocks = Math.ceil(value);
  if (value <= 0 || !Number.isSafeInteger(blocks + 1)) {
    throw new RangeError('Footprint dimensions must be positive finite block counts');
  }
  return blocks;
}

export function createCompactLayout() {
  let size = 16;
  let free: Rectangle[] = [{ x: 0, z: 0, width: size, depth: size }];
  const instances = new Map<string, Map<number, Rectangle>>();
  const occupied: Rectangle[] = [];

  function addFree(rectangle: Rectangle) {
    if (rectangle.width > 0 && rectangle.depth > 0) free.push(rectangle);
  }

  function grow(minimum = size + 1) {
    const next = Math.max(size * 2, minimum);
    addFree({ x: size, z: 0, width: next - size, depth: next });
    addFree({ x: 0, z: size, width: size, depth: next - size });
    size = next;
  }

  function allocate(width: number, depth: number): Rectangle {
    let index = free.findIndex(rectangle => rectangle.width >= width && rectangle.depth >= depth);
    while (index < 0) {
      grow(Math.max(width, depth));
      index = free.findIndex(rectangle => rectangle.width >= width && rectangle.depth >= depth);
    }
    const space = free.splice(index, 1)[0];
    const remainingWidth = space.width - width;
    const remainingDepth = space.depth - depth;
    if (remainingWidth > remainingDepth) {
      addFree({ x: space.x + width, z: space.z, width: remainingWidth, depth: space.depth });
      addFree({ x: space.x, z: space.z + depth, width, depth: remainingDepth });
    } else {
      addFree({ x: space.x + width, z: space.z, width: remainingWidth, depth });
      addFree({ x: space.x, z: space.z + depth, width: space.width, depth: remainingDepth });
    }
    return { x: space.x, z: space.z, width, depth };
  }

  function expand(instance: Rectangle, width: number, depth: number) {
    const expanded = { ...instance, width: Math.max(instance.width, width), depth: Math.max(instance.depth, depth) };
    if (occupied.some(other => other !== instance && overlaps(expanded, other))) {
      throw new RangeError('Footprint expansion would overlap another reserved instance or its aisle');
    }
    if (Math.max(expanded.x + expanded.width, expanded.z + expanded.depth) > size) {
      grow(Math.max(expanded.x + expanded.width, expanded.z + expanded.depth));
    }
    const spaces = free;
    free = [];
    for (const space of spaces) {
      if (!overlaps(space, expanded)) {
        free.push(space);
        continue;
      }
      const left = Math.max(space.x, expanded.x);
      const right = Math.min(space.x + space.width, expanded.x + expanded.width);
      const front = Math.max(space.z, expanded.z);
      const back = Math.min(space.z + space.depth, expanded.z + expanded.depth);
      addFree({ x: space.x, z: space.z, width: space.width, depth: front - space.z });
      addFree({ x: space.x, z: back, width: space.width, depth: space.z + space.depth - back });
      addFree({ x: space.x, z: front, width: left - space.x, depth: back - front });
      addFree({ x: right, z: front, width: space.x + space.width - right, depth: back - front });
    }
    instance.width = expanded.width;
    instance.depth = expanded.depth;
  }

  return {
    // 坐标是占地左前格的中心偏移；每份预留区域在右、后各包含一格通道。
    position(id: string, index: number, footprint?: Footprint): Point {
      if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Instance index must be a non-negative integer');
      let group = instances.get(id);
      let instance = group?.get(index);
      const width = footprint ? blockCount(footprint.width) + 1 : instance?.width ?? 2;
      const depth = footprint ? blockCount(footprint.depth) + 1 : instance?.depth ?? 2;
      if (!instance) {
        instance = allocate(width, depth);
        occupied.push(instance);
        if (!group) {
          group = new Map();
          instances.set(id, group);
        }
        group.set(index, instance);
      } else if (width > instance.width || depth > instance.depth) {
        expand(instance, width, depth);
      }
      // 不释放缩小或暂时不可见的实例，恢复数量、筛选时仍复用原占地。
      return { x: instance.x, z: instance.z };
    },
  };
}
