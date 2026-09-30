import { Decimal, dec, type DecimalInput } from './decimal';
import { overclockEnergyMultiplier, overclockSpeedMultiplier } from './overclock';
import { assertTier, voltageMultiplier } from './voltage';

export interface MachineOutputInput {
  // 该机器在 ULV 的基础产出。
  baseOutput: DecimalInput;
  // 机器电压等级 1..14。
  tier: number;
  // 超频档位 0-3，默认 0。
  overclockLevel?: number;
}

// 基础产出 = 基础值 × 4^(tier-1)。
export function baseOutputAtTier(baseOutput: DecimalInput, tier: number): Decimal {
  assertTier(tier);
  return dec(baseOutput).times(voltageMultiplier(tier));
}

// 产出速率 = 基础值 × 4^(tier-1) × 超频倍率（计划书第八章）。
// 配方等级只决定「跑不跑得起来」（见 recipe.ts），不影响产出与能耗。
export function machineOutput(input: MachineOutputInput): Decimal {
  return baseOutputAtTier(input.baseOutput, input.tier)
    .times(overclockSpeedMultiplier(input.overclockLevel ?? 0));
}

export interface MachineEnergyInput {
  // ULV 下的基础能耗（EU/t）。
  baseEnergy: DecimalInput;
  tier: number;
  // 超频档位 0-3，默认 0。
  overclockLevel?: number;
}

// 机器能耗 = 基础能耗 × 4^(tier-1) × 4^超频档位。
export function machineEnergy(input: MachineEnergyInput): Decimal {
  return dec(input.baseEnergy)
    .times(voltageMultiplier(input.tier))
    .times(overclockEnergyMultiplier(input.overclockLevel ?? 0));
}
