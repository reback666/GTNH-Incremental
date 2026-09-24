import { Decimal, ONE, ZERO, dec, decInt, pow, type DecimalInput } from './decimal';
import { VOLTAGE_STEP, assertTier } from './voltage';

// 边际成本增长系数，来自计划书第八章：机器成本 = 基础成本 × 4^(tier-1) × g^(已购数量)。
// 第 100 台相对第 1 台约 868 倍（1.07^100 ≈ 867.7）。
// 早期版本（git b4d000b）的取值是 1.12，改成 1.07 是为了更强地压制无脑堆叠；
// 调用方仍可按机型显式传入 growth 覆盖，1.12 / 1.07 的差异见 docs/balance.md。
export const MARGINAL_COST_GROWTH = '1.07';

// 第八章的「后期成本增长从 4^n 调整为 4^n × log(n)」没有写明「后期」从哪个 tier 开始。
// 实现为可配置项，默认关闭：fromTier = null 时不改变成本曲线。
export interface LateGameLogOptions {
  // 「后期」起点 tier；null 表示不启用 log(n) 项。
  fromTier: number | null;
  // 对数底数，'e' 表示自然对数。
  logBase: 'e' | DecimalInput;
}

export const LATE_GAME_LOG_DISABLED: LateGameLogOptions = { fromTier: null, logBase: 'e' };

export function lateGameLogFactor(
  tier: number,
  options: LateGameLogOptions = LATE_GAME_LOG_DISABLED,
): Decimal {
  assertTier(tier);
  if (options.fromTier === null || tier < options.fromTier) {
    return ONE;
  }
  const base = options.logBase === 'e' ? null : dec(options.logBase);
  const n = decInt(tier, 'tier');
  return base === null ? n.ln() : n.log(base);
}

// 电压等级带来的成本倍数：4^(tier-1)，可再叠加第八章的后期 log(n) 修正。
export function tierCostMultiplier(
  tier: number,
  lateGame: LateGameLogOptions = LATE_GAME_LOG_DISABLED,
): Decimal {
  assertTier(tier);
  return pow(String(VOLTAGE_STEP), tier - 1).times(lateGameLogFactor(tier, lateGame));
}

// 已购数量带来的边际成本倍数：g^已购数量。
export function marginalCostMultiplier(
  purchased: number,
  growth: DecimalInput = MARGINAL_COST_GROWTH,
): Decimal {
  if (!Number.isInteger(purchased) || purchased < 0) {
    throw new RangeError(`已购数量必须是非负整数，收到 ${purchased}`);
  }
  return pow(dec(growth), purchased);
}

export interface MachineCostInput {
  // 该机器在 ULV 的基础成本。
  baseCost: DecimalInput;
  // 电压等级 1..14。
  tier: number;
  // 已购买数量（同机型累计）。
  purchased: number;
  // 边际成本增长系数，默认取 MARGINAL_COST_GROWTH。
  growth?: DecimalInput;
  lateGame?: LateGameLogOptions;
}

// 机器单价。GT 币是整数货币，结果向下取整，
// 已购数量 37 / 100 的校验值同样是向下取整后的整数。
export function machineCost(input: MachineCostInput): Decimal {
  return dec(input.baseCost)
    .times(tierCostMultiplier(input.tier, input.lateGame))
    .times(marginalCostMultiplier(input.purchased, input.growth))
    .floor();
}

export interface BulkMachineCostInput extends MachineCostInput {
  // 本次批量购买的数量，从第 purchased+1 台开始算。
  count: number;
}

// 批量购买总价：逐台按 floor 后的单价累加，和玩家一台台点买的结果一致。
export function bulkMachineCost(input: BulkMachineCostInput): Decimal {
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new RangeError(`购买数量必须是非负整数，收到 ${input.count}`);
  }
  let total = ZERO;
  for (let index = 0; index < input.count; index += 1) {
    total = total.plus(machineCost({ ...input, purchased: input.purchased + index }));
  }
  return total;
}
