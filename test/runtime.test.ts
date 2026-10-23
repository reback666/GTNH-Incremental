import { describe, expect, it } from 'vitest';
import { advanceSimulation, ElapsedClock } from '../src/game/runtime';

// 守住后台计时、取消旧补算和在线/离线步长一致，避免重构后进度少算或旧档继续运行。
describe('simulation runtime', () => {
  it('uses wall time and retains sub-second remainder', () => {
    let now = 0;
    const clock = new ElapsedClock(() => now);
    now = 750;
    expect(clock.take()).toBe(0);
    now = 1250;
    expect(clock.take()).toBe(1);
    now = 61250;
    expect(clock.take()).toBe(60);
    now = 62000;
    expect(clock.take()).toBe(1);
  });

  it('does not charge deliberately paused time or the old timeline after reset', () => {
    let now = 0;
    const clock = new ElapsedClock(() => now);
    now = 60000;
    expect(clock.take(true)).toBe(0);
    now += 1000;
    expect(clock.take()).toBe(1);
    now += 60000;
    clock.reset();
    expect(clock.take()).toBe(0);
    now -= 1000;
    expect(clock.take()).toBe(0);
  });

  it('advances in one-second steps with an exact final remainder', async () => {
    const steps: number[] = [];
    const result = await advanceSimulation({ seconds: 60.25, tick: step => steps.push(step) });
    expect(steps).toEqual([...Array(60).fill(1), 0.25]);
    expect(result).toEqual({ advanced: 60.25, total: 60.25, cancelled: false });
  });

  it('can abort between slices before the old core is touched again', async () => {
    const controller = new AbortController();
    let count = 0;
    const result = await advanceSimulation({
      seconds: 1000,
      tick: () => count++,
      signal: controller.signal,
      now: () => 0,
      yieldControl: async () => { controller.abort(); },
    });
    expect(count).toBe(240);
    expect(result.cancelled).toBe(true);
    expect(result.advanced).toBe(240);
  });

  it('rejects non-finite durations and caps long gaps', async () => {
    for (const seconds of [NaN, Infinity, -2]) {
      const result = await advanceSimulation({ seconds, tick: () => { throw new Error('must not tick'); } });
      expect(result.advanced).toBe(0);
    }
    const steps: number[] = [];
    await advanceSimulation({ seconds: 100, maxSeconds: 3, tick: step => steps.push(step) });
    expect(steps).toEqual([1, 1, 1]);
  });
});
