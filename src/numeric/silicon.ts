// 硅基宇宙（计划书第五章）：AI 接管维护、超频与停机调度。
// 三件事各带一个开关，默认全开；AI 有 5% 的误判率，偶尔做错一次，下一拍自己纠正。

export const SILICON_MISJUDGE_CHANCE = 0.05;

// 自动超频的降档线：供电率掉到这以下才降档。
// 升档另有要求（电力得扛得住翻倍），这样不会来回抖。
export const SILICON_DOWNGRADE_RATIO = 0.9;
// 升档要求电力至少是当前需求的这个倍数 —— 升一档耗电翻倍，得留够余量
export const SILICON_UPGRADE_HEADROOM = 2;

// 停电调度时保留机器的优先级（越靠前越优先保住，最后才轮到被停）。
// 发电机不耗电所以不在这里；存电装置只是池子，也不参与。
export const SILICON_KEEP_PRIORITY = [
  'purifier',
  'abyss',
  'miner',
  'machine',
  'research',
  'arcane',
] as const;

export type SiliconKind = (typeof SILICON_KEEP_PRIORITY)[number];
