import { shallowRef, ref } from 'vue';
import { storageKey } from '../game/storage-key';
import { cleanGroundLibrary, type GroundDesign, type GroundLibrary } from '../scene/factory3d/ground';
import { cleanGroundStructure, type GroundStructure } from '../scene/factory3d/ground-structure';

const KEY = storageKey('gtnh-incremental-grounds');
const library = shallowRef<GroundLibrary>({ version: 1, sites: {}, presets: [], structures: {} });
const storageError = ref('');
let loaded = false;

export function useGroundLibrary() {
  if (!loaded) {
    loaded = true;
    try { library.value = cleanGroundLibrary(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
    catch { storageError.value = '场地配置未能读取；当前修改仍可导出备份。'; }
  }
  function persist(next: GroundLibrary): void {
    const used = new Set([...Object.values(next.sites), ...next.presets.map(preset => preset.design)].map(design => design.structureId));
    next = { ...next, structures: Object.fromEntries(Object.entries(next.structures).filter(([id]) => used.has(id))) };
    library.value = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); storageError.value = ''; }
    catch { storageError.value = '场地尚未写入本地存储，请导出备份后再关闭页面。'; }
  }
  function setSite(key: string, design: GroundDesign): void {
    persist({ ...library.value, sites: { ...library.value.sites, [key]: design } });
  }
  function savePreset(name: string, design: GroundDesign): string {
    const id = `custom-${crypto.randomUUID()}`;
    persist({ ...library.value, presets: [...library.value.presets, { id, name: name.trim().slice(0, 40), design }] });
    return id;
  }
  function removePreset(id: string): void {
    persist({ ...library.value, presets: library.value.presets.filter(preset => preset.id !== id) });
  }
  function importLibrary(text: string): void {
    const input: unknown = JSON.parse(text);
    if (!input || typeof input !== 'object' || (input as { version?: unknown }).version !== 1
      || !Array.isArray((input as GroundLibrary).presets) || !(input as GroundLibrary).sites) {
      throw new Error('请选择本游戏导出的场地备份 JSON 文件。');
    }
    const incoming = cleanGroundLibrary(input);
    const structures = { ...library.value.structures, ...incoming.structures };
    for (const design of [...Object.values(incoming.sites), ...incoming.presets.map(preset => preset.design)]) {
      if (design.preset === 'imported' && (!design.structureId || !structures[design.structureId])) throw new Error('备份缺少引用的场地蓝图，请重新导出完整备份。');
    }
    const presets = new Map(library.value.presets.map(preset => [preset.id, preset]));
    for (const preset of incoming.presets) presets.set(preset.id, preset);
    persist({ version: 1, sites: { ...library.value.sites, ...incoming.sites }, presets: [...presets.values()],
      structures });
  }
  function addImportedPreset(structure: GroundStructure, site?: string): void {
    const id = `terrain-${crypto.randomUUID()}`, design: GroundDesign = {
      preset: 'imported', structureId: id, machine: { x: 8, z: 8 }, cells: {},
    };
    const preset = { id: `custom-${crypto.randomUUID()}`, name: structure.name.slice(0, 40), design };
    persist({ ...library.value, structures: { ...library.value.structures, [id]: cleanGroundStructure(structure) },
      presets: [...library.value.presets, preset], sites: site ? { ...library.value.sites, [site]: design } : library.value.sites });
  }
  return { library, storageError, setSite, savePreset, removePreset, importLibrary, addImportedPreset };
}
