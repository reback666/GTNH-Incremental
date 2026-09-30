import { describe, expect, it } from 'vitest';
import { formatDuration, formatStamp } from '../src/numeric/time';

// 时长与时间戳的格式化只有这一份实现（界面、日志、诊断报告共用），这里把它钉住。
describe('时间格式化', () => {
  it('时长：小时级只到分，分钟级到秒，秒级直接给秒', () => {
    expect(formatDuration(0)).toBe('0 秒');
    expect(formatDuration(42)).toBe('42 秒');
    expect(formatDuration(95)).toBe('1 分 35 秒');
    expect(formatDuration(3600)).toBe('1 小时 0 分');
    expect(formatDuration(3725)).toBe('1 小时 2 分');
    expect(formatDuration(-5)).toBe('0 秒');
  });

  it('时间戳：月 / 日 / 时 / 分 / 秒都补零', () => {
    expect(formatStamp(new Date(2026, 8, 30, 8, 5, 4))).toBe('2026-09-30 08:05:04');
  });
});
