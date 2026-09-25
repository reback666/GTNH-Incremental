import { describe, expect, it } from 'vitest';
import { VEIN_TIERS, veinLoopMs, veinTierInfo } from '../src/game/veins';
import { VEIN_FX_META } from '../src/game/vein-meta';

// 贴图条带、帧长、材料表是分开维护的，最容易出的错是对不上号（帧数与帧长列表不等长、等级缺项）。
describe('矿脉贴图与特殊渲染', () => {
  it('14 个等级都有贴图信息和材料名', () => {
    expect(VEIN_TIERS).toHaveLength(14);
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
    expect(animated).toEqual([9, 10, 11, 13]);
  });

  it('动画时长与原版贴图的 frametime 一致', () => {
    expect(veinLoopMs(veinTierInfo(10)!)).toBe(31 * 150);
    expect(veinLoopMs(veinTierInfo(11)!)).toBe(18 * 200);
    expect(veinLoopMs(veinTierInfo(13)!)).toBe(113 * 150);
    expect(VEIN_FX_META.haloFuzzy?.frames).toBe(8);
    expect(VEIN_FX_META.haloFuzzy?.frameDurationsMs).toHaveLength(8);
  });

  it('只有原版带特殊渲染的材料挂了特效', () => {
    expect(VEIN_TIERS.filter((info) => info.fx !== 'none').map((info) => [info.tier, info.fx])).toEqual([
      [9, 'fuzzy'],
      [10, 'halo'],
    ]);
  });
});
