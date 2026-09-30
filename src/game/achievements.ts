import { Decimal, dec } from '../numeric/decimal';
import type { PickaxeLine } from '../numeric/pickaxe';
import type { AchievementSpriteKind } from './sprites';

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
  // 已研究出来的机型数（ZPM 及以后每个机型单独研究）
  researchCount: number;
  // 有没有研究出 ZPM 那一级的机型
  researchedZpm: boolean;
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
  // 游戏内时长（秒）
  playSeconds: number;
  // 累计矿石 / 累计烧掉的矿石（矿石在这里既是材料也是燃料）
  totalOre: Decimal;
  totalOreSpent: Decimal;
  // 被黑市电网薅走的币（按币值折算）
  siphoned: Decimal;
  // 手里的最高一级 GT 币（0 = 一枚都还没有）
  topCoinTier: number;
  // 已拥有的平行宇宙数量
  universeCount: number;
  // 当前最高的超频档位（0-3）
  topOverclock: number;
  // 镐子三条线的等级
  pickaxeVajra: number;
  pickaxeCollect: number;
  pickaxeBlast: number;
  // 已研究机型数 / ZPM 及以后需要研究的机型总数
  researchedTotal: number;
  researchTotal: number;
  // 奥术宇宙的源质存量
  essentia: Decimal;
  // 几类「有名有姓」的机器台数：成就直接读它们
  specials: {
    steam: number;
    plasma: number;
    dyson: number;
    blackhole: number;
    multiblock: number;
    arcane: number;
    suppressor: number;
  };
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  // 配图：优先用游戏里已有的贴图（机型 / 矿脉 / 镐子），讲不清是什么机器的用代码画的像素图标
  icon: AchievementIcon;
  check: (state: AchievementState) => boolean;
}

export type AchievementIcon =
  | { kind: 'model'; id: string }
  | { kind: 'vein'; tier: number }
  | { kind: 'pickaxe'; line: PickaxeLine; tier: number }
  | { kind: 'sprite'; sprite: AchievementSpriteKind };

const MILLION = dec('1e6');
const BILLION = dec('1e9');
const TRILLION = dec('1e12');

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-swing',
    name: '手挖起步',
    desc: '手动挖矿 10 次',
    icon: { kind: 'pickaxe', line: 'vajra', tier: 1 },
    check: (state) => state.manualMines >= 10,
  },
  {
    id: 'first-machine',
    name: '第一台机器',
    desc: '建起第一台机器',
    icon: { kind: 'model', id: 'c-1' },
    check: (state) => state.builtMachines >= 1,
  },
  {
    id: 'first-power',
    name: '通电',
    desc: '建起第一台发电机',
    icon: { kind: 'model', id: 'g-ulv' },
    check: (state) => state.generatorCount >= 1,
  },
  {
    id: 'first-miner',
    name: '交给机器',
    desc: '建起第一台采矿机',
    icon: { kind: 'model', id: 'm-1' },
    check: (state) => state.minerCount >= 1,
  },
  {
    id: 'leave-ulv',
    name: '走出超低压',
    desc: '解锁到 LV',
    icon: { kind: 'vein', tier: 1 },
    check: (state) => state.peakTier >= 2,
  },
  {
    id: 'first-overclock',
    name: '超频一下',
    desc: '给机器开过一次超频',
    icon: { kind: 'sprite', sprite: 'overclock' },
    check: (state) => state.overclockUsed,
  },
  {
    id: 'first-repair',
    name: '亲手检修',
    desc: '维护过一台故障机器',
    icon: { kind: 'sprite', sprite: 'wrench' },
    check: (state) => state.repairs >= 1,
  },
  {
    id: 'battery-half',
    name: '存电过夜',
    desc: '存电装置里存着超过半池电',
    icon: { kind: 'model', id: 'b-3' },
    check: (state) =>
      state.batteryCapacity.gt(0) && state.storedEU.times(2).gte(state.batteryCapacity),
  },
  {
    id: 'grid-upgrade',
    name: '换电网',
    desc: '解锁一种新电网',
    icon: { kind: 'sprite', sprite: 'grid' },
    check: (state) => state.gridCount >= 2,
  },
  {
    id: 'first-research',
    name: '开始研究',
    desc: '研究出第一台机型',
    icon: { kind: 'model', id: 'x-7' },
    check: (state) => state.researchCount >= 1,
  },
  {
    id: 'research-wall',
    name: '越过硬墙',
    desc: '研究出 ZPM 级机型',
    icon: { kind: 'model', id: 'r-7' },
    check: (state) => state.researchedZpm && state.peakTier >= 8,
  },
  {
    id: 'first-rebirth',
    name: '分叉时间线',
    desc: '完成第一次转生（时空裂缝也算）',
    icon: { kind: 'sprite', sprite: 'cable' },
    check: (state) => state.rebirthCount >= 1,
  },
  {
    id: 'first-rebirth-node',
    name: '点亮加成',
    desc: '买下第一个永久加成节点',
    icon: { kind: 'sprite', sprite: 'star' },
    check: (state) => state.rebirthNodeCount >= 1,
  },
  {
    id: 'polluted',
    name: '工厂冒烟',
    desc: '污染值到过 50%',
    icon: { kind: 'sprite', sprite: 'pollution' },
    check: (state) => state.maxPollution.gte(50),
  },
  {
    id: 'cleaned-up',
    name: '治污成功',
    desc: '污染到过 50% 之后又压回 30% 以下',
    icon: { kind: 'model', id: 'p-3' },
    check: (state) => state.maxPollution.gte(50) && state.pollution.lt(30),
  },
  {
    id: 'machine-fleet',
    name: '机器海洋',
    desc: '累计建造 100 台机器',
    icon: { kind: 'model', id: 'g-hv-mb-steam' },
    check: (state) => state.builtMachines >= 100,
  },
  {
    id: 'rich',
    name: '富甲一方',
    desc: '累计产出 1e12 枚 GT 币',
    icon: { kind: 'sprite', sprite: 'coin' },
    check: (state) => state.totalCoins.gte(TRILLION),
  },
  {
    id: 'powerhouse',
    name: '发电大户',
    desc: '累计发电 1e20 EU',
    icon: { kind: 'model', id: 'g-iv-plasma' },
    check: (state) => state.totalEU.gte(dec('1e20')),
  },
  {
    id: 'cable-collector',
    name: '时空常客',
    desc: '累计获得 50 条时空线缆',
    icon: { kind: 'vein', tier: 13 },
    check: (state) => state.totalCables.gte(50),
  },
  {
    id: 'reach-max',
    name: '满级文明',
    desc: '解锁到 MAX',
    icon: { kind: 'model', id: 'g-max-mb-blackhole' },
    check: (state) => state.peakTier >= 14,
  },

  // ── 下面这批按 GTNH 的趣事与轶事来写：每一件都是老玩家会心一笑的东西 ──
  {
    id: 'hand-drill-1000',
    name: '人形采矿机',
    desc: '手动挖矿 1000 次：前期的你比机器还勤快',
    icon: { kind: 'pickaxe', line: 'vajra', tier: 7 },
    check: (state) => state.manualMines >= 1000,
  },
  {
    id: 'furnace-age',
    name: '烧矿发电',
    desc: '累计烧掉 1e6 枚矿石当燃料 —— 在这里矿石既是材料也是燃料',
    icon: { kind: 'sprite', sprite: 'furnace' },
    check: (state) => state.totalOreSpent.gte(MILLION),
  },
  {
    id: 'steam-punk',
    name: '蒸汽朋克',
    desc: '造一台蒸汽轮机：GTNH 最早的那批机器就靠它转',
    icon: { kind: 'model', id: 'g-lv-steam' },
    check: (state) => state.specials.steam >= 1,
  },
  {
    id: 'multiblock-first',
    name: '多方块主义者',
    desc: '造出第一台多方块机器 —— 大就是好',
    icon: { kind: 'model', id: 'g-hv-mb-steam' },
    check: (state) => state.specials.multiblock >= 1,
  },
  {
    id: 'multiblock-fleet',
    name: '钢铁巨兽',
    desc: '同时拥有 10 台多方块机器',
    icon: { kind: 'model', id: 'g-iv-mb-steam' },
    check: (state) => state.specials.multiblock >= 10,
  },
  {
    id: 'plasma-sun',
    name: '人造太阳',
    desc: '造一台等离子发电机 —— 把恒星塞进机箱里',
    icon: { kind: 'model', id: 'g-ev-plasma' },
    check: (state) => state.specials.plasma >= 1,
  },
  {
    id: 'dyson-cloud',
    name: '把云铺到天上',
    desc: '造一台戴森云地面单元：从地面往天上搬能量',
    icon: { kind: 'model', id: 'g-uiv-mb-dyson' },
    check: (state) => state.specials.dyson >= 1,
  },
  {
    id: 'blackhole-feeder',
    name: '往黑洞里塞料',
    desc: '造一台黑洞发电机 —— 后期机器的招牌玩法',
    icon: { kind: 'model', id: 'g-max-mb-blackhole' },
    check: (state) => state.specials.blackhole >= 1,
  },
  {
    id: 'naquadah-age',
    name: '硅岩时代',
    desc: '拿到第一枚硅岩币：后期的硬通货',
    icon: { kind: 'vein', tier: 7 },
    check: (state) => state.topCoinTier >= 7,
  },
  {
    id: 'infinity-start',
    name: '无尽的开端',
    desc: '拿到第一枚无尽币 —— 「无尽」是这里的终极材料之一',
    icon: { kind: 'vein', tier: 10 },
    check: (state) => state.topCoinTier >= 10,
  },
  {
    id: 'planck-hand',
    name: '普朗克在手',
    desc: '拿到第一枚普朗克币：这是 MAX 级的东西',
    icon: { kind: 'sprite', sprite: 'atom' },
    check: (state) => state.topCoinTier >= 14,
  },
  {
    id: 'all-grids',
    name: '电网全制霸',
    desc: '四种电网全部解锁：从偷电的黑市到稳压的稳定电网',
    icon: { kind: 'sprite', sprite: 'lightning' },
    check: (state) => state.gridCount >= 4,
  },
  {
    id: 'universe-collector',
    name: '四宇宙',
    desc: '四种平行宇宙全部带上 —— 每一条规则都在为你打工',
    icon: { kind: 'sprite', sprite: 'universe' },
    check: (state) => state.universeCount >= 4,
  },
  {
    id: 'overclock-max',
    name: '拉满超频',
    desc: '把机器开到 3 档：又快、又费电、又容易坏',
    icon: { kind: 'sprite', sprite: 'overclock' },
    check: (state) => state.topOverclock >= 3,
  },
  {
    id: 'battery-full',
    name: '满池',
    desc: '把存电装置装满一池',
    icon: { kind: 'model', id: 'b-7' },
    check: (state) =>
      state.batteryCapacity.gt(0) && state.storedEU.gte(state.batteryCapacity),
  },
  {
    id: 'arcane-factory',
    name: '魔法工厂',
    desc: '同时拥有 10 台魔法机器：不接电网，改吃灵气',
    icon: { kind: 'model', id: 'mm-2' },
    check: (state) => state.specials.arcane >= 10,
  },
  {
    id: 'essentia-hoard',
    name: '源质富余',
    desc: '源质存到 1e6 —— 净化器压出来的副产品够养一整片节点',
    icon: { kind: 'sprite', sprite: 'essentia' },
    check: (state) => state.essentia.gte(MILLION),
  },
  {
    id: 'suppression-crew',
    name: '抑制器班底',
    desc: '同时拥有 5 台腐蚀抑制器：让污染只当燃料，别啃机器',
    icon: { kind: 'model', id: 's-2' },
    check: (state) => state.specials.suppressor >= 5,
  },
  {
    id: 'siphoned-victim',
    name: '被薅了一把',
    desc: '黑市电网偷走 1e6 枚币 —— 便宜是有代价的',
    icon: { kind: 'sprite', sprite: 'thief' },
    check: (state) => state.siphoned.gte(MILLION),
  },
  {
    id: 'pollution-100',
    name: '百毒不侵',
    desc: '污染拉满到 100%：树都死了，机器还在跑',
    icon: { kind: 'sprite', sprite: 'pollution' },
    check: (state) => state.maxPollution.gte(100),
  },
  {
    id: 'miner-king',
    name: '矿工之王',
    desc: '累计挖到 1e12 枚矿石',
    icon: { kind: 'pickaxe', line: 'collect', tier: 14 },
    check: (state) => state.totalOre.gte(TRILLION),
  },
  {
    id: 'repair-crew',
    name: '维修班',
    desc: '累计维护 100 台机器（手动与 AI 都算）',
    icon: { kind: 'sprite', sprite: 'wrench' },
    check: (state) => state.repairs >= 100,
  },
  {
    id: 'long-run',
    name: '通宵玩家',
    desc: '游戏内时长到 10 小时 —— GTNH 的通关时间是以百小时计的',
    icon: { kind: 'sprite', sprite: 'clock' },
    check: (state) => state.playSeconds >= 10 * 3600,
  },
  {
    id: 'pickaxe-graduated',
    name: '镐子毕业',
    desc: '金刚杵（13）、连锁采集（7）、连锁爆破（28）三条线全部点满',
    icon: { kind: 'pickaxe', line: 'blast', tier: 14 },
    check: (state) =>
      state.pickaxeVajra >= 13 && state.pickaxeCollect >= 7 && state.pickaxeBlast >= 28,
  },
  {
    id: 'research-cleared',
    name: '研究清零',
    desc: 'ZPM 及以后的机型全部研究完',
    icon: { kind: 'model', id: 'x-14' },
    check: (state) => state.researchTotal > 0 && state.researchedTotal >= state.researchTotal,
  },
  {
    id: 'tree-full',
    name: '加成树点满',
    desc: '15 个永久加成节点全部买下',
    icon: { kind: 'sprite', sprite: 'star' },
    check: (state) => state.rebirthNodeCount >= 15,
  },
  {
    id: 'rebirth-ten',
    name: '十周目',
    desc: '转生 10 次：时间线都分叉成一片森林了',
    icon: { kind: 'sprite', sprite: 'cable' },
    check: (state) => state.rebirthCount >= 10,
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
