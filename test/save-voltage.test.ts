import { describe, expect, it } from 'vitest';
import { remapVoltageSave } from '../src/game/save-voltage';
import type { SaveData } from '../src/game/save';

const saved: SaveData = {
  version: 26, voltageIds: ['ULV', 'LV', 'MV', 'MAX'], maxTier: 4, peakTier: 4,
  ores: ['1', '2', '3', '4'], coins: ['10', '20', '30', '40'], unlockedVeins: [0, 1, 2, 3],
  counts: { 'c-lv': 2 }, researchedModels: ['c-lv'], researchTargetModel: 'c-mv',
  researchProgressByModel: { 'c-mv': '37' }, pickaxeVajra: 3,
  playSeconds: 0, totalOre: '0', totalCoins: '0', totalOreSpent: '0',
};

describe('按电压标识恢复存档', () => {
  it('电压重排时资源跟随原电压，机器与逐机型研究记录保持不变', () => {
    const original = JSON.stringify(saved);
    const restored = remapVoltageSave(saved, ['ULV', 'MV', 'LV', 'MAX']);
    expect(restored.ores).toEqual(['1', '3', '2', '4']);
    expect(restored.coins).toEqual(['10', '30', '20', '40']);
    expect(restored.counts).toEqual({ 'c-lv': 2 });
    expect(restored.researchTargetModel).toBe('c-mv');
    expect(restored.researchProgressByModel).toEqual({ 'c-mv': '37' });
    expect(JSON.stringify(saved)).toBe(original);
    expect(remapVoltageSave(restored, ['ULV', 'MV', 'LV', 'MAX'])).toBe(restored);
  });

  it('在当前进度之前插入电压时新资源从零开始，既有资源不串位', () => {
    const restored = remapVoltageSave(saved, ['ULV', 'LV', 'Q', 'MV', 'MAX']);
    expect(restored.maxTier).toBe(5);
    expect(restored.pickaxeVajra).toBe(4);
    expect(restored.ores).toEqual(['1', '2', '0', '3', '4']);
    expect(restored.unlockedVeins).toEqual([0, 1, 2, 3, 4]);
  });
});
