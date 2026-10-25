import manifest from '../../assets/factory3d/terrain-manifest.json';
import type { GroundStructure } from './ground-structure';

export type TerrainBox = [number, number, number, number, number, number];
export interface TerrainBlock { faces: string[]; boxes: TerrainBox[]; transparent: boolean; full: boolean }
export const terrainManifest = manifest as { width: number; height: number; tileSize: number; textures: Record<string, { x: number; y: number }> };
const full: TerrainBox = [0, 0, 0, 1, 1, 1];
const aliases: Record<string, string> = {
  bricks: 'brick', stone_bricks: 'stonebrick', cracked_stone_bricks: 'stonebrick_cracked', mossy_stone_bricks: 'stonebrick_mossy',
  chiseled_stone_bricks: 'stonebrick_carved', grass_block: 'grass_top', dirt_path: 'grass_path_top',
  nether_bricks: 'nether_brick', red_nether_bricks: 'red_nether_brick', end_stone_bricks: 'end_bricks',
  terracotta: 'hardened_clay', smooth_stone: 'stone_slab_top', quartz: 'quartz_block_top', quartz_block: 'quartz_block_top',
  smooth_quartz: 'quartz_block_top', quartz_pillar: 'quartz_block_lines', chiseled_quartz_block: 'quartz_block_chiseled',
  oak: 'planks_oak', stone_brick: 'stonebrick', nether_brick: 'nether_brick', brick: 'brick',
  packed_mud: 'packed_mud', stone: 'stone',
};
const replacementStates: Record<string, string> = {
  'white-concrete': 'white_concrete', 'pink-concrete': 'pink_concrete', 'gray-concrete': 'gray_concrete',
  'black-concrete': 'black_concrete', bricks: 'bricks', diorite: 'polished_diorite', granite: 'polished_granite',
  grass: 'grass_block', moss: 'moss_block', 'cyan-terracotta': 'cyan_terracotta', 'yellow-terracotta': 'yellow_terracotta',
  // 原地板的灯块素材约定见 gtnh3d/ASSETS.md；显式替换沿用同一外观。
  froglight: 'sea_lantern', 'froglight-warm': 'glowstone',
};
const cubes = new Set(['stone', 'dirt', 'grass_block', 'podzol', 'mycelium', 'sand', 'red_sand', 'gravel', 'clay', 'bedrock',
  'obsidian', 'crying_obsidian', 'netherrack', 'end_stone', 'cobblestone', 'mossy_cobblestone', 'andesite', 'diorite', 'granite',
  'polished_andesite', 'polished_diorite', 'polished_granite', 'tuff', 'calcite', 'basalt', 'polished_basalt', 'smooth_basalt',
  'blackstone', 'polished_blackstone', 'prismarine', 'dark_prismarine', 'bricks', 'terracotta', 'glass', 'ice', 'packed_ice',
  'blue_ice', 'bookshelf', 'glowstone', 'sea_lantern', 'sponge', 'wet_sponge', 'tnt', 'soul_sand', 'soul_soil',
  'verdant_froglight', 'pearlescent_froglight', 'ochre_froglight']);
function texture(name: string): string | null {
  const alternatives = [name, aliases[name], name.replace(/^(.*)_planks$/, 'planks_$1'), name.replace(/^(.*)_log$/, 'log_$1'),
    name.replace(/^(.*)_leaves$/, 'leaves_$1'), name.replace(/^(.*)_wool$/, 'wool_colored_$1'),
    name.replace(/^(.*)_terracotta$/, 'hardened_clay_stained_$1'), name.replace(/^(.*)_stained_glass$/, 'glass_$1'),
    name.replace('light_gray', 'silver')];
  return alternatives.find(candidate => candidate && terrainManifest.textures[candidate]) ?? null;
}
export function terrainBlock(state: string, overrides: GroundStructure['overrides'] = {}): TerrainBlock | null | 'skip' {
  const replacement = overrides[state];
  if (replacement === 'skip') return 'skip';
  if (replacement) {
    const base = replacementStates[replacement];
    if (!base) return null;
    state = `minecraft:${base}`;
  }
  const match = /^minecraft:([^\[]+)(?:\[(.*)\])?$/.exec(state);
  if (!match) return null;
  let name = match[1];
  if (['air', 'cave_air', 'void_air'].includes(name)) return 'skip';
  const properties = Object.fromEntries((match[2] ?? '').split(',').filter(Boolean).map(item => item.split('=')));
  const stairs = name.endsWith('_stairs'), slab = name.endsWith('_slab');
  if (!stairs && !slab && !cubes.has(name) && !aliases[name]
    && !/_(block|concrete|concrete_powder|terracotta|wool|planks|log|wood|stem|hyphae|leaves|ore|bricks|tiles|pillar|glass|stone|dirt|sandstone|nylium)$/.test(name)) return null;
  if (!replacement && /(?:fence|wall|pane|door|trapdoor|torch|ladder|rail|sign|flower|sapling|button|pressure_plate|carpet|bed$|chest|hopper|anvil|cactus|brewing|cauldron|snow$|water$|lava$)/.test(name)) return null;
  if (stairs && properties.shape && properties.shape !== 'straight') return null;
  if (stairs || slab) name = name.replace(/_(stairs|slab)$/, '');
  const base = texture(name);
  if (!base) return null;
  const faces = Array<string>(6).fill(base);
  if (name === 'grass_block') { faces.fill('grass_side'); faces[2] = 'grass_top'; faces[3] = 'dirt'; }
  if (name === 'quartz_block' || name === 'smooth_quartz') { faces.fill('quartz_block_side'); faces[2] = 'quartz_block_top'; faces[3] = 'quartz_block_bottom'; }
  if (name === 'smooth_stone') { faces.fill('stone_slab_side'); faces[2] = faces[3] = 'stone_slab_top'; }
  if (name.endsWith('_log') || name.endsWith('_stem') || name.endsWith('_pillar')) {
    const end = texture(`${base}_top`);
    if (end) {
      const indices = properties.axis === 'x' ? [0, 1] : properties.axis === 'z' ? [4, 5] : [2, 3];
      for (const index of indices) faces[index] = end;
    }
  }
  if (faces.some(key => !terrainManifest.textures[key])) return null;
  let boxes: TerrainBox[] = [full];
  if (slab && properties.type !== 'double') boxes = [[0, properties.type === 'top' ? 0.5 : 0, 0, 1, properties.type === 'top' ? 1 : 0.5, 1]];
  if (stairs) {
    const upper = properties.half === 'top';
    const baseBox: TerrainBox = [0, upper ? 0.5 : 0, 0, 1, upper ? 1 : 0.5, 1];
    const step: TerrainBox = [0, upper ? 0 : 0.5, 0, 1, upper ? 0.5 : 1, 1];
    if (properties.facing === 'west') step[3] = 0.5;
    else if (properties.facing === 'north') step[5] = 0.5;
    else if (properties.facing === 'south') step[2] = 0.5;
    else step[0] = 0.5;
    boxes = [baseBox, step];
  }
  const transparent = /glass|leaves|ice|slime|honey/.test(name);
  return { faces, boxes, transparent, full: boxes.length === 1 && boxes[0] === full && !transparent };
}

export function unresolvedTerrainStates(structure: GroundStructure): string[] {
  return structure.palette.filter(state => terrainBlock(state, structure.overrides) === null);
}
