import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompactLayout } from '../src/scene/factory3d/compact-layout';

function storage(): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  return data;
}
async function previewModules(scope = 'gtnh-dev-preview') {
  vi.resetModules();
  vi.stubGlobal('document', { documentElement: { dataset: { storageScope: scope } } });
  const constants = await import('../src/game/constants');
  const save = await import('../src/game/save');
  const { GameCore } = await import('../src/game/core');
  const log = await import('../src/game/log');
  return { constants, save, GameCore, log };
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('dev preview uses the existing system with isolated local persistence', () => {
  it('retains formal storage keys when the entry has no scope', async () => {
    const { constants, log } = await previewModules('');
    expect(constants.SAVE_KEY).toBe('gtnh-incremental-save');
    expect(constants.SAVE_TIME_KEY).toBe('gtnh-incremental-save-time');
    expect(constants.THEME_KEY).toBe('gtnh-incremental-theme');
    expect(constants.UI_KEY).toBe('gtnh-incremental-ui');
    expect(log.LOG_STORAGE_KEY).toBe('gtnh-incremental-log');
  });
  it('isolates saves, save time, theme, UI and logs for the preview entry', async () => {
    const { constants, log } = await previewModules();
    for (const key of [constants.SAVE_KEY, constants.SAVE_TIME_KEY, constants.THEME_KEY, constants.UI_KEY, log.LOG_STORAGE_KEY]) expect(key.startsWith('gtnh-dev-preview:')).toBe(true);
  });
  it('saves and restores real ore stocks without reading or overwriting formal and discarded demo saves', async () => {
    const data = storage();
    for (const key of ['gtnh-incremental-save', 'gtnh-incremental-log', 'gtnh-material-demo-v1', 'gtnh-single-coin-demo-v1']) data.set(key, 'untouched');
    const { constants, save, GameCore, log } = await previewModules();
    const core = new GameCore();
    for (let index = 0; index < 16; index++) core.manualMine();
    expect(core.ores[0].toString()).toBe('16');
    expect(core.coins[0].toString()).toBe('0');
    save.saveToStorage(core);
    log.logEvent('info', 'app.preview', '工业预览'); log.flushLog();
    const restored = save.loadFromStorage()!;
    expect(restored.ores[0].toString()).toBe('16');
    expect(restored.coins[0].toString()).toBe('0');
    expect(data.has(constants.SAVE_KEY)).toBe(true);
    expect(data.has(log.LOG_STORAGE_KEY)).toBe(true);
    for (const key of ['gtnh-incremental-save', 'gtnh-incremental-log', 'gtnh-material-demo-v1', 'gtnh-single-coin-demo-v1']) expect(data.get(key)).toBe('untouched');
  });
  it('resets only preview progress and keeps formal progress and preview preferences', async () => {
    const data = storage();
    data.set('gtnh-incremental-save', 'formal');
    const { constants, save, GameCore } = await previewModules();
    save.saveToStorage(new GameCore()); save.writeSavedTheme('light');
    data.set(constants.UI_KEY, 'preferences');
    save.clearStorage();
    expect(data.has(constants.SAVE_KEY)).toBe(false);
    expect(data.has(constants.SAVE_TIME_KEY)).toBe(false);
    expect(data.get(constants.THEME_KEY)).toBe('light');
    expect(data.get(constants.UI_KEY)).toBe('preferences');
    expect(data.get('gtnh-incremental-save')).toBe('formal');
  });
  it('does not treat an existing formal save as preview progress', async () => {
    const data = storage(); data.set('gtnh-incremental-save', '{"version":26}');
    const { save } = await previewModules();
    expect(save.loadFromStorage()).toBe(null);
  });
});

describe('stable full-count factory layout', () => {
  it('places thousands of machines without duplicate slots or moving existing machines', () => {
    const layout = createCompactLayout();
    const first = layout.position('miner', 0); const second = layout.position('maker', 0);
    const occupied = new Set<string>();
    for (const id of ['miner', 'maker']) for (let index = 0; index < 1200; index++) {
      const point = layout.position(id, index); const key = `${point.x},${point.z}`;
      expect(occupied.has(key)).toBe(false); occupied.add(key);
    }
    expect(layout.position('miner', 0)).toEqual(first);
    expect(layout.position('maker', 0)).toEqual(second);
    expect(occupied.size).toBe(2400);
  });
});
