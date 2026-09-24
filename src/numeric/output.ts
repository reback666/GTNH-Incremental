import { Decimal, ZERO, dec, type DecimalInput } from './decimal';
import { overclockEnergyMultiplier, overclockSpeedMultiplier } from './overclock';
import { parallelMultiplier } from './parallel';
import { assertTier, voltageMultiplier } from './voltage';

export interface MachineOutputInput {
  // 该机器在 ULV 的基础产出。
  baseOutput: DecimalInput;
  // 机器电压等级 1..14。
  tier: number;
  // 超频档位 0-3，默认 0。
  overclockLevel?: number;
  // 加工配方的等级，默认与机器电压同级（此时并行倍率为 1）。
  recipeTier?: number;
  // 并行上限，默认不限。
  maxParallel?: number;
}

// 基础产出 = 基础值 × 4^(tier-1)。
export function baseOutputAtTier(baseOutput: DecimalInput, tier: number): Decimal {
  assertTier(tier);
  return dec(baseOutput).times(voltageMultiplier(tier));
}

// 产出 = 基础值 × 4^(tier-1) × 超频倍率 × 并行倍率（计划书第八章）。
export function machineOutput(input: MachineOutputInput): Decimal {
  const recipeTier = input.recipeTier ?? input.tier;
  return baseOutputAtTier(input.baseOutput, input.tier)
    .times(overclockSpeedMultiplier(input.overclockLevel ?? 0))
    .times(parallelMultiplier(input.tier, recipeTier, input.maxParallel));
}

export interface MachineEnergyInput {
  // ULV 下的基础能耗（EU/t）。
  baseEnergy: DecimalInput;
  tier: number;
  // 超频档位 0-3，默认 0。
  overclockLevel?: number;
  maxParallel?: number;
  recipeTier?: number;
}

// 机器能耗 = 基础能耗 × 4^(tier-1) × 并行倍率 × 2^超频档位。
export function machineEnergy(input: MachineEnergyInput): Decimal {
  const recipeTier = input.recipeTier ?? input.tier;
  return dec(input.baseEnergy)
    .times(voltageMultiplier(input.tier))
    .times(parallelMultiplier(input.tier, recipeTier, input.maxParallel))
    .times(overclockEnergyMultiplier(input.overclockLevel ?? 0));
}

// 整条产线的总产出：逐台机器求和，累加全程使用 Decimal。
export function lineOutput(
  machines: MachineOutputInput[],
  perMachineCount: number[] = machines.map(() => 1),
): Decimal {
  let total = ZERO;
  machines.forEach((machine, index) => {
    const count = perMachineCount[index] ?? 1;
    total = total.plus(machineOutput(machine).times(count));
  });
  return total;
}
