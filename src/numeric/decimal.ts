import Decimal from 'decimal.js';

// 全局精度配置，必须在任何运算前生效。
// 计划书第八章要求显式指定 40 位有效位数：decimal.js 默认 20 位，
// 多层 Mod 倍率叠加后会漂移，因此在模块加载时统一设死。
Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

export { Decimal };

// 数值层内部一律使用 Decimal 或十进制字符串，禁止二进制浮点参与累计运算。
export type DecimalInput = Decimal | string;

// 存档 / JSON 中的大数值表示：十进制字符串。
// JSON.parse 只有 double 一种数字类型，超过 2^53 时解析阶段就已丢失精度。
export type SerializedDecimal = string;

const DECIMAL_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function dec(value: DecimalInput): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

// 把整数标量（电压等级、已购数量、超频档位等）转成 Decimal。
// 只有整数允许经 number 传入，非整数直接抛错，避免浮点悄悄混进累计运算。
export function decInt(value: number, label = 'value'): Decimal {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} 必须是整数，收到 ${value}`);
  }
  return new Decimal(value);
}

export const ZERO: Decimal = new Decimal(0);
export const ONE: Decimal = new Decimal(1);

// 存档序列化：一律输出十进制字符串。
export function toSaveString(value: DecimalInput): SerializedDecimal {
  return dec(value).toString();
}

// 从存档读取：只接受十进制字符串，非法内容抛错而不是静默变成 NaN。
export function fromSaveString(text: SerializedDecimal): Decimal {
  if (typeof text !== 'string' || !DECIMAL_TEXT.test(text)) {
    throw new TypeError(`不是合法的十进制字符串：${String(text)}`);
  }
  return new Decimal(text);
}

// 幂运算包装，统一走 Decimal.pow，避免误用 Math.pow。
export function pow(base: DecimalInput, exponent: number): Decimal {
  return dec(base).pow(decInt(exponent, 'exponent'));
}

// 分数次幂：连锁爆破要算 n^(n/2)，指数是半整数。
// 只用来由等级推倍率，不参与反复累加 —— 累加仍然走 Decimal 的加减。
export function powFraction(base: DecimalInput, numerator: number, denominator: number): Decimal {
  const top = decInt(numerator, 'numerator');
  const bottom = decInt(denominator, 'denominator');
  if (bottom.lte(0)) throw new RangeError(`分母必须是正整数，收到 ${denominator}`);
  return dec(base).pow(top.div(bottom));
}
