import { cleanGroundStructure, type GroundStructure } from './ground-structure';

export const GROUND_CHUNK_SIZE = 16;

export type GroundPreset = 'grid' | 'preset-1' | 'imported';

export const GROUND_MATERIALS = [
  { id: 'white-concrete', name: '白色混凝土', texture: 'floorWhiteConcrete' },
  { id: 'pink-concrete', name: '粉红色混凝土', texture: 'floorPinkConcrete' },
  { id: 'gray-concrete', name: '灰色混凝土', texture: 'floorGrayConcrete' },
  { id: 'black-concrete', name: '黑色混凝土', texture: 'floorBlackConcrete' },
  { id: 'bricks', name: '砖块', texture: 'floorBricks' },
  { id: 'diorite', name: '磨制闪长岩', texture: 'floorPolishedDiorite' },
  { id: 'granite', name: '磨制花岗岩', texture: 'floorPolishedGranite' },
  { id: 'grass', name: '草方块', texture: 'floorGrass' },
  { id: 'moss', name: '苔藓块', texture: 'floorMoss' },
  { id: 'cyan-terracotta', name: '青色陶瓦', texture: 'floorCyanTerracotta' },
  { id: 'yellow-terracotta', name: '黄色陶瓦', texture: 'floorYellowTerracotta' },
  { id: 'froglight', name: '翠绿蛙明灯', texture: 'floorFroglight' },
  { id: 'froglight-warm', name: '珠光蛙明灯', texture: 'floorFroglightWarm' },
] as const;

export type GroundMaterial = typeof GROUND_MATERIALS[number]['id'];
export interface GroundDesign {
  preset: GroundPreset;
  cells: Record<string, GroundMaterial>;
  machine: { x: number; z: number };
  structureId?: string;
}
export interface SavedGroundPreset { id: string; name: string; design: GroundDesign }
export interface GroundLibrary {
  version: 1;
  sites: Record<string, GroundDesign>;
  presets: SavedGroundPreset[];
  structures: Record<string, GroundStructure>;
}
export interface GroundEdit { x: number; y: number; z: number; material: GroundMaterial | null }
export type GroundTool = 'view' | 'floor' | 'block' | 'erase';
export interface GroundEditor { tool: GroundTool; material: GroundMaterial; layer: number }

const materials = new Set<string>(GROUND_MATERIALS.map(material => material.id));

export function createGround(preset: GroundPreset = 'grid'): GroundDesign {
  return { preset, cells: {}, machine: { x: 8, z: 8 } };
}

export function groundCellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function isGroundCoordinate(x: number, y: number, z: number): boolean {
  return Number.isSafeInteger(x) && Number.isSafeInteger(z)
    && Number.isInteger(y) && y >= -1 && y <= 255;
}

export function editGround(design: GroundDesign, edit: GroundEdit): GroundDesign {
  if (!isGroundCoordinate(edit.x, edit.y, edit.z)) throw new RangeError('Invalid ground cell coordinate');
  const cells = { ...design.cells };
  const key = groundCellKey(edit.x, edit.y, edit.z);
  if (edit.material === null) delete cells[key];
  else {
    if (!materials.has(edit.material)) throw new RangeError('Invalid ground material');
    cells[key] = edit.material;
  }
  return { ...design, cells };
}

export function cleanGround(value: unknown): GroundDesign {
  const design = createGround();
  if (!value || typeof value !== 'object') return design;
  const input = value as Partial<GroundDesign>;
  if (input.preset === 'preset-1' || input.preset === 'imported') design.preset = input.preset;
  if (input.preset === 'imported' && typeof input.structureId === 'string') design.structureId = input.structureId;
  if (input.machine && Number.isSafeInteger(input.machine.x) && Number.isSafeInteger(input.machine.z)) {
    design.machine = { x: input.machine.x, z: input.machine.z };
  }
  if (input.cells && typeof input.cells === 'object') for (const [key, material] of Object.entries(input.cells)) {
    const coordinates = key.split(',').map(Number);
    if (coordinates.length !== 3 || !isGroundCoordinate(coordinates[0], coordinates[1], coordinates[2])
      || groundCellKey(coordinates[0], coordinates[1], coordinates[2]) !== key || !materials.has(material)) continue;
    design.cells[key] = material;
  }
  return design;
}

export function cleanGroundLibrary(value: unknown): GroundLibrary {
  const library: GroundLibrary = { version: 1, sites: {}, presets: [], structures: {} };
  if (!value || typeof value !== 'object') return library;
  const input = value as Partial<GroundLibrary>;
  if (input.version !== 1) return library;
  if (input.structures && typeof input.structures === 'object') for (const [id, structure] of Object.entries(input.structures)) {
    if (/^terrain-[a-zA-Z0-9-]+$/.test(id)) {
      try { library.structures[id] = cleanGroundStructure(structure); } catch { /* 损坏的单个场地不会阻止其他本地预设恢复。 */ }
    }
  }
  if (input.sites && typeof input.sites === 'object') for (const [key, design] of Object.entries(input.sites)) {
    if (/^[a-zA-Z0-9_-]+:\d+$/.test(key)) library.sites[key] = cleanGround(design);
  }
  const ids = new Set<string>();
  if (Array.isArray(input.presets)) for (const preset of input.presets) {
    if (!preset || typeof preset.id !== 'string' || !preset.id.startsWith('custom-')
      || ids.has(preset.id) || typeof preset.name !== 'string' || !preset.name.trim()) continue;
    ids.add(preset.id);
    library.presets.push({ id: preset.id, name: preset.name.trim().slice(0, 40), design: cleanGround(preset.design) });
  }
  return library;
}

export function groundCell(x: number, z: number): 'pink-concrete' | 'white-concrete' {
  const localX = ((Math.floor(x) % GROUND_CHUNK_SIZE) + GROUND_CHUNK_SIZE) % GROUND_CHUNK_SIZE;
  const localZ = ((Math.floor(z) % GROUND_CHUNK_SIZE) + GROUND_CHUNK_SIZE) % GROUND_CHUNK_SIZE;
  return localX === 0 || localX === 15 || localZ === 0 || localZ === 15
    ? 'pink-concrete' : 'white-concrete';
}

export function groundSiteKey(modelId: string): string {
  return `${modelId}:0`;
}
