import { describe, expect, it } from 'vitest';
import { dec, ZERO } from '../src/numeric/decimal';
import { batteryCapacityEU, settleStorage } from '../src/numeric/storage';

// 计划书第七章：存电装置把富余电力存成存量，缺口先吃存量，吃完才降载。
describe('存电装置', () => {
  it('容量跟着电压走：每级 ×4', () => {
    expect(batteryCapacityEU(1).toString()).toBe('1000');
    expect(batteryCapacityEU(2).toString()).toBe('4000');
    expect(batteryCapacityEU(4).toString()).toBe('64000');
    expect(batteryCapacityEU(14).toString()).toBe('67108864000');
  });

  it('富余电力充进电池，充满就不再收', () => {
    const half = settleStorage({ stored: ZERO, capacity: dec('1000'), net: dec('8'), dtSeconds: 1 });
    expect(half.charged.toString()).toBe('8');
    expect(half.stored.toString()).toBe('8');

    const full = settleStorage({
      stored: dec('995'),
      capacity: dec('1000'),
      net: dec('8'),
      dtSeconds: 1,
    });
    expect(full.charged.toString()).toBe('5');
    expect(full.stored.toString()).toBe('1000');
  });

  it('电力不够时先放存量', () => {
    const out = settleStorage({
      stored: dec('100'),
      capacity: dec('1000'),
      net: dec('-4'),
      dtSeconds: 2,
    });
    expect(out.discharged.toString()).toBe('8');
    expect(out.stored.toString()).toBe('92');
    expect(out.shortfall.toString()).toBe('0');
  });

  it('存量见底才出现缺口', () => {
    const out = settleStorage({
      stored: dec('3'),
      capacity: dec('1000'),
      net: dec('-5'),
      dtSeconds: 2,
    });
    expect(out.discharged.toString()).toBe('3');
    expect(out.stored.toString()).toBe('0');
    expect(out.shortfall.toString()).toBe('7');
  });
});
