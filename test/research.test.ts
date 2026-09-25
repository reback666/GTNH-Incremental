import { describe, expect, it } from 'vitest';
import {
  RESEARCH_FROM_TIER,
  RESEARCH_GATE_FROM_TIER,
  computerComputePerSecond,
  computerEnergyEU,
  labComputeThroughput,
  needsResearch,
  researchGain,
  researchRemaining,
  researchRequired,
  settleCompute,
} from '../src/numeric/research';

// 计划书第七章资源四：算力是流量，计算机产出、研究站消耗，用来解锁 ZPM 及以后的机型。
describe('算力与研究进度', () => {
  it('计算机与研究站从 LuV（tier 7）起开放', () => {
    expect(RESEARCH_FROM_TIER).toBe(7);
    expect(RESEARCH_GATE_FROM_TIER).toBe(8);
  });

  it('一台计算机的算力产量：LuV 1/秒，每级 ×4', () => {
    expect(computerComputePerSecond(7).toString()).toBe('1');
    expect(computerComputePerSecond(8).toString()).toBe('4');
    expect(computerComputePerSecond(9).toString()).toBe('16');
    expect(computerComputePerSecond(14).toString()).toBe('16384'); // 4^7
    expect(computerComputePerSecond(6).toString()).toBe('0');
  });

  it('计算机耗电按本级 1A：LuV 32768 EU/t', () => {
    expect(computerEnergyEU(7).toString()).toBe('32768'); // 8 × 4^6
    expect(computerEnergyEU(8).toString()).toBe('131072');
  });

  it('一台同级研究站刚好吃掉一台同级计算机的算力', () => {
    for (const tier of [7, 8, 9, 14]) {
      expect(labComputeThroughput(tier).eq(computerComputePerSecond(tier))).toBe(true);
    }
  });

  it('只有 ZPM 及以后的机型需要研究，需求每级 ×4', () => {
    expect(needsResearch(7)).toBe(false);
    expect(needsResearch(8)).toBe(true);
    expect(researchRequired(7).toString()).toBe('0');
    expect(researchRequired(8).toString()).toBe('1000');
    expect(researchRequired(9).toString()).toBe('4000');
    expect(researchRequired(14).toString()).toBe('4096000'); // 1000 × 4^6
  });

  it('算力不累积：产出来当拍不用掉就浪费', () => {
    const surplus = settleCompute('10', '4');
    expect(surplus.used.toString()).toBe('4');
    expect(surplus.wasted.toString()).toBe('6');
    expect(surplus.shortfall.toString()).toBe('0');

    const shortage = settleCompute('3', '10');
    expect(shortage.used.toString()).toBe('3');
    expect(shortage.wasted.toString()).toBe('0');
    expect(shortage.shortfall.toString()).toBe('7');
  });

  it('1 算力/秒 = 1 进度/秒', () => {
    expect(researchGain('2.5', 4).toString()).toBe('10');
    expect(researchRemaining('250', '1000').toString()).toBe('750');
    expect(researchRemaining('1200', '1000').toString()).toBe('0');
  });
});
