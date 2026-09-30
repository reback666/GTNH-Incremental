// 电网模式（计划书第六章）：开局接的是普通电网，其余的靠升级电压解锁，解锁后可自由切换。
//
//   普通电网（开局）：耗电不打折也不加价，但线路老，偶尔断电
//   稳定电网：加装稳压装置，耗电略高、绝不断电
//   波动电网：用低规格线路省钱，断电明显更频繁
//   黑市电网：最省电，但每分钟会被薅走一种 GT 币的 1%
//
// 耗电差都控制在 10% 上下：电网是取舍，不该压过机器本身的数量与等级。
import { Decimal, dec } from './decimal';

export type GridMode = 'normal' | 'stable' | 'volatile' | 'black';

// 断电规则：每 checkSeconds 判一次，命中就停 outageSeconds 秒
export interface OutageRule {
  checkSeconds: number;
  chance: number;
  outageSeconds: number;
}

export interface GridModeInfo {
  id: GridMode;
  name: string;
  // 耗电倍率
  energyMultiplier: string;
  summary: string;
  // 解锁需要的电压等级（1 = ULV，开局就有）
  unlockTier: number;
  outage: OutageRule | null;
}

export const GRID_MODES: GridModeInfo[] = [
  {
    id: 'normal',
    name: '普通电网',
    energyMultiplier: '1',
    summary: '耗电不变，线路老，每 5 分钟有 5% 概率断电 5 秒',
    unlockTier: 1,
    outage: { checkSeconds: 300, chance: 0.05, outageSeconds: 5 },
  },
  {
    id: 'stable',
    name: '稳定电网',
    energyMultiplier: '1.08',
    summary: '耗电 +8%，加装稳压装置，绝不会断电',
    unlockTier: 2,
    outage: null,
  },
  {
    id: 'volatile',
    name: '波动电网',
    energyMultiplier: '0.9',
    summary: '耗电 -10%，每 5 分钟有 15% 概率断电 10 秒',
    unlockTier: 3,
    outage: { checkSeconds: 300, chance: 0.15, outageSeconds: 10 },
  },
  {
    id: 'black',
    name: '黑市电网',
    energyMultiplier: '0.85',
    summary: '耗电 -15%，每分钟随机被窃取一种 GT 币的 1%',
    unlockTier: 4,
    outage: null,
  },
];

export const DEFAULT_GRID: GridMode = 'normal';

export function gridMode(id: GridMode): GridModeInfo {
  return GRID_MODES.find((mode) => mode.id === id) ?? GRID_MODES[0]!;
}

export function gridEnergyMultiplier(id: GridMode): Decimal {
  return dec(gridMode(id).energyMultiplier);
}

export function gridOutageRule(id: GridMode): OutageRule | null {
  return gridMode(id).outage;
}

// 黑市电网：每分钟判一次
export const SIPHON_CHECK_SECONDS = 60;
export const SIPHON_RATIO = '0.01';
