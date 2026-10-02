import { afterEach, describe, expect, it } from 'vitest';
import { formatNumber, setDefaultDisplayMode } from '../src/numeric/format';

describe('大数字显示（计划书第十章）', () => {
  it('小于 1000 用普通数字', () => {
    expect(formatNumber('0')).toBe('0');
    expect(formatNumber('856')).toBe('856');
    expect(formatNumber('999')).toBe('999');
    expect(formatNumber('0.5')).toBe('0.5');
    expect(formatNumber('0.00123')).toBe('0.00123');
  });

  it('1000 到 1e18 用 K/M/G/T/P/E 后缀，保留 3 位有效数字', () => {
    expect(formatNumber('1000')).toBe('1.00K');
    expect(formatNumber('1234')).toBe('1.23K');
    expect(formatNumber('4560000')).toBe('4.56M');
    expect(formatNumber('7.89e9')).toBe('7.89G');
    expect(formatNumber('1.23e12')).toBe('1.23T');
    expect(formatNumber('4.56e15')).toBe('4.56P');
    expect(formatNumber('1e18')).toBe('1.00E');
  });

  it('缩放后进位到下一级后缀', () => {
    expect(formatNumber('999999')).toBe('1.00M');
    expect(formatNumber('999.9e6')).toBe('1.00G');
  });

  it('大于 1e18 用科学计数法', () => {
    expect(formatNumber('2.5e18')).toBe('2.50e18');
    expect(formatNumber('1.23e19')).toBe('1.23e19');
    expect(formatNumber('1e1000')).toBe('1.00e1000');
  });

  it('负数保留符号', () => {
    expect(formatNumber('-1234')).toBe('-1.23K');
    expect(formatNumber('-0.5')).toBe('-0.5');
    expect(formatNumber('-2.5e18')).toBe('-2.50e18');
  });

  it('可切换为纯科学计数法', () => {
    expect(formatNumber('856', { mode: 'scientific' })).toBe('8.56e2');
    expect(formatNumber('1234', { mode: 'scientific' })).toBe('1.23e3');
    expect(formatNumber('1e18', { mode: 'scientific' })).toBe('1.00e18');
  });

  it('可切换为完整数字显示', () => {
    expect(formatNumber('1.23e12', { mode: 'full' })).toBe('1230000000000');
    const full = formatNumber('1e1000', { mode: 'full' });
    expect(full.length).toBe(1001);
    expect(full.startsWith('1')).toBe(true);
  });

  it('显示层返回字符串，不产生可写回状态的数值', () => {
    expect(typeof formatNumber('1.23e1200')).toBe('string');
  });
});

describe('全局默认显示模式（设置页偏好，存档 v21）', () => {
  afterEach(() => {
    setDefaultDisplayMode('auto');
  });

  it('默认自动；切换后无参调用跟着变，显式传 mode 仍以参数为准', () => {
    expect(formatNumber('1.23e9')).toBe('1.23G');

    setDefaultDisplayMode('full');
    expect(formatNumber('1.23e9')).toBe('1230000000');

    setDefaultDisplayMode('scientific');
    expect(formatNumber('1234')).toBe('1.23e3');
    expect(formatNumber('1.23e9', { mode: 'full' })).toBe('1230000000');
  });
});
