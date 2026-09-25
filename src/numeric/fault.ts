// 超频带来的故障：档位越高，故障率指数上升（计划书第六章）。
//
// 故障表现是「停机，需要手动维护」，所以这里只管概率；停机与维护由 GameCore 处理。
import { Decimal, dec, ZERO } from './decimal';
import { MAX_OVERCLOCK_LEVEL, assertOverclockLevel } from './overclock';

// 1 档：每台机器每分钟 1% 的故障率
export const FAULT_BASE_PER_MINUTE = '0.01';
// 每提高一档，故障率翻一倍（档位越高增长越快）
export const FAULT_RATE_GROWTH = '2';

export function faultRatePerMinute(level: number): Decimal {
  assertOverclockLevel(level);
  if (level === 0) return ZERO;
  return dec(FAULT_BASE_PER_MINUTE).times(dec(FAULT_RATE_GROWTH).pow(level - 1));
}

export function faultRatePerSecond(level: number): Decimal {
  return faultRatePerMinute(level).div(60);
}

// 一批机器在 dt 秒内的期望故障台数
export function expectedFaults(level: number, machines: number, dtSeconds: number): number {
  if (machines <= 0) return 0;
  return faultRatePerSecond(level).times(machines).times(dtSeconds).toNumber();
}

// 按泊松分布抽这一拍坏几台。
// 期望值小时直接抽（Knuth），大时用正态近似 —— 后期一台机型可能上千台，逐台抽太慢。
export function sampleFaults(expected: number, random: () => number = Math.random): number {
  if (!(expected > 0)) return 0;
  if (expected < 30) {
    const limit = Math.exp(-expected);
    let count = 0;
    let product = 1;
    do {
      count += 1;
      product *= random();
    } while (product > limit);
    return count - 1;
  }
  const u = random() || Number.EPSILON;
  const gaussian = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  return Math.max(0, Math.round(expected + Math.sqrt(expected) * gaussian));
}

// 界面上按分钟给出「平均多久坏一台」，档位 0 返回空
export function faultHint(level: number, machines: number): string {
  if (level === 0 || machines <= 0) return '不超频不会故障';
  const perMinute = faultRatePerMinute(level).times(machines).toNumber();
  if (perMinute <= 0) return '不超频不会故障';
  const minutes = 1 / perMinute;
  const text = minutes >= 1 ? `${minutes.toFixed(1)} 分钟` : `${Math.round(minutes * 60)} 秒`;
  return `平均每 ${text}坏 1 台`;
}

export { MAX_OVERCLOCK_LEVEL };
