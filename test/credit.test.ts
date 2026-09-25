import { describe, expect, it } from 'vitest';
import {
  coinName,
  coinValueInTier1,
  convertCoins,
  normalizeCoins,
  oreName,
  paymentTier,
} from '../src/numeric/credit';

describe('GT 币', () => {
  it('币值 4 合 1：1 枚 tier-n 币 = 4^(n-1) 枚 tier-1 币', () => {
    expect(coinValueInTier1(1).toString()).toBe('1');
    expect(coinValueInTier1(2).toString()).toBe('4');
    expect(coinValueInTier1(3).toString()).toBe('16');
    expect(coinValueInTier1(14).toString()).toBe('67108864');
  });

  it('换算：向上换是除法，向下换是乘法', () => {
    expect(convertCoins('8', 1, 2).toString()).toBe('2');
    expect(convertCoins('2', 2, 1).toString()).toBe('8');
    expect(convertCoins('3', 3, 1).toString()).toBe('48');
  });

  it('买 X 级机器用 X-1 级的币，ULV 用自己那级', () => {
    expect(paymentTier(1)).toBe(1);
    expect(paymentTier(2)).toBe(1);
    expect(paymentTier(3)).toBe(2);
    expect(paymentTier(14)).toBe(13);
  });

  it('规整：低位始终不足 4 枚', () => {
    // 5 枚 tier-1 币 = 1 枚 tier-2 币 + 1 枚 tier-1 币
    const stacks = normalizeCoins('5', 3);
    expect(stacks[0]!.toString()).toBe('1');
    expect(stacks[1]!.toString()).toBe('1');
    expect(stacks[2]!.toString()).toBe('0');
    // 16 枚 tier-1 币正好是一枚 tier-3 币
    const exact = normalizeCoins('16', 3);
    expect(exact.map((d) => d.toString())).toEqual(['0', '0', '1']);
  });

  it('币名与矿名', () => {
    expect(coinName(1)).toBe('铜币');
    expect(coinName(8)).toBe('中子素币');
    expect(coinName(9)).toBe('宇宙中子素币');
    expect(coinName(14)).toBe('普朗克币');
    expect(oreName(0)).toBe('T0 矿石');
    expect(oreName(13)).toBe('T13 矿石');
  });

  it('越界等级直接报错', () => {
    expect(() => coinValueInTier1(0)).toThrow(RangeError);
    expect(() => paymentTier(15)).toThrow(RangeError);
  });
});
