import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGround, editGround } from '../src/scene/factory3d/ground';
import { readGroundFile } from '../src/scene/factory3d/ground-file';
import { spongeFixture } from './fixtures/ground-files';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function storage(scope = '') {
  const data = new Map<string, string>();
  vi.stubGlobal('document', { documentElement: { dataset: { storageScope: scope } }, createElement: () => ({}) });
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value) });
  return data;
}

describe('场地本地保存与备份', () => {
  it('预览修改只写入预览作用域，不读取或覆盖正式场地', async () => {
    vi.resetModules();
    const data = storage('gtnh-dev-preview');
    data.set('gtnh-incremental-grounds', 'formal-untouched');
    const { useGroundLibrary } = await import('../src/composables/useGroundLibrary');
    const grounds = useGroundLibrary();
    grounds.setSite('m-2:4', createGround('preset-1'));
    expect(data.get('gtnh-incremental-grounds')).toBe('formal-untouched');
    expect(JSON.parse(data.get('gtnh-dev-preview:gtnh-incremental-grounds')!).sites['m-2:4'].preset).toBe('preset-1');
  });

  it('保存预设后编辑场地不会改动预设副本，删除预设也不会删除正在使用的设计', async () => {
    vi.resetModules(); storage();
    const { useGroundLibrary } = await import('../src/composables/useGroundLibrary');
    const grounds = useGroundLibrary();
    const design = editGround(createGround(), { x: 4, y: -1, z: 4, material: 'pink-concrete' });
    grounds.setSite('m-2:0', design);
    const id = grounds.savePreset('粉红小院', design);
    grounds.setSite('m-2:0', editGround(design, { x: 4, y: -1, z: 4, material: 'gray-concrete' }));
    expect(grounds.library.value.presets[0].design.cells['4,-1,4']).toBe('pink-concrete');
    grounds.removePreset(id);
    expect(grounds.library.value.presets).toEqual([]);
    expect(grounds.library.value.sites['m-2:0'].cells['4,-1,4']).toBe('gray-concrete');
  });

  it('无效导入不改变当前场地，有效备份合并场地及预设', async () => {
    vi.resetModules(); storage();
    const { useGroundLibrary } = await import('../src/composables/useGroundLibrary');
    const grounds = useGroundLibrary();
    grounds.setSite('m-2:0', createGround());
    const before = JSON.stringify(grounds.library.value);
    expect(() => grounds.importLibrary('not-json')).toThrow();
    expect(() => grounds.importLibrary('{"version":28,"counts":{}}')).toThrow();
    expect(JSON.stringify(grounds.library.value)).toBe(before);
    grounds.importLibrary(JSON.stringify({ version: 1, sites: { 'm-2:999': createGround('preset-1') }, presets: [] }));
    expect(Object.keys(grounds.library.value.sites)).toEqual(['m-2:0', 'm-2:999']);
  });

  it('本地存储写入失败时保留当前设计并明确显示未保存状态', async () => {
    vi.resetModules(); storage();
    const { useGroundLibrary } = await import('../src/composables/useGroundLibrary');
    const grounds = useGroundLibrary();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    grounds.setSite('m-2:0', createGround('preset-1'));
    expect(grounds.library.value.sites['m-2:0'].preset).toBe('preset-1');
    expect(grounds.storageError.value).toContain('尚未写入');
  });

  it('同一导入场地供多个机型复用，清理后只保留仍被使用的数据', async () => {
    vi.resetModules(); storage();
    const { useGroundLibrary } = await import('../src/composables/useGroundLibrary');
    const grounds = useGroundLibrary();
    const structure = await readGroundFile((await spongeFixture()).slice().buffer as ArrayBuffer, '共享场地.schem');
    grounds.addImportedPreset(structure, 'm-2:0');
    const preset = grounds.library.value.presets[0];
    grounds.setSite('c-2:0', preset.design);
    expect(Object.keys(grounds.library.value.structures)).toHaveLength(1);
    grounds.removePreset(preset.id); expect(Object.keys(grounds.library.value.structures)).toHaveLength(1);
    grounds.setSite('m-2:0', createGround()); grounds.setSite('c-2:0', createGround());
    expect(grounds.library.value.structures).toEqual({});
  });

  it('含导入蓝图的备份完整往返；缺失蓝图的备份不会覆盖原场地', async () => {
    vi.resetModules(); storage();
    const { useGroundLibrary } = await import('../src/composables/useGroundLibrary');
    const grounds = useGroundLibrary();
    grounds.addImportedPreset(await readGroundFile((await spongeFixture()).slice().buffer as ArrayBuffer, '备份场地.schem'), 'm-2:0');
    const before = JSON.stringify(grounds.library.value);
    grounds.importLibrary(before); expect(grounds.library.value).toEqual(JSON.parse(before));
    const broken = JSON.parse(before); broken.structures = {};
    broken.sites['m-2:0'].structureId = 'terrain-missing';
    expect(() => grounds.importLibrary(JSON.stringify(broken))).toThrow('缺少');
    expect(grounds.library.value).toEqual(JSON.parse(before));
  });
});
