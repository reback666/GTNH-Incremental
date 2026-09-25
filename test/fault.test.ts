import { describe, expect, it } from 'vitest';
import {
  FAULT_BASE_PER_MINUTE,
  expectedFaults,
  faultHint,
  faultRatePerMinute,
  faultRatePerSecond,
  sampleFaults,
} from '../src/numeric/fault';
import { dec } from '../src/numeric/decimal';

// 计划书第六章：档位越高故障率增长越快（每档翻倍），故障表现是停机 + 手动维护。
describe('超频故障率', () => {
  it('不超频不会故障', () => {
    expect(faultRatePerMinute(0).toString()).toBe('0');
    expect(faultRatePerSecond(0).toString()).toBe('0');
    expect(faultHint(0, 100)).toBe('不超频不会故障');
  });

  it('1 档每分钟 1%，之后每档翻倍', () => {
    expect(faultRatePerMinute(1).toString()).toBe(FAULT_BASE_PER_MINUTE);
    expect(faultRatePerMinute(2).toString()).toBe('0.02');
    expect(faultRatePerMinute(3).toString()).toBe('0.04');
    expect(faultRatePerSecond(3).eq(dec('0.04').div(60))).toBe(true);
  });

  it('期望台数 = 单台速率 × 台数 × 时间', () => {
    // 3 档、100 台、60 秒：0.04 × 100 = 4 台
    expect(expectedFaults(3, 100, 60)).toBeCloseTo(4, 10);
    expect(expectedFaults(0, 100, 60)).toBe(0);
  });

  it('抽样在期望值附近，且不会返回负数', () => {
    const rng = () => 0.5;
    expect(sampleFaults(0, rng)).toBe(0);
    expect(sampleFaults(1, rng)).toBe(1);
    expect(sampleFaults(30, rng)).toBeGreaterThan(0);
    expect(sampleFaults(0.0001, rng)).toBe(0);
  });

  it('提示按「平均多久坏一台」给', () => {
    // 1 档、50 台：每分钟 0.5 台 → 平均 2 分钟坏一台
    expect(faultHint(1, 50)).toBe('平均每 2.0 分钟坏 1 台');
  });
});
