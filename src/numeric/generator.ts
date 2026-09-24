import { Decimal, dec, pow, type DecimalInput } from './decimal';
import { assertTier } from './voltage';

// 数值来源：GTNH「发电机」条目（gtnh.huijiwiki.com/wiki/发电机，与英文 wiki 的
// Singleblock Generators 同步）。单方块发电机以该等级的标准电压最多输出 1A 电流，
// 所以每级输出功率 = 该级电压：LV 32、MV 128、HV 512 EU/t，每级 4 倍。
// 这与计划书第二章「每级电压为前一级的 4 倍」完全一致。
export const ULV_OUTPUT_EU_PER_TICK = '8';
export const VOLTAGE_STEP_FOR_OUTPUT = 4;

// 燃料效率随等级递减。GTNH 原表：LV 85%、MV 75%、HV 66%，EV 及以后约 65%。
// ULV 在 GTNH 里没有对应的单方块发电机，沿用 LV 的宽松值。
export const GENERATOR_FUEL_EFFICIENCY: Record<number, string> = {
  1: '0.85',
  2: '0.85',
  3: '0.75',
  4: '0.66',
};

export const DEFAULT_FUEL_EFFICIENCY = '0.65';

// 单枚矿石的能量值。作者定：1 枚 ULV 矿石 = 128 EU，高等级矿石每级 ×2。
// 递增倍数与采矿机提速倍数共同决定「采矿机产矿」与「发电机烧矿」之比：
//   比例 ∝ (采矿机提速倍数 × 矿石能量递增倍数 ÷ 4)^(tier-1)
// 只有两者相乘等于 4 时比例才恒定。
export const ULV_ORE_ENERGY = '128';
export const ORE_ENERGY_FACTOR = '2';

// 发电机输出功率（EU/t）。
export function generatorOutputEU(tier: number): Decimal {
  assertTier(tier);
  return dec(ULV_OUTPUT_EU_PER_TICK).times(pow(String(VOLTAGE_STEP_FOR_OUTPUT), tier - 1));
}

// 该等级矿石的能量值（EU/枚）。
export function oreEnergyValue(tier: number): Decimal {
  assertTier(tier);
  return dec(ULV_ORE_ENERGY).times(dec(ORE_ENERGY_FACTOR).pow(tier - 1));
}

// 该等级发电机的燃料效率，取值 0-1。
export function generatorFuelEfficiency(tier: number): Decimal {
  assertTier(tier);
  return dec(GENERATOR_FUEL_EFFICIENCY[tier] ?? DEFAULT_FUEL_EFFICIENCY);
}

// 燃料消耗速率（枚矿石/秒）。
// 不传 oreEnergy 时按本级矿石的默认能量值计算。
export function generatorFuelRate(tier: number, oreEnergy?: DecimalInput): Decimal {
  const energy = oreEnergy === undefined ? oreEnergyValue(tier) : dec(oreEnergy);
  return generatorOutputEU(tier).div(energy.times(generatorFuelEfficiency(tier)));
}
