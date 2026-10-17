import { type MachineKind } from '../core';

export const TIER_ICON_LIMIT = 24;

// 机器面板的标签顺序。购买、统计、显示都走这一份，避免各写一遍漏类别
export const COLUMN_ORDER: MachineKind[] = [
  'miner',
  'generator',
  'arcane',
  'abyss',
  'machine',
  'storage',
  'purifier',
  'research',
];

export const COLUMN_META: Record<MachineKind, { title: string; hint: string }> = {
  miner: { title: '采矿机', hint: '放在矿脉上自动产矿，是整条循环的入口。' },
  generator: { title: '发电机', hint: '烧本级矿石发电。同等级有多种机型，效率高的更贵。' },
  machine: { title: '制造机', hint: '消耗本级矿石与电力，直接产出本级 GT 币。' },
  storage: {
    title: '存电装置',
    hint: '富余电力存进电池；发电不够时先放存量，存量见底才降载停机。',
  },
  purifier: {
    title: '净化器',
    hint: '压污染。重度污染下产出 -40%，还会随机砸掉机器，靠它把污染拉回安全区。',
  },
  research: {
    title: '研究',
    hint: '计算机把电力换成算力，研究站吃掉算力推进研究进度；进度满才解锁 ZPM 及以后的机型。算力是流量，用不掉就浪费。',
  },
  arcane: {
    title: '灵气节点',
    hint: '只有奥术宇宙才能建造。节点从矿脉抽灵气，灵气是流量、不能囤积；源质（净化器压污染时的副产物）能把节点喂满，没有源质时只出一半。',
  },
  abyss: {
    title: '腐蚀抑制器',
    hint: '只有深渊宇宙才能建造。深渊宇宙里污染会把机器啃坏（随机停机、要手动维护），抑制器按等级抵消一部分污染点数，把损坏速率压回去。',
  },
};

