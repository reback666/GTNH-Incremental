import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { VEIN_TIERS, fxIconLoopMs, veinLoopMs, veinTierInfo } from '../src/game/veins';
import { VEIN_FX_META } from '../src/game/vein-meta';
import { VEIN_MATERIALS } from '../src/game/vein-materials';
import { GameCore } from '../src/game/core';
import { getCore, setCore } from '../src/game/engine';
import { useGameStore } from '../src/game/store';
import { MAX_TIER } from '../src/numeric/voltage';

// 贴图条带、帧长、材料表是分开维护的，最容易出的错是对不上号（帧数与帧长列表不等长、等级缺项）。
describe('矿脉贴图与特殊渲染', () => {
  it('全部电压都有贴图信息和材料名', () => {
    expect(VEIN_TIERS).toHaveLength(MAX_TIER);
    VEIN_TIERS.forEach((info, tier) => {
      expect(info.tier, `第 ${tier} 级`).toBe(tier);
      expect(info.material.length, `第 ${tier} 级材料名`).toBeGreaterThan(0);
    });
  });

  it('每级的帧数与帧长列表一致，静态等级只有一帧', () => {
    for (const info of VEIN_TIERS) {
      expect(info.frames, `T${info.tier} 帧数`).toBeGreaterThanOrEqual(1);
      expect(info.frameDurationsMs, `T${info.tier} 帧长数量`).toHaveLength(info.frames);
    }
    const animated = VEIN_TIERS.filter((info) => info.frames > 1).map((info) => info.tier);
    // T13 海珀珍用的是 Modernity-GTNH 材质包里 UXV 线圈的能量流动动画（119 帧 × 50ms）
    expect(animated).toEqual([9, 10, 11, 13, 14]);
  });

  it('动画时长与原版贴图的 frametime 一致', () => {
    expect(veinLoopMs(veinTierInfo(10)!)).toBe(31 * 150);
    expect(veinLoopMs(veinTierInfo(11)!)).toBe(18 * 200);
    expect(veinLoopMs(veinTierInfo(13)!)).toBe(119 * 50);
    expect(veinLoopMs(veinTierInfo(14)!)).toBe(113 * 150);
    expect(VEIN_FX_META.haloFuzzy?.frames).toBe(8);
    expect(VEIN_FX_META.haloFuzzy?.frameDurationsMs).toHaveLength(8);
    // 挖矿裂纹用原版 10 级破坏贴图
    expect(VEIN_FX_META.destroy?.frames).toBe(10);
    expect(fxIconLoopMs('destroy')).toBe(300);
  });

  it('只有原版带特殊渲染的材料挂了特效', () => {
    expect(VEIN_TIERS.filter((info) => info.fx !== 'none').map((info) => [info.tier, info.fx])).toEqual([
      [9, 'fuzzy'],
      [10, 'halo'],
    ]);
  });

  it('材料表盖满全部电压，而且是唯一一份来源', () => {
    expect(VEIN_MATERIALS).toHaveLength(MAX_TIER);
    expect(VEIN_TIERS.map((info) => info.material)).toEqual(
      VEIN_MATERIALS.map((item) => item.material),
    );
  });

  it('资源条上的矿石名带上同一个材料名', () => {
    setActivePinia(createPinia());
    setCore(new GameCore());
    const store = useGameStore();
    const core = getCore();
    core.maxTier = 3;

    store.refresh();
    // 矿石名直接用材料名：资源条与矿脉面板写的是同一个词；
    // 资源条从高等级排到低等级，最高级的排在最前
    expect(store.snap.ores[0]!.name).toBe('铝');
    expect(store.snap.ores[0]!.tier).toBe(2);
    expect(store.snap.ores[1]!.name).toBe('铜');
    expect(store.snap.ores[2]!.name).toBe('锻铁');
  });
});
