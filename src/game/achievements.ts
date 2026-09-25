import { Decimal, dec } from '../numeric/decimal';

// 成就（计划书第十六章「数据统计」、第二十章第三阶段「加入成就系统与数据统计」）。
//
// 成就不做单独的事件系统：每条只声明一个「看当前累计状态成不成立」的条件，
// 由核心每拍检查一次，第一次成立就记下达成时间。这样加成就只要往表里加一行。
// 累积类状态（最高电压、累计线缆、历史最高污染…）在 GameCore 里单独记账。

export interface AchievementState {
  // 手动挖矿次数
  manualMines: number;
  // 当前机器台数与累计建造台数
  machineCount: number;
  builtMachines: number;
  generatorCount: number;
  minerCount: number;
  // 本周目最高电压 / 历史最高电压
  maxTier: number;
  peakTier: number;
  // 行为类
  overclockUsed: boolean;
  repairs: number;
  gridCount: number;
  // 已研究的等级数（ZPM 及以后）
  researchCount: number;
  rebirthCount: number;
  rebirthNodeCount: number;
  // 存电与污染
  storedEU: Decimal;
  batteryCapacity: Decimal;
  pollution: Decimal;
  maxPollution: Decimal;
  // 累计
  totalCoins: Decimal;
  totalEU: Decimal;
  totalCables: Decimal;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (state: AchievementState) => boolean;
}

const MILLION = dec('1e6');
const BILLION = dec('1e9');
const TRILLION = dec('1e12');

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-swing',
    name: '手挖起步',
    desc: '手动挖矿 10 次',
    check: (state) => state.manualMines >= 10,
  },
  {
    id: 'first-machine',
    name: '第一台机器',
    desc: '建起第一台机器',
    check: (state) => state.builtMachines >= 1,
  },
  {
    id: 'first-power',
    name: '通电',
    desc: '建起第一台发电机',
    check: (state) => state.generatorCount >= 1,
  },
  {
    id: 'first-miner',
    name: '交给机器',
    desc: '建起第一台采矿机',
    check: (state) => state.minerCount >= 1,
  },
  {
    id: 'leave-ulv',
    name: '走出超低压',
    desc: '解锁到 LV',
    check: (state) => state.peakTier >= 2,
  },
  {
    id: 'first-overclock',
    name: '超频一下',
    desc: '给机器开过一次超频',
    check: (state) => state.overclockUsed,
  },
  {
    id: 'first-repair',
    name: '亲手检修',
    desc: '维护过一台故障机器',
    check: (state) => state.repairs >= 1,
  },
  {
    id: 'battery-half',
    name: '存电过夜',
    desc: '存电装置里存着超过半池电',
    check: (state) =>
      state.batteryCapacity.gt(0) && state.storedEU.times(2).gte(state.batteryCapacity),
  },
  {
    id: 'grid-upgrade',
    name: '换电网',
    desc: '解锁一种新电网',
    check: (state) => state.gridCount >= 2,
  },
  {
    id: 'first-research',
    name: '开始研究',
    desc: '研究出第一个等级的机型',
    check: (state) => state.researchCount >= 1,
  },
  {
    id: 'research-wall',
    name: '越过硬墙',
    desc: '研究出 ZPM 级机型',
    check: (state) => state.researchCount >= 1 && state.peakTier >= 8,
  },
  {
    id: 'first-rebirth',
    name: '分叉时间线',
    desc: '完成第一次转生（时空裂缝也算）',
    check: (state) => state.rebirthCount >= 1,
  },
  {
    id: 'first-rebirth-node',
    name: '点亮加成',
    desc: '买下第一个永久加成节点',
    check: (state) => state.rebirthNodeCount >= 1,
  },
  {
    id: 'polluted',
    name: '工厂冒烟',
    desc: '污染值到过 50%',
    check: (state) => state.maxPollution.gte(50),
  },
  {
    id: 'cleaned-up',
    name: '治污成功',
    desc: '污染到过 50% 之后又压回 30% 以下',
    check: (state) => state.maxPollution.gte(50) && state.pollution.lt(30),
  },
  {
    id: 'machine-fleet',
    name: '机器海洋',
    desc: '累计建造 100 台机器',
    check: (state) => state.builtMachines >= 100,
  },
  {
    id: 'rich',
    name: '富甲一方',
    desc: '累计产出 1e12 枚 GT 币',
    check: (state) => state.totalCoins.gte(TRILLION),
  },
  {
    id: 'powerhouse',
    name: '发电大户',
    desc: '累计发电 1e20 EU',
    check: (state) => state.totalEU.gte(dec('1e20')),
  },
  {
    id: 'cable-collector',
    name: '时空常客',
    desc: '累计获得 50 条时空线缆',
    check: (state) => state.totalCables.gte(50),
  },
  {
    id: 'reach-max',
    name: '满级文明',
    desc: '解锁到 MAX',
    check: (state) => state.peakTier >= 14,
  },
];

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}

// 供界面显示：达成了几条
export function achievedCount(achieved: Record<string, number>): number {
  return ACHIEVEMENTS.filter(
    (achievement) => achieved[achievement.id] !== undefined,
  ).length;
}

export { MILLION, BILLION };
