import { read } from 'nbtify';
import { encodeGroundCells, structureVolume, type GroundStructure } from './ground-structure';

type Compound = Record<string, unknown>;
const colors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const wood = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
const legacyNames: Record<number, string> = {
  1: 'stone', 2: 'grass_block', 3: 'dirt', 4: 'cobblestone', 5: 'oak_planks', 7: 'bedrock', 12: 'sand',
  13: 'gravel', 17: 'oak_log', 18: 'oak_leaves', 20: 'glass', 22: 'lapis_block', 24: 'sandstone',
  41: 'gold_block', 42: 'iron_block', 43: 'smooth_stone', 44: 'smooth_stone_slab', 45: 'bricks',
  47: 'bookshelf', 48: 'mossy_cobblestone', 49: 'obsidian', 53: 'oak_stairs', 57: 'diamond_block',
  67: 'cobblestone_stairs', 79: 'ice', 80: 'snow_block', 82: 'clay', 87: 'netherrack', 88: 'soul_sand',
  89: 'glowstone', 98: 'stone_bricks', 108: 'brick_stairs', 109: 'stone_brick_stairs', 112: 'nether_bricks',
  114: 'nether_brick_stairs', 121: 'end_stone', 125: 'oak_planks', 126: 'oak_slab', 128: 'sandstone_stairs',
  129: 'emerald_ore', 133: 'emerald_block', 134: 'spruce_stairs', 135: 'birch_stairs', 136: 'jungle_stairs',
  152: 'redstone_block', 155: 'quartz_block', 156: 'quartz_stairs', 159: 'white_terracotta', 161: 'acacia_leaves',
  162: 'acacia_log', 163: 'acacia_stairs', 164: 'dark_oak_stairs', 168: 'prismarine', 169: 'sea_lantern',
  170: 'hay_block', 172: 'terracotta', 173: 'coal_block', 179: 'red_sandstone', 180: 'red_sandstone_stairs',
  181: 'red_sandstone', 182: 'red_sandstone_slab', 201: 'purpur_block', 202: 'purpur_pillar',
  203: 'purpur_stairs', 204: 'purpur_block', 205: 'purpur_slab', 206: 'end_stone_bricks',
};
function compound(value: unknown, label: string): Compound {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Array.isArray(value)) throw new Error(`${label}缺失或损坏。`);
  return value as Compound;
}
function integer(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label}不是有效整数。`);
  return number;
}
function vector(value: unknown, label: string): [number, number, number] {
  const input = compound(value, label);
  return ['x', 'y', 'z'].map(axis => integer(input[axis] ?? input[axis.toUpperCase()], label)) as [number, number, number];
}
function bytes(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) && !(value instanceof Int8Array)) throw new Error(`${label}缺失或损坏。`);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
function blockName(value: unknown): string {
  if (typeof value === 'string') return value;
  const state = compound(value, '方块状态');
  if (typeof state.Name !== 'string') throw new Error('方块名称缺失。');
  const properties = state.Properties ? compound(state.Properties, '方块属性') : {};
  const suffix = Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${key}=${String(entry)}`).join(',');
  return state.Name + (suffix ? `[${suffix}]` : '');
}
function air(name: string): boolean { return /^minecraft:(air|cave_air|void_air)(\[|$)/.test(name); }
function paletteBuilder() {
  const palette = ['minecraft:air'];
  const ids = new Map<string, number>([['minecraft:air', 0]]);
  return { palette, id(name: string) {
    if (air(name)) return 0;
    let id = ids.get(name);
    if (id !== undefined) return id;
    if (palette.length >= 65535) throw new Error('场地方块种类超过可显示范围。');
    id = palette.length; palette.push(name); ids.set(name, id); return id;
  } };
}
function finish(name: string, format: GroundStructure['format'], size: [number, number, number], cells: Uint16Array, palette: string[], regions = 1): GroundStructure {
  let blockCount = 0; for (const state of cells) if (state) blockCount++;
  if (!blockCount) throw new Error('选区中没有可导入的方块。');
  return { name: name.replace(/\.(schem|schematic|litematic)$/i, '').slice(0, 80), format, size, palette, runs: encodeGroundCells(cells), blockCount, regions, overrides: {} };
}
function readSponge(root: Compound, name: string): GroundStructure {
  const version = integer(root.Version, '蓝图版本');
  if (![1, 2, 3].includes(version)) throw new Error(`暂不支持此 Sponge 蓝图版本：${version}。`);
  const size = [root.Width, root.Height, root.Length].map(value => integer(value, '蓝图尺寸') & 0xffff) as [number, number, number];
  const cells = new Uint16Array(structureVolume(size));
  const blocks = version === 3 ? compound(root.Blocks, '蓝图方块') : root;
  const sourcePalette = compound(blocks.Palette, '蓝图调色板');
  const builder = paletteBuilder(), remap = new Map<number, number>();
  for (const [state, index] of Object.entries(sourcePalette)) {
    const id = integer(index, '调色板编号');
    if (id < 0 || remap.has(id)) throw new Error('蓝图调色板编号重复或无效。');
    remap.set(id, builder.id(state));
  }
  const data = bytes(version === 3 ? blocks.Data : blocks.BlockData, '蓝图方块数据');
  let offset = 0;
  for (let index = 0; index < cells.length; index++) {
    let value = 0, shift = 0, next: number;
    do {
      if (offset >= data.length || shift > 28) throw new Error('蓝图方块数据不完整。');
      next = data[offset++]; value += (next & 127) * 2 ** shift; shift += 7;
    } while (next & 128);
    const state = remap.get(value);
    if (state === undefined) throw new Error('蓝图引用了不存在的方块。');
    cells[index] = state;
  }
  if (offset !== data.length) throw new Error('蓝图方块数量与尺寸不一致。');
  return finish(name, 'schem', size, cells, builder.palette);
}
function legacyState(id: number, metadata: number, mapping: Map<number, string>): string {
  if (!id) return 'minecraft:air';
  if (mapping.has(id) && !mapping.get(id)!.startsWith('minecraft:')) return `${mapping.get(id)}[legacy_data=${metadata}]`;
  if ([35, 95, 159, 160, 251, 252].includes(id)) {
    const suffix = ({ 35: 'wool', 95: 'stained_glass', 159: 'terracotta', 160: 'stained_glass_pane', 251: 'concrete', 252: 'concrete_powder' } as Record<number, string>)[id];
    return `minecraft:${colors[metadata]}_${suffix}`;
  }
  let base = legacyNames[id];
  if (id === 1) base = ['stone', 'granite', 'polished_granite', 'diorite', 'polished_diorite', 'andesite', 'polished_andesite'][metadata] ?? 'stone';
  if (id === 5 || id === 125 || id === 126) base = `${wood[metadata & 7] ?? 'oak'}_${id === 126 ? 'slab' : 'planks'}`;
  if (id === 17 || id === 162) base = `${wood[(metadata & 3) + (id === 162 ? 4 : 0)] ?? 'oak'}_log`;
  if (!base) return mapping.has(id) ? `${mapping.get(id)}[legacy_data=${metadata}]` : `legacy:block_${id}[legacy_data=${metadata}]`;
  if (base.endsWith('_stairs')) return `minecraft:${base}[facing=${['east', 'west', 'south', 'north'][metadata & 3]},half=${metadata & 4 ? 'top' : 'bottom'},shape=straight]`;
  if (base.endsWith('_slab')) return `minecraft:${base}[type=${metadata & 8 ? 'top' : 'bottom'}]`;
  if (base.endsWith('_log')) return `minecraft:${base}[axis=${['y', 'x', 'z', 'y'][(metadata >> 2) & 3]}]`;
  return `minecraft:${base}`;
}
function readLegacy(root: Compound, name: string): GroundStructure {
  const size = [root.Width, root.Height, root.Length].map(value => integer(value, '蓝图尺寸') & 0xffff) as [number, number, number];
  const cells = new Uint16Array(structureVolume(size));
  const blocks = bytes(root.Blocks, '旧版蓝图方块'), data = bytes(root.Data, '旧版蓝图状态');
  if (blocks.length !== cells.length || data.length !== cells.length) throw new Error('旧版蓝图方块数量与尺寸不一致。');
  const add = root.AddBlocks ? bytes(root.AddBlocks, '旧版扩展方块编号') : null;
  if (add && add.length < Math.ceil(cells.length / 2)) throw new Error('旧版扩展方块编号不完整。');
  const mapping = new Map<number, string>();
  if (root.SchematicaMapping) for (const [key, value] of Object.entries(compound(root.SchematicaMapping, '方块映射'))) mapping.set(integer(value, '映射编号'), key);
  const builder = paletteBuilder();
  for (let index = 0; index < cells.length; index++) {
    const high = add ? index & 1 ? add[index >> 1] >> 4 : add[index >> 1] & 15 : 0;
    cells[index] = builder.id(legacyState(blocks[index] | high << 8, data[index] & 15, mapping));
  }
  return finish(name, 'schematic', size, cells, builder.palette);
}
function readLitematic(root: Compound, name: string): GroundStructure {
  const source = Object.values(compound(root.Regions, '投影区域'));
  if (!source.length) throw new Error('投影中没有区域。');
  const regions = source.map(value => {
    const region = compound(value, '投影区域');
    const position = vector(region.Position, '投影位置'), signedSize = vector(region.Size, '投影尺寸');
    const size = signedSize.map(Math.abs) as [number, number, number];
    structureVolume(size);
    const minimum = signedSize.map((length, axis) => position[axis] + Math.min(0, length + 1));
    if (!Array.isArray(region.BlockStatePalette)) throw new Error('投影方块调色板缺失。');
    const palette = region.BlockStatePalette.map(blockName);
    const states = region.BlockStates;
    if (!(states instanceof BigInt64Array) && !(states instanceof BigUint64Array)) throw new Error('投影方块数据缺失。');
    const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
    if (!palette.length || states.length < Math.ceil(size[0] * size[1] * size[2] * bits / 64)) throw new Error('投影方块数据不完整。');
    return { size, minimum, palette, states, bits };
  });
  const minimum = [0, 1, 2].map(axis => Math.min(...regions.map(region => region.minimum[axis])));
  const maximum = [0, 1, 2].map(axis => Math.max(...regions.map(region => region.minimum[axis] + region.size[axis])));
  const size = maximum.map((value, axis) => value - minimum[axis]) as [number, number, number];
  const cells = new Uint16Array(structureVolume(size)), builder = paletteBuilder();
  let visited = 0;
  for (const region of regions) {
    const volume = structureVolume(region.size); visited += volume;
    if (visited > 2_000_000) throw new Error('投影区域总量超过 200 万格，请缩小选区。');
    const remap = region.palette.map(state => builder.id(state)), mask = (1n << BigInt(region.bits)) - 1n;
    for (let index = 0; index < volume; index++) {
      const bit = index * region.bits, word = Math.floor(bit / 64), shift = bit % 64;
      let packed = BigInt.asUintN(64, region.states[word]) >> BigInt(shift);
      if (shift + region.bits > 64) packed |= BigInt.asUintN(64, region.states[word + 1]) << BigInt(64 - shift);
      const sourceId = Number(packed & mask), state = remap[sourceId];
      if (state === undefined) throw new Error('投影引用了不存在的方块。');
      if (!state) continue;
      const x = index % region.size[0] + region.minimum[0] - minimum[0];
      const z = Math.floor(index / region.size[0]) % region.size[2] + region.minimum[2] - minimum[2];
      const y = Math.floor(index / (region.size[0] * region.size[2])) + region.minimum[1] - minimum[1];
      cells[x + z * size[0] + y * size[0] * size[2]] = state;
    }
  }
  return finish(name, 'litematic', size, cells, builder.palette, regions.length);
}

export async function readGroundFile(buffer: ArrayBuffer, filename: string): Promise<GroundStructure> {
  if (!/\.(schem|schematic|litematic)$/i.test(filename)) throw new Error('请选择 .schem、.schematic 或 .litematic 场地文件。');
  if (buffer.byteLength > 64 * 1024 * 1024) throw new Error('场地文件超过 64 MB，请缩小蓝图选区。');
  let data: Compound;
  try { data = compound((await read(buffer, { endian: 'big', rootName: true, bedrockLevel: false })).data, '场地内容'); }
  catch { throw new Error('文件不是有效的 Minecraft 蓝图或 Litematica 投影，或文件已损坏。'); }
  if (data.Schematic) data = compound(data.Schematic, '蓝图内容');
  if (data.Regions) return readLitematic(data, filename);
  if (data.Palette || data.Version && data.Blocks && !ArrayBuffer.isView(data.Blocks)) return readSponge(data, filename);
  if (data.Blocks && data.Data) return readLegacy(data, filename);
  throw new Error('未识别到支持的蓝图方块结构。');
}
