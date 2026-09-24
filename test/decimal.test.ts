import { describe, expect, it } from 'vitest';
import {
  Decimal,
  dec,
  decInt,
  fromSaveString,
  toSaveString,
} from '../src/numeric/decimal';

describe('decimal 统一配置', () => {
  it('启动时把精度设成 40 位', () => {
    expect(Decimal.precision).toBe(40);
  });

  it('40 位精度真的生效（1/3 保留 40 位有效数字）', () => {
    expect(dec('1').div(3).toSignificantDigits(40).toString()).toBe(
      '0.3333333333333333333333333333333333333333',
    );
    expect(dec('1').div(3).precision()).toBe(40);
  });

  it('十进制运算不受二进制浮点误差影响', () => {
    expect(dec('0.1').plus('0.2').toString()).toBe('0.3');
    expect(dec('1.1').times('3').toString()).toBe('3.3');
  });

  it('大数值累加不丢精度（1e1000 量级按指数运算）', () => {
    let sum = new Decimal(0);
    for (let index = 0; index < 1000; index += 1) {
      sum = sum.plus('1e1000');
    }
    expect(sum.eq(dec('1e1003'))).toBe(true);
  });
});

describe('数值序列化', () => {
  it('写出的是字符串，读回完全一致', () => {
    const value = dec('1401271092903474.000000000000000000000001');
    const text = toSaveString(value);
    expect(typeof text).toBe('string');
    expect(fromSaveString(text).eq(value)).toBe(true);
  });

  it('1e1000 量级经 JSON 往返后不丢位', () => {
    const value = dec('9.87654321e1000');
    const text = toSaveString(value);
    expect(typeof text).toBe('string');
    const roundTrip = JSON.parse(JSON.stringify({ totalEU: text })) as { totalEU: string };
    expect(roundTrip.totalEU).toBe(text);
    expect(fromSaveString(roundTrip.totalEU).eq(value)).toBe(true);
  });

  it('非十进制字符串直接报错', () => {
    expect(() => fromSaveString('0x10')).toThrow();
    expect(() => fromSaveString('1,000')).toThrow();
    expect(() => fromSaveString('')).toThrow();
  });
});

describe('整数标量入口', () => {
  it('接受整数', () => {
    expect(decInt(14, 'tier').toString()).toBe('14');
  });

  it('拒绝非整数，防止浮点混进累计运算', () => {
    expect(() => decInt(1.5, 'tier')).toThrow(TypeError);
  });
});
