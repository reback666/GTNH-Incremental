import type { GroundMaterial } from './ground';

export const MAX_GROUND_VOLUME = 2_000_000;
export interface GroundStructure {
  name: string;
  format: 'schem' | 'schematic' | 'litematic';
  size: [number, number, number];
  palette: string[];
  runs: number[];
  blockCount: number;
  regions: number;
  overrides: Record<string, GroundMaterial | 'skip'>;
}

export function structureVolume(size: number[]): number {
  const volume = size.reduce((total, length) => total * length, 1);
  if (size.length !== 3 || size.some(length => !Number.isSafeInteger(length) || length <= 0)
    || !Number.isSafeInteger(volume) || volume > MAX_GROUND_VOLUME) {
    throw new Error('场地尺寸无效，或超过 200 万格；请缩小蓝图选区后重新导出。');
  }
  return volume;
}

export function encodeGroundCells(cells: Uint16Array): number[] {
  const runs: number[] = [];
  for (const value of cells) {
    if (runs.length && runs[runs.length - 2] === value) runs[runs.length - 1]++;
    else runs.push(value, 1);
  }
  return runs;
}

export function decodeGroundCells(structure: GroundStructure): Uint16Array {
  const cells = new Uint16Array(structureVolume(structure.size));
  let position = 0;
  for (let index = 0; index < structure.runs.length; index += 2) {
    const value = structure.runs[index], count = structure.runs[index + 1];
    if (!Number.isInteger(value) || value < 0 || value >= structure.palette.length
      || !Number.isSafeInteger(count) || count <= 0 || position + count > cells.length) throw new Error('场地方块数据损坏。');
    cells.fill(value, position, position + count); position += count;
  }
  if (position !== cells.length) throw new Error('场地方块数量与尺寸不一致。');
  return cells;
}

export function cleanGroundStructure(value: unknown): GroundStructure {
  if (!value || typeof value !== 'object') throw new Error('场地文件内容无效。');
  const input = value as GroundStructure;
  if (!['schem', 'schematic', 'litematic'].includes(input.format) || !Array.isArray(input.size)
    || !Array.isArray(input.palette) || input.palette.length < 1 || input.palette.length > 65535
    || input.palette[0] !== 'minecraft:air' || input.palette.some(state => typeof state !== 'string' || !state || state.length > 512)
    || !Array.isArray(input.runs) || input.runs.length % 2) throw new Error('场地文件格式无效。');
  structureVolume(input.size);
  const result: GroundStructure = { name: String(input.name ?? '导入场地').slice(0, 80), format: input.format,
    size: [...input.size] as [number, number, number], palette: [...input.palette], runs: [...input.runs],
    blockCount: 0, regions: Number.isSafeInteger(input.regions) && input.regions > 0 ? input.regions : 1,
    overrides: {} };
  decodeGroundCells(result);
  for (let index = 0; index < result.runs.length; index += 2) if (result.runs[index] !== 0) result.blockCount += result.runs[index + 1];
  if (!result.blockCount) throw new Error('选区中没有可导入的方块。');
  if (input.overrides && typeof input.overrides === 'object') for (const [key, material] of Object.entries(input.overrides)) {
    if (result.palette.includes(key) && typeof material === 'string') result.overrides[key] = material;
  }
  return result;
}
