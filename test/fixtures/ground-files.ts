import { write, Int16, Int32 } from 'nbtify';

export async function spongeFixture(version = 3, palette = ['minecraft:air', 'minecraft:white_concrete', 'minecraft:pink_concrete'], indices = [1, 2, 1, 1], size = [2, 1, 2]): Promise<Uint8Array> {
  const data: number[] = [];
  for (let value of indices) {
    do { const byte = value & 127; value >>>= 7; data.push(byte | (value ? 128 : 0)); } while (value);
  }
  const blocks = { Palette: Object.fromEntries(palette.map((state, index) => [state, new Int32(index)])), Data: new Uint8Array(data) };
  const root = { Version: new Int32(version), Width: new Int16(size[0]), Height: new Int16(size[1]), Length: new Int16(size[2]),
    ...(version === 3 ? { Blocks: blocks } : { Palette: blocks.Palette, BlockData: blocks.Data }) };
  return write(version === 3 ? { Schematic: root } : root, { compression: 'gzip', rootName: 'Schematic', endian: 'big' });
}

export async function legacyFixture(ids = [251, 251, 45, 20], metadata = [0, 6, 0, 0], add?: number[]): Promise<Uint8Array> {
  return write({ Width: new Int16(2), Height: new Int16(1), Length: new Int16(2), Materials: 'Alpha',
    Blocks: new Uint8Array(ids), Data: new Uint8Array(metadata), ...(add ? { AddBlocks: new Uint8Array(add) } : {}) },
  { compression: 'gzip', rootName: 'Schematic', endian: 'big' });
}

export function packedStates(indices: number[], paletteSize: number): BigInt64Array {
  const bits = Math.max(2, Math.ceil(Math.log2(paletteSize))), words = new BigInt64Array(Math.ceil(indices.length * bits / 64));
  indices.forEach((value, index) => {
    const bit = index * bits, word = Math.floor(bit / 64), shift = bit % 64;
    words[word] = BigInt.asIntN(64, BigInt.asUintN(64, words[word]) | BigInt(value) << BigInt(shift));
    if (shift + bits > 64) words[word + 1] = BigInt.asIntN(64, BigInt.asUintN(64, words[word + 1]) | BigInt(value) >> BigInt(64 - shift));
  });
  return words;
}

export function regionFixture(size: number[], position = [0, 0, 0], palette = ['minecraft:air', 'minecraft:white_concrete'], indices?: number[]) {
  const volume = size.reduce((total, length) => total * Math.abs(length), 1);
  return { Position: { x: new Int32(position[0]), y: new Int32(position[1]), z: new Int32(position[2]) },
    Size: { x: new Int32(size[0]), y: new Int32(size[1]), z: new Int32(size[2]) },
    BlockStatePalette: palette.map(Name => ({ Name })), BlockStates: packedStates(indices ?? Array<number>(volume).fill(1), palette.length) };
}

export async function litematicFixture(regions: Record<string, ReturnType<typeof regionFixture>> = { '场地': regionFixture([2, 1, 2]) }): Promise<Uint8Array> {
  return write({ Version: new Int32(6), MinecraftDataVersion: new Int32(3465), Regions: regions },
    { compression: 'gzip', rootName: '', endian: 'big' });
}
