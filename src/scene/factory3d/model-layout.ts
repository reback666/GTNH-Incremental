export function machineGridPosition(index: number): { x: number; z: number } {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid machine index');
  const side = Math.floor(Math.sqrt(index));
  const offset = index - side * side;
  return offset <= side ? { x: offset, z: side } : { x: side, z: side * 2 - offset };
}

export function machineIndexAtCell(x: number, z: number, width: number, depth: number, originX: number, originZ: number): number | null {
  const dx = x - originX + Math.floor(width / 2), dz = z - originZ + Math.floor(depth / 2);
  if (dx < 0 || dz < 0) return null;
  const column = Math.floor(dx / (width + 1)), row = Math.floor(dz / (depth + 1));
  if (dx - column * (width + 1) >= width || dz - row * (depth + 1) >= depth) return null;
  return column < row ? row * row + column : column * column + column * 2 - row;
}
