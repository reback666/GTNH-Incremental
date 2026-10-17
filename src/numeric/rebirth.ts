import { Decimal, ONE, ZERO, dec, decInt, type DecimalInput } from './decimal';
import { assertTier } from './voltage';

// 计划书第五章：转生收益以累计 EU / 1e12 的对数为基准。
export const REBIRTH_EU_DIVISOR = '1e12';

interface ExactFraction {
  numerator: bigint;
  denominator: bigint;
}

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;

// 从十进制字符串还原精确分数（分母是 10 的幂），全程 BigInt，不引入浮点。
// 不读 decimal.js 的内部系数数组：那是以 1e7 为基的分段数组，不是十进制数字。
function toExactFraction(value: Decimal): ExactFraction {
  const match = DECIMAL_PATTERN.exec(value.toString());
  if (match === null) {
    throw new TypeError(`无法解析为十进制数：${value.toString()}`);
  }
  const [, sign, integerPart, fractionPart = '', exponentPart] = match;
  const digits = integerPart + fractionPart;
  const scale = (exponentPart === undefined ? 0 : Number(exponentPart)) - fractionPart.length;
  let numerator = BigInt(digits);
  if (sign === '-') {
    numerator = -numerator;
  }
  if (scale >= 0) {
    return { numerator: numerator * 10n ** BigInt(scale), denominator: 1n };
  }
  return { numerator, denominator: 10n ** BigInt(-scale) };
}

function bitLength(value: bigint): number {
  return value.toString(2).length;
}

// 比较分数 p/q 与 2^k，返回 -1 / 0 / 1。全程 BigInt，结果为精确比较。
function compareWithPowerOfTwo(numerator: bigint, denominator: bigint, k: number): number {
  if (k >= 0) {
    const right = (1n << BigInt(k)) * denominator;
    return numerator < right ? -1 : numerator > right ? 1 : 0;
  }
  const left = numerator << BigInt(-k);
  return left < denominator ? -1 : left > denominator ? 1 : 0;
}

// 精确的 floor(log2(x))，x 必须为正数。
//
// 不使用 x.log(2).floor()：对数结果在 2 的整数次幂附近存在极小误差，
// 恰好落在幂上时会少取一格。这里先用二进制位数给出估计值，
// 再用 BigInt 与 2^k 精确比较并修正，落点永远正确。
export function floorLog2(value: DecimalInput): number {
  const x = dec(value);
  if (!x.isFinite() || x.isNegative() || x.isZero()) {
    throw new RangeError(`floorLog2 只接受有限正数，收到 ${x.toString()}`);
  }
  const { numerator, denominator } = toExactFraction(x);
  let k = bitLength(numerator) - bitLength(denominator);
  while (compareWithPowerOfTwo(numerator, denominator, k) < 0) {
    k -= 1;
  }
  while (compareWithPowerOfTwo(numerator, denominator, k + 1) >= 0) {
    k += 1;
  }
  return k;
}

export interface RebirthCablesInput {
  // 本周目累计产出的 EU。
  totalEU: DecimalInput;
  // 本周目达到过的最高电压等级 1..MAX_TIER。
  maxTier: number;
  // 已完成的转生次数 x，首次转生为 0。
  rebirthCount: number;
}

// 计划书第五章的电压加成：(1 + 0.1 × 最高电压等级)。
export function tierCableBonus(maxTier: number): Decimal {
  assertTier(maxTier, 'maxTier');
  return ONE.plus(dec('0.1').times(decInt(maxTier, 'maxTier')));
}

// 保底项 (2x + 1)，x 为已完成转生次数。
export function rebirthGuarantee(rebirthCount: number): Decimal {
  if (!Number.isInteger(rebirthCount) || rebirthCount < 0) {
    throw new RangeError(`转生次数必须是非负整数，收到 ${rebirthCount}`);
  }
  return decInt(2).times(decInt(rebirthCount, 'rebirthCount')).plus(ONE);
}

// 时空线缆 = floor(log2(累计EU / 1e12)) × (1 + 0.1 × 最高电压等级) + (2x + 1)。
//
// log2 取整使用精确方法（见 floorLog2）；整体结果向下取整，因为线缆是整数货币，
// 且校验值 1e40 / tier=13 / x=0 的期望为 214（93 × 2.3 + 1 = 214.9 → 214）。
// 累计 EU 不足 1e12 时结果为负，按 0 处理。
export function rebirthCables(input: RebirthCablesInput): Decimal {
  const ratio = dec(input.totalEU).div(REBIRTH_EU_DIVISOR);
  if (!ratio.gt(0)) {
    return ZERO;
  }
  const cables = decInt(floorLog2(ratio), 'log2 指数')
    .times(tierCableBonus(input.maxTier))
    .plus(rebirthGuarantee(input.rebirthCount))
    .floor();
  return Decimal.max(cables, ZERO);
}
