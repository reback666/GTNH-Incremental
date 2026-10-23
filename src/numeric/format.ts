import { Decimal, decInt, type DecimalInput } from './decimal';

// 显示层只输出字符串，不写回游戏状态。
export type DisplayMode = 'auto' | 'scientific' | 'full';

export interface FormatOptions {
  // auto：按计划书第十章规则；scientific：纯科学计数法；full：完整数字。
  mode?: DisplayMode;
  // 有效数字位数，默认 3（计划书第十章）。
  significantDigits?: number;
}

const SUFFIXES = ['', 'K', 'M', 'G', 'T', 'P', 'E'] as const;
const THOUSAND = decInt(1000);
const SUFFIX_MAX_EXPONENT = decInt(10).pow(18);

// 全局默认显示模式：设置页的「数字显示」偏好（存档 v21），store 在读档与切换时同步过来。
// 显式传 options.mode 的调用不受它影响（仍以参数为准）。
let defaultMode: DisplayMode = 'auto';

export function setDefaultDisplayMode(mode: DisplayMode): void {
  defaultMode = mode;
}

export function getDefaultDisplayMode(): DisplayMode {
  return defaultMode;
}

function plainText(value: Decimal, digits: number): string {
  return value.isInteger() ? value.toFixed() : value.toSignificantDigits(digits).toString();
}

// 补足有效数字的尾零，让 1000 显示成 1.00K 而不是 1K。
// 只在后缀分支使用：那里的缩放值恒在 [1, 1000)，不会出现前导零。
function padSignificant(text: string, digits: number): string {
  const [intPart, fracPart = ''] = text.replace('-', '').split('.');
  const significant = (intPart + fracPart).replace(/^0+/, '').length;
  if (significant >= digits) {
    return text;
  }
  const need = digits - significant;
  return fracPart.length > 0 ? `${text}${'0'.repeat(need)}` : `${text}.${'0'.repeat(need)}`;
}

function suffixText(abs: Decimal, digits: number): string {
  const index = Math.floor(abs.e / 3);
  const scaled = abs.div(THOUSAND.pow(index)).toSignificantDigits(digits);
  // 例：999999 缩放后是 999.999，取 3 位有效数字进位成 1000，此时后缀往上挪一级。
  if (scaled.gte(1000) && index < SUFFIXES.length - 1) {
    return `${padSignificant('1', digits)}${SUFFIXES[index + 1]}`;
  }
  return `${padSignificant(scaled.toString(), digits)}${SUFFIXES[index]}`;
}

function scientificText(abs: Decimal, digits: number): string {
  return abs.toExponential(digits - 1).replace('e+', 'e');
}

// 大数字显示（计划书第十章）：
// - 小于 1000：普通数字，如 856；
// - 1000 到 1e18：K / M / G / T / P / E 后缀，保留 3 位有效数字，如 1.23K；
// - 大于 1e18：科学计数法，如 1.23e19。
export function formatNumber(value: DecimalInput, options: FormatOptions = {}): string {
  const number = value instanceof Decimal ? value : new Decimal(value);
  const mode = options.mode ?? defaultMode;
  const digits = options.significantDigits ?? 3;

  if (!number.isFinite()) {
    return number.isNaN() ? 'NaN' : `${number.isNegative() ? '-' : ''}∞`;
  }
  if (number.isZero()) {
    return '0';
  }

  const sign = number.isNegative() ? '-' : '';
  const abs = number.abs();

  if (mode === 'full') {
    return sign + plainText(abs, digits);
  }
  if (mode === 'scientific') {
    return sign + scientificText(abs, digits);
  }
  if (abs.lt(1000)) {
    return sign + plainText(abs, digits);
  }
  if (abs.lte(SUFFIX_MAX_EXPONENT)) {
    return sign + suffixText(abs, digits);
  }
  return sign + scientificText(abs, digits);
}
