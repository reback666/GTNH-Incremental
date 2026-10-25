import { describe, expect, it } from 'vitest';
import { write, Int16, Int32 } from 'nbtify';
import { readGroundFile } from '../src/scene/factory3d/ground-file';
import { decodeGroundCells, cleanGroundStructure } from '../src/scene/factory3d/ground-structure';
import { terrainBlock, unresolvedTerrainStates } from '../src/scene/factory3d/terrain-catalog';
import { GROUND_MATERIALS } from '../src/scene/factory3d/ground';
import { legacyFixture, litematicFixture, regionFixture, spongeFixture } from './fixtures/ground-files';

const buffer = (data: Uint8Array) => data.slice().buffer as ArrayBuffer;

describe('本地 Minecraft 场地文件', () => {
  it.each([1, 2, 3])('读取压缩 Sponge v%s，保持 X/Z/Y 顺序及真实材质', async version => {
    const ground = await readGroundFile(buffer(await spongeFixture(version)), '粉白场地.schem');
    expect(ground.size).toEqual([2, 1, 2]); expect(ground.blockCount).toBe(4);
    const cells = decodeGroundCells(ground);
    expect([...cells].map(index => ground.palette[index])).toEqual(['minecraft:white_concrete', 'minecraft:pink_concrete', 'minecraft:white_concrete', 'minecraft:white_concrete']);
    expect(unresolvedTerrainStates(ground)).toEqual([]);
    expect(cleanGroundStructure(JSON.parse(JSON.stringify(ground)))).toEqual(ground);
  });
  it('多字节 VarInt 方块编号不被当成两格', async () => {
    const palette = ['minecraft:air', ...Array.from({ length: 129 }, (_, index) => `test:block_${index}`)];
    const ground = await readGroundFile(buffer(await spongeFixture(2, palette, [128, 129], [2, 1, 1])), '多材质.schem');
    expect(ground.blockCount).toBe(2);
    expect([...decodeGroundCells(ground)].map(id => ground.palette[id])).toEqual([palette[128], palette[129]]);
  });
  it('读取 MCEdit 数字 ID 与颜色元数据，并保留 12 位扩展编号', async () => {
    const ground = await readGroundFile(buffer(await legacyFixture()), '旧场地.schematic');
    expect(ground.palette).toContain('minecraft:white_concrete'); expect(ground.palette).toContain('minecraft:pink_concrete');
    const extended = await readGroundFile(buffer(await legacyFixture([1, 2, 3, 4], [0, 0, 0, 0], [0x21, 0x00])), '扩展.schematic');
    expect(extended.palette).toContain('legacy:block_257[legacy_data=0]'); expect(extended.palette).toContain('legacy:block_514[legacy_data=0]');
    const registered = await write({ Width: new Int16(1), Height: new Int16(1), Length: new Int16(1),
      Blocks: new Uint8Array([251]), Data: new Uint8Array([6]), SchematicaMapping: { 'minecraft:concrete': new Int16(251) } });
    expect((await readGroundFile(buffer(registered), '注册材质.schematic')).palette).toContain('minecraft:pink_concrete');
  });
  it('读取 Litematica 跨 64 位边界的紧凑状态数组', async () => {
    const palette = ['minecraft:air', 'minecraft:white_concrete', 'minecraft:pink_concrete', 'minecraft:bricks', 'minecraft:stone', 'minecraft:glass'];
    const indices = Array.from({ length: 31 }, (_, index) => index % 6);
    const ground = await readGroundFile(buffer(await litematicFixture({ 跨位: regionFixture([31, 1, 1], [0, 0, 0], palette, indices) })), '投影.litematic');
    expect([...decodeGroundCells(ground)].map(id => ground.palette[id])).toEqual(indices.map(index => palette[index]));
  });
  it('合并多区域与负尺寸区域，保留间隔和相对位置', async () => {
    const ground = await readGroundFile(buffer(await litematicFixture({
      左: regionFixture([-2, 1, 1], [-1, 0, 0], ['minecraft:air', 'minecraft:white_concrete']),
      右: regionFixture([1, 1, 1], [2, 0, 0], ['minecraft:air', 'minecraft:pink_concrete']),
    })), '多区域.litematic');
    expect(ground.size).toEqual([5, 1, 1]); expect(ground.regions).toBe(2);
    expect([...decodeGroundCells(ground)].map(id => ground.palette[id])).toEqual(['minecraft:white_concrete', 'minecraft:white_concrete', 'minecraft:air', 'minecraft:air', 'minecraft:pink_concrete']);
  });
  it('损坏或不支持的文件不会生成替代场地，JSON 不作为外部场地格式', async () => {
    await expect(readGroundFile(new TextEncoder().encode('{}').buffer, '场地.json')).rejects.toThrow('.schem');
    await expect(readGroundFile(new ArrayBuffer(5), '损坏.schem')).rejects.toThrow('损坏');
    const bad = await write({ Width: new Int16(2), Height: new Int16(1), Length: new Int16(1), Version: new Int32(2),
      Palette: { 'minecraft:white_concrete': new Int32(0) }, BlockData: new Uint8Array([0]) });
    await expect(readGroundFile(buffer(bad), '缺格.schem')).rejects.toThrow('不完整');
  });
  it('未知方块必须明确替换或跳过；半砖与直楼梯保留实际形状', async () => {
    const ground = await readGroundFile(buffer(await spongeFixture(3, ['minecraft:air', 'mod:custom'], [1], [1, 1, 1])), '模组.schem');
    expect(unresolvedTerrainStates(ground)).toEqual(['mod:custom']);
    ground.overrides['mod:custom'] = 'pink-concrete'; expect(unresolvedTerrainStates(ground)).toEqual([]);
    expect(terrainBlock('minecraft:stone_slab[type=top]')).toMatchObject({ boxes: [[0, 0.5, 0, 1, 1, 1]] });
    expect(terrainBlock('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]')).toMatchObject({ boxes: [[0, 0, 0, 1, 0.5, 1], [0.5, 0.5, 0, 1, 1, 1]] });
    expect(terrainBlock('minecraft:chain')).toBeNull();
    for (const material of GROUND_MATERIALS) expect(terrainBlock('test:custom', { 'test:custom': material.id })).not.toBeNull();
  });
});
