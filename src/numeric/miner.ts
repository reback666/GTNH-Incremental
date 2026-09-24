import { Decimal, ONE, dec, pow } from './decimal';
import { assertTier } from './voltage';

// 数值来源：GTNH「采矿机」条目（gtnh.huijiwiki.com/wiki/采矿机）。
// 基础采矿机（LV）8 EU/t、8 秒挖一个方块
// 优良采矿机（MV）32 EU/t、4 秒
// 进阶采矿机（HV）128 EU/t、2 秒
// 规律：耗电 ×4、耗时 ÷2 —— 正是 GTNH「4 倍电换 2 倍速」的超频规则。
//
// 注意：GTNH 只有 LV~HV 三档，ULV 与 HV 以上都是外推，规则待作者确认（见计划书第二十一章）。
export const LV_ENERGY_EU = '8';
export const LV_SECONDS_PER_ORE = '8';
export const MINER_SPEED_FACTOR = 2; // 每级速度 ×2
export const MINER_ENERGY_FACTOR = 4; // 每级耗电 ×4

// 采矿机耗电（EU/t）。
export function minerEnergyEU(tier: number): Decimal {
  assertTier(tier);
  return dec(LV_ENERGY_EU).times(pow(String(MINER_ENERGY_FACTOR), tier - 2));
}

// 挖出一枚矿石所需的秒数。
export function minerSecondsPerOre(tier: number): Decimal {
  assertTier(tier);
  return dec(LV_SECONDS_PER_ORE).div(pow(String(MINER_SPEED_FACTOR), tier - 2));
}

// 产矿速率（枚/秒）。
export function minerOrePerSecond(tier: number): Decimal {
  return ONE.div(minerSecondsPerOre(tier));
}
