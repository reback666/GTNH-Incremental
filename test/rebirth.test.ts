import { describe, expect, it } from 'vitest';
import { Decimal, dec } from '../src/numeric/decimal';
import { floorLog2, rebirthCables, rebirthGuarantee, tierCableBonus } from '../src/numeric/rebirth';

describe('精确 floor(log2)', () => {
  it('小整数', () => {
    expect(floorLog2('1')).toBe(0);
    expect(floorLog2('2')).toBe(1);
    expect(floorLog2('3')).toBe(1);
    expect(floorLog2('4')).toBe(2);
    expect(floorLog2('1024')).toBe(10);
    expect(floorLog2('1025')).toBe(10);
    expect(floorLog2('0.5')).toBe(-1);
    expect(floorLog2('0.1')).toBe(-4);
  });

  it('恰好落在 2 的整数次幂上时不会少取一格（1..132 全覆盖）', () => {
    for (let k = 1; k <= 132; k += 1) {
      const exact = dec('2').pow(k);
      expect(floorLog2(exact)).toBe(k);
      // 幂下方一格、上方一格都要取对
      expect(floorLog2(exact.minus(1))).toBe(k - 1);
      expect(floorLog2(exact.plus(1))).toBe(k);
    }
  });

  it('幂下方一个极小量也要向下取整', () => {
    // 2^10 - 1e-10 = 1023.9999999999，已经是 2^10 之下
    expect(floorLog2('1023.9999999999')).toBe(9);
    expect(floorLog2('1024.0000000001')).toBe(10);
  });

  it('1e28 与 1e988 量级', () => {
    expect(floorLog2('1e28')).toBe(93);
    expect(floorLog2('1e988')).toBe(3282);
  });

  it('非正数直接报错', () => {
    expect(() => floorLog2('0')).toThrow(RangeError);
    expect(() => floorLog2('-1')).toThrow(RangeError);
  });
});

describe('转生公式', () => {
  it('电压加成 = 1 + 0.1 × 最高电压等级', () => {
    expect(tierCableBonus(1).toString()).toBe('1.1');
    expect(tierCableBonus(4).toString()).toBe('1.4');
    expect(tierCableBonus(13).toString()).toBe('2.3');
    expect(tierCableBonus(14).toString()).toBe('2.4');
  });

  it('保底项 = 2x + 1', () => {
    expect(rebirthGuarantee(0).toString()).toBe('1');
    expect(rebirthGuarantee(5).toString()).toBe('11');
  });

  it('首次转生在 1e12 处保底 1 条', () => {
    expect(rebirthCables({ totalEU: '1e12', maxTier: 1, rebirthCount: 0 }).toString()).toBe('1');
    expect(rebirthCables({ totalEU: '1.9e12', maxTier: 14, rebirthCount: 0 }).toString()).toBe('1');
  });

  it('累计 EU 刚好是 2 的整数次幂的倍率时取整正确', () => {
    // 1e12 × 2^40 → floor(log2) = 40，40 × 2.4 + 1 = 97
    const totalEU = dec('1e12').times(dec('2').pow(40));
    expect(floorLog2(totalEU.div('1e12'))).toBe(40);
    expect(rebirthCables({ totalEU, maxTier: 14, rebirthCount: 0 }).toString()).toBe('97');
  });

  it('转生次数 x 增加保底收益', () => {
    // floor(93 × 2.3 + (2×5+1)) = floor(213.9 + 11) = 224
    expect(rebirthCables({ totalEU: '1e40', maxTier: 13, rebirthCount: 5 }).toString()).toBe('224');
  });

  it('1e1000 量级：floor(3282 × 2.4 + 1) = 7877', () => {
    expect(rebirthCables({ totalEU: '1e1000', maxTier: 14, rebirthCount: 0 }).toString()).toBe(
      '7877',
    );
  });

  it('累计 EU 不足 1e12 时收益为 0，不出现负数线缆', () => {
    expect(rebirthCables({ totalEU: '1e11', maxTier: 14, rebirthCount: 0 }).toString()).toBe('0');
    expect(rebirthCables({ totalEU: '0', maxTier: 14, rebirthCount: 0 }).toString()).toBe('0');
  });

  it('参数越界直接报错', () => {
    expect(() => rebirthCables({ totalEU: '1e40', maxTier: 16, rebirthCount: 0 })).toThrow(
      RangeError,
    );
    expect(() => rebirthGuarantee(-1)).toThrow(RangeError);
  });

  it('返回的是整数 Decimal，不会出现小数线缆', () => {
    const cables = rebirthCables({ totalEU: '1e40', maxTier: 13, rebirthCount: 0 });
    expect(cables instanceof Decimal).toBe(true);
    expect(cables.isInteger()).toBe(true);
  });
});
