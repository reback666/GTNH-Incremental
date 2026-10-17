// 存电装置（电池）：把富余电力存成存量，发电不足时先放存量（计划书第七章）。
//
// 容量跟着电压走 —— 高一级的机器耗电是 4 倍，电池容量同样 ×4，
// 这样「装满一块电池能用多久」在所有等级上一致。
import { Decimal, ZERO, dec } from './decimal';
import { assertTier, VOLTAGE_STEP } from './voltage';

// 一台 ULV 电池的容量：16000 EU（2026-10-05 用户拍板 ×16，原来 1000）。
// ULV 发电机的额定输出是 8 EU/t，装满约等于它跑 2000 秒。
export const ULV_BATTERY_CAPACITY = '16000';
export const BATTERY_CAPACITY_FACTOR = String(VOLTAGE_STEP);

export function batteryCapacityEU(tier: number): Decimal {
  assertTier(tier);
  return dec(ULV_BATTERY_CAPACITY).times(dec(BATTERY_CAPACITY_FACTOR).pow(tier - 1));
}

// 充电 / 放电的结算结果
export interface StorageSettlement {
  stored: Decimal;
  charged: Decimal;
  discharged: Decimal;
  // 存量也填不上的缺口（EU），界面用它算供电率
  shortfall: Decimal;
}

export function settleStorage(input: {
  stored: Decimal;
  capacity: Decimal;
  // 发电 - 耗电（EU/t，正数是富余）
  net: Decimal;
  dtSeconds: number;
}): StorageSettlement {
  const { stored, capacity, net, dtSeconds } = input;
  const delta = net.times(dtSeconds);
  if (delta.gte(0)) {
    const charged = Decimal.min(delta, Decimal.max(ZERO, capacity.minus(stored)));
    return { stored: stored.plus(charged), charged, discharged: ZERO, shortfall: ZERO };
  }
  const want = delta.abs();
  const discharged = Decimal.min(want, stored);
  return {
    stored: stored.minus(discharged),
    charged: ZERO,
    discharged,
    shortfall: want.minus(discharged),
  };
}
