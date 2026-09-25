// 电网模式（计划书第六章）：玩家自己选的风险杠杆。
//
//   稳定电网：耗电 +20%，不出事
//   波动电网：耗电 -30%，每 5 分钟有 15% 概率断电 10 秒（机器全停）
//   黑市电网：耗电 -50%，但每分钟随机被窃取一种 GT 币的 1%
import { Decimal, dec } from './decimal';

export type GridMode = 'stable' | 'volatile' | 'black';

export interface GridModeInfo {
  id: GridMode;
  name: string;
  // 耗电倍率
  energyMultiplier: string;
  summary: string;
}

export const GRID_MODES: GridModeInfo[] = [
  {
    id: 'stable',
    name: '稳定电网',
    energyMultiplier: '1.2',
    summary: '耗电 +20%，不会断电、不会被偷钱',
  },
  {
    id: 'volatile',
    name: '波动电网',
    energyMultiplier: '0.7',
    summary: '耗电 -30%，每 5 分钟有 15% 概率断电 10 秒',
  },
  {
    id: 'black',
    name: '黑市电网',
    energyMultiplier: '0.5',
    summary: '耗电 -50%，每分钟随机被窃取一种 GT 币的 1%',
  },
];

export const DEFAULT_GRID: GridMode = 'stable';

export function gridMode(id: GridMode): GridModeInfo {
  return GRID_MODES.find((mode) => mode.id === id) ?? GRID_MODES[0]!;
}

export function gridEnergyMultiplier(id: GridMode): Decimal {
  return dec(gridMode(id).energyMultiplier);
}

// 波动电网：每 5 分钟判一次
export const OUTAGE_CHECK_SECONDS = 300;
export const OUTAGE_CHANCE = 0.15;
export const OUTAGE_SECONDS = 10;

// 黑市电网：每分钟判一次
export const SIPHON_CHECK_SECONDS = 60;
export const SIPHON_RATIO = '0.01';
