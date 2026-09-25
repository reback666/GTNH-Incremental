// 代码绘制的像素图标。
//
// 说明：这个会话里没有可用的图像生成工具（技能要求的内置 image_gen 不在工具集里），
// 所以贴图先用 SVG 方块拼出来：零依赖、可缩放、随时能替换。
// 以后拿到真正的位图贴图，只需把 SpriteIcon 换成 <img>，接口（kind / size）不变。

export type SpriteKind = 'vein' | 'miner' | 'generator' | 'machine' | 'storage' | 'purifier';

export const SPRITE_GRID = 16;

// 调色板：贴近 GTNH 的暗色工业风
export const PALETTE: Record<string, string> = {
  shadow: '#0d1116',
  stone: '#39414d',
  stoneDark: '#2a313b',
  stoneLight: '#4a5563',
  metal: '#8a97a8',
  metalDark: '#5b6675',
  dark: '#20262e',
  ore: '#5ad2c0',
  oreDark: '#2f8f83',
  accent: '#58c4a3',
  warm: '#e0a33e',
  warmDark: '#a06418',
  red: '#d9524f',
  bright: '#cfe6ff',
};

// [x, y, 宽, 高, 颜色]，坐标以 16×16 网格为单位
export type SpriteRect = [number, number, number, number, string];

// 矿脉：碎石堆上立着五块大矿石，像裸露的矿脉（形状与密度由 scripts/vein-options.ts 选定）
const VEIN: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [1, 11, 14, 2, 'stoneDark'],
  [1, 9, 14, 2, 'stone'],
  [1, 9, 14, 1, 'stoneLight'],
  [1, 8, 1, 1, 'stoneDark'],
  [14, 8, 1, 1, 'stoneDark'],
  [2, 3, 3, 1, 'accent'],
  [2, 4, 3, 5, 'ore'],
  [5, 5, 2, 4, 'ore'],
  [7, 2, 4, 1, 'accent'],
  [7, 3, 4, 6, 'ore'],
  [11, 3, 3, 1, 'accent'],
  [11, 4, 3, 5, 'ore'],
  [1, 10, 1, 1, 'oreDark'],
  [14, 10, 1, 1, 'oreDark'],
  [4, 10, 1, 1, 'oreDark'],
  [9, 10, 1, 1, 'oreDark'],
  [2, 12, 3, 1, 'oreDark'],
  [8, 12, 3, 1, 'oreDark'],
  [6, 8, 2, 1, 'oreDark'],
];

// 采矿机：底座 + 立柱 + 钻头
const MINER: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 12, 10, 1, 'metalDark'],
  [4, 10, 8, 2, 'metal'],
  [7, 4, 2, 6, 'metal'],
  [6, 3, 4, 1, 'metalDark'],
  [5, 6, 6, 1, 'metalDark'],
  [8, 8, 1, 1, 'warm'],
  [7, 9, 3, 1, 'bright'],
  [7, 2, 2, 1, 'accent'],
  [4, 11, 2, 1, 'warm'],
  [10, 11, 2, 1, 'warm'],
];

// 发电机：外壳 + 燃烧室窗 + 火花
const GENERATOR: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 3, 10, 10, 'metalDark'],
  [4, 4, 8, 8, 'metal'],
  [4, 5, 8, 1, 'stoneLight'],
  [5, 6, 6, 4, 'dark'],
  [6, 9, 1, 1, 'warm'],
  [7, 8, 1, 1, 'warm'],
  [8, 7, 1, 1, 'warmDark'],
  [9, 6, 1, 1, 'warmDark'],
  [5, 11, 6, 1, 'dark'],
];

// 制造机：外壳 + 齿轮 + 输出标记
const MACHINE: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 3, 10, 10, 'metalDark'],
  [4, 4, 8, 8, 'metal'],
  [4, 11, 8, 1, 'dark'],
  [6, 6, 4, 4, 'stoneLight'],
  [7, 5, 2, 2, 'dark'],
  [7, 9, 2, 2, 'dark'],
  [5, 7, 2, 2, 'dark'],
  [9, 7, 2, 2, 'dark'],
  [7, 7, 2, 2, 'warm'],
  [11, 4, 1, 1, 'accent'],
];

// 存电装置：电池外壳 + 顶部接线柱 + 电量条
const STORAGE: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 3, 10, 11, 'metalDark'],
  [4, 4, 8, 9, 'dark'],
  [7, 2, 2, 1, 'metal'],
  [5, 5, 6, 1, 'stoneLight'],
  [5, 7, 6, 1, 'accent'],
  [5, 9, 6, 1, 'accent'],
  [5, 11, 6, 1, 'warm'],
];

// 净化器：过滤塔 + 出风口的干净气团
const PURIFIER: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 4, 10, 9, 'metalDark'],
  [4, 5, 8, 7, 'metal'],
  [5, 2, 6, 2, 'metalDark'],
  [6, 1, 4, 1, 'accent'],
  [5, 6, 6, 1, 'dark'],
  [5, 8, 6, 1, 'accent'],
  [5, 10, 6, 1, 'accent'],
];

export const SPRITES: Record<SpriteKind, SpriteRect[]> = {
  vein: VEIN,
  miner: MINER,
  generator: GENERATOR,
  machine: MACHINE,
  storage: STORAGE,
  purifier: PURIFIER,
};
