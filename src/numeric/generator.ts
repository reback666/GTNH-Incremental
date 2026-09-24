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

// 发电机输出功率（EU/t）。
export function generatorOutputEU(tier: number): Decimal {
  assertTier(tier);
  return dec(ULV_OUTPUT_EU_PER_TICK).times(pow(String(VOLTAGE_STEP_FOR_OUTPUT), tier - 1));
}

// 该等级发电机的燃料效率，取值 0-1。
export function generatorFuelEfficiency(tier: number): Decimal {
  assertTier(tier);
  return dec(GENERATOR_FUEL_EFFICIENCY[tier] ?? DEFAULT_FUEL_EFFICIENCY);
}

// 燃料消耗速率（枚矿石/秒）。
// oreEnergyValue 是单枚本级矿石折算出的 EU，尚未定值（见计划书第二十一章）。
export function generatorFuelRate(tier: number, oreEnergyValue: DecimalInput): Decimal {
  return generatorOutputEU(tier).div(dec(oreEnergyValue).times(generatorFuelEfficiency(tier)));
}
