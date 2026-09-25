import { Decimal, dec } from '../numeric/decimal';
import { machineCost } from '../numeric/cost';

// 第一阶段的参数。计划书未定义这些数，集中在这里便于后续调参。
// 标「计划书」的是文档已定的值，标「暂定」的是为了能跑通而选的值。

// 计划书第八章：成本/产出比 500。
// ULV 制造机每秒 1 枚币（作者定），首台成本 500 枚币，两者之比仍是 500，
// 所以整体节奏与之前一致：每级 50 台约 58 小时通关。
// 注意：单独把产量调小、成本不动，会让通关时间同比拉长，改节奏请改成本。
export const BASE_MACHINE_COST = '500';
export const BASE_MACHINE_OUTPUT = '1';

// 暂定：制造机基础耗电，按「本级 1A」取。
export const BASE_MACHINE_ENERGY = '8';

// 暂定：制造机直接吃矿的速率 —— 每产出 100 枚本位币消耗 1 枚本级矿石。
// 与制造机产量无关，是「矿 → 币」的换算率。
export const COINS_PER_ORE = '100';

// 暂定：一次手动挖矿的产出（枚 T0 矿石）。
export const MANUAL_MINE_PER_CLICK = '1';

// 暂定：解锁 X 级需要攒够 X-1 级币，数量 = 该级第 1 台机器成本的 10 倍。
export const UNLOCK_COST_IN_MACHINES = 10;

// 模拟步长与界面刷新频率（计划书第十四章：UI 20 Hz、运算 1 Hz 或更低）。
export const SIM_STEP_MS = 1000;
export const UI_REFRESH_MS = 50;

// 存档结构版本，用于迁移（计划书第十四章）。
// v1：机器数量按电压等级存（miners/generators/machines 各 14 个）
// v2：改按机型存（counts: 机型 id → 数量），因为同一个等级现在可以有多个机型
export const SAVE_VERSION = 2;
export const SAVE_KEY = 'gtnh-incremental-save';

export function unlockCost(machineTier: number): Decimal {
  return machineCost({ baseCost: BASE_MACHINE_COST, tier: machineTier, purchased: 0 }).times(
    UNLOCK_COST_IN_MACHINES,
  );
}

export function manualMineAmount(): Decimal {
  return dec(MANUAL_MINE_PER_CLICK);
}
