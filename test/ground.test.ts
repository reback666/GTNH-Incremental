import { describe, expect, it } from 'vitest';
import { cleanGround, cleanGroundLibrary, createGround, editGround, groundCell, groundSiteKey } from '../src/scene/factory3d/ground';

describe('独立设备场地', () => {
  it('16×16 区块严格包含一圈 60 格粉红混凝土和中央 196 格白色混凝土', () => {
    const counts = { 'pink-concrete': 0, 'white-concrete': 0 };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) counts[groundCell(x, z)]++;
    expect(counts).toEqual({ 'pink-concrete': 60, 'white-concrete': 196 });
    for (let x = 1; x <= 14; x++) for (let z = 1; z <= 14; z++) expect(groundCell(x, z)).toBe('white-concrete');
  });

  it('正负坐标和远处坐标延伸时保留每个区块各自的完整边框', () => {
    for (const offset of [-160000, -32, -16, 0, 16, 160000]) {
      expect(groundCell(offset, 7)).toBe('pink-concrete');
      expect(groundCell(offset + 15, 7)).toBe('pink-concrete');
      expect(groundCell(offset + 1, -15)).toBe('white-concrete');
      expect(groundCell(offset + 14, -2)).toBe('white-concrete');
    }
    expect(groundCell(-0.1, 2)).toBe('pink-concrete');
  });

  it('逐格修改和还原不修改原设计，原厂区地板保留为预设一', () => {
    const original = createGround('preset-1');
    const painted = editGround(original, { x: -2, y: -1, z: 3, material: 'pink-concrete' });
    const stacked = editGround(painted, { x: -2, y: 7, z: 3, material: 'bricks' });
    expect(original.cells).toEqual({});
    expect(stacked.cells).toEqual({ '-2,-1,3': 'pink-concrete', '-2,7,3': 'bricks' });
    expect(editGround(stacked, { x: -2, y: -1, z: 3, material: null }).cells).toEqual({ '-2,7,3': 'bricks' });
    expect(stacked.preset).toBe('preset-1');
  });

  it('拒绝不能定位到实际格子的坐标与未知材质', () => {
    for (const x of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => editGround(createGround(), { x, y: 0, z: 0, material: 'bricks' })).toThrow();
    }
    for (const y of [-2, 256, 1.5]) expect(() => editGround(createGround(), { x: 0, y, z: 0, material: 'bricks' })).toThrow();
  });

  it('场地按机型隔离，预设与场地能完整往返且不共用可变对象', () => {
    const design = editGround(createGround(), { x: 3, y: -1, z: 4, material: 'gray-concrete' });
    const input = { version: 1, sites: { [groundSiteKey('m-2')]: design, [groundSiteKey('c-2')]: createGround('preset-1') },
      presets: [{ id: 'custom-test', name: '我的场地', design }], structures: {} };
    const loaded = cleanGroundLibrary(JSON.parse(JSON.stringify(input)));
    expect(loaded).toEqual(input);
    loaded.sites['m-2:0'].cells['3,-1,4'] = 'moss';
    expect(loaded.presets[0].design.cells['3,-1,4']).toBe('gray-concrete');
    expect(loaded.sites['c-2:0'].preset).toBe('preset-1');
  });

  it('损坏的配置不传播无效坐标、对象键和未知预设', () => {
    const loaded = cleanGroundLibrary({ version: 1, sites: { 'm-2:0': {
      preset: 'broken', machine: { x: Infinity, z: 0 }, cells: { '0,-1,0': 'white-concrete', 'NaN,0,0': 'bricks', '1,0,1': 'unknown', '1,256,1': 'bricks' },
    }, constructor: createGround() }, presets: [{ id: 'grid', name: 'bad' }, null] });
    expect(Object.keys(loaded.sites)).toEqual(['m-2:0']);
    expect(loaded.sites['m-2:0']).toEqual({ ...createGround(), cells: { '0,-1,0': 'white-concrete' } });
    expect(loaded.presets).toEqual([]);
    expect(cleanGround(null)).toEqual(createGround());
  });

});
