import { Decimal, ONE, dec, pow } from './decimal';
import { assertTier } from './voltage';

// 数值来源：GTNH「采矿机」条目（gtnh.huijiwiki.com/wiki/采矿机）。
// 基础采矿机（LV）8 EU/t、8 秒挖一个方块
// 优良采矿机（MV）32 EU/t、4 秒
// 进阶采矿机（HV）128 EU/t、2 秒
// 规律：耗电 ×4、耗时 ÷2 —— 与 GTNH 的实测值完全一致，也与超频规则一致。
// 注意：GTNH 只有 LV~HV 三档，再往上按同一规律外推。
//
// 唯一偏离 GTNH 的地方：整体产矿速度 ×16（耗时 ÷16），耗电保持不变。
// 本作是挂机增量游戏，按 GTNH 原始速度推进太慢，所以全局提速；
// 倍率只作用在「产量」上，不改 GTNH 的 ×4 耗电 / ÷2 提速规律。
export const LV_ENERGY_EU = '8';
export const LV_SECONDS_PER_ORE = '8';
export const MINER_SPEED_FACTOR = 2; // 每级速度 ×2（照搬 GTNH）
export const MINER_ENERGY_FACTOR = 4; // 每级耗电 ×4
export const MINER_OUTPUT_FACTOR = '16'; // 全局产矿倍率（本地平衡，GTNH 为 1）

// 采矿机耗电（EU/t）。
export function minerEnergyEU(tier: number): Decimal {
  assertTier(tier);
  return dec(LV_ENERGY_EU).times(pow(String(MINER_ENERGY_FACTOR), tier - 2));
}

// 挖出一枚矿石所需的秒数。
export function minerSecondsPerOre(tier: number): Decimal {
  assertTier(tier);
  return dec(LV_SECONDS_PER_ORE)
    .div(pow(String(MINER_SPEED_FACTOR), tier - 2))
    .div(MINER_OUTPUT_FACTOR);
}

// 产矿速率（枚/秒）。
export function minerOrePerSecond(tier: number): Decimal {
  return ONE.div(minerSecondsPerOre(tier));
}
