// 代码绘制的像素图标。
//
// 说明：这个会话里没有可用的图像生成工具（技能要求的内置 image_gen 不在工具集里），
// 所以贴图先用 SVG 方块拼出来：零依赖、可缩放、随时能替换。
// 以后拿到真正的位图贴图，只需把 SpriteIcon 换成 <img>，接口（kind / size）不变。

export type SpriteKind =
  | 'vein'
  | 'miner'
  | 'generator'
  | 'machine'
  | 'storage'
  | 'purifier'
  | 'research'
  | 'arcane'
  | 'abyss';
// 成就配图用的一组：讲不清是哪种机器的东西（超频、维修、电网、污染、币、时间…）
export type AchievementSpriteKind =
  | 'overclock'
  | 'wrench'
  | 'grid'
  | 'lightning'
  | 'pollution'
  | 'coin'
  | 'clock'
  | 'cable'
  | 'star'
  | 'universe'
  | 'atom'
  | 'furnace'
  | 'thief'
  | 'essentia';

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

// 研究：机箱 + 屏幕 + 键盘，屏幕上是滚动的数据行
const RESEARCH: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 2, 10, 10, 'metalDark'],
  [4, 3, 8, 6, 'dark'],
  [5, 4, 6, 1, 'ore'],
  [5, 5, 4, 1, 'accent'],
  [5, 6, 5, 1, 'oreDark'],
  [5, 7, 3, 1, 'ore'],
  [11, 3, 1, 1, 'warm'],
  [3, 12, 10, 1, 'metal'],
  [5, 12, 6, 1, 'stoneLight'],
];

// 灵气：底座 + 悬浮的灵气结晶
const ARCANE: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [4, 11, 8, 2, 'metalDark'],
  [6, 9, 4, 2, 'metal'],
  [7, 3, 2, 3, 'accent'],
  [6, 4, 4, 4, 'ore'],
  [5, 6, 6, 3, 'oreDark'],
  [7, 6, 2, 2, 'bright'],
  [6, 2, 1, 1, 'bright'],
  [9, 3, 1, 1, 'bright'],
  [5, 8, 1, 1, 'accent'],
  [10, 8, 1, 1, 'accent'],
];

// 腐蚀抑制器：带铆钉的护盾板
const ABYSS: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 3, 10, 10, 'metalDark'],
  [4, 4, 8, 8, 'metal'],
  [5, 5, 6, 6, 'dark'],
  [6, 6, 4, 4, 'oreDark'],
  [7, 7, 2, 2, 'accent'],
  [4, 4, 1, 1, 'bright'],
  [11, 4, 1, 1, 'bright'],
  [4, 11, 1, 1, 'bright'],
  [11, 11, 1, 1, 'bright'],
];

export const SPRITES: Record<SpriteKind, SpriteRect[]> = {
  vein: VEIN,
  miner: MINER,
  generator: GENERATOR,
  machine: MACHINE,
  storage: STORAGE,
  purifier: PURIFIER,
  research: RESEARCH,
  arcane: ARCANE,
  abyss: ABYSS,
};

// 超频：齿轮 + 两粒火花
const OVERCLOCK: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [6, 2, 4, 1, 'metalDark'],
  [5, 3, 6, 1, 'metalDark'],
  [4, 4, 8, 7, 'metalDark'],
  [5, 11, 6, 1, 'metalDark'],
  [6, 12, 4, 1, 'metalDark'],
  [5, 5, 6, 5, 'metal'],
  [6, 6, 4, 1, 'stoneLight'],
  [6, 7, 4, 2, 'warm'],
  [7, 7, 2, 2, 'bright'],
  [12, 2, 2, 2, 'warm'],
  [14, 5, 1, 1, 'warm'],
];

// 维修：扳手（头在右上，柄斜到左下）
const WRENCH: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [10, 2, 3, 1, 'metal'],
  [9, 3, 5, 1, 'metal'],
  [9, 4, 1, 2, 'metal'],
  [13, 4, 1, 2, 'metal'],
  [10, 4, 3, 1, 'metalDark'],
  [3, 10, 2, 2, 'metalDark'],
  [5, 9, 2, 2, 'metal'],
  [7, 8, 2, 2, 'metal'],
  [9, 7, 2, 2, 'metal'],
  [4, 11, 1, 1, 'metalDark'],
];

// 电网：输电塔 + 电火花
const GRID: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [2, 11, 12, 1, 'metalDark'],
  [7, 4, 2, 7, 'metal'],
  [3, 3, 10, 1, 'metalDark'],
  [4, 6, 8, 1, 'metalDark'],
  [3, 9, 10, 1, 'metalDark'],
  [2, 1, 2, 1, 'warm'],
  [7, 1, 2, 1, 'bright'],
  [12, 1, 2, 1, 'warm'],
  [5, 12, 6, 1, 'accent'],
];

// 闪电：一整条折线
const LIGHTNING: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [8, 2, 4, 1, 'warm'],
  [7, 3, 4, 2, 'warm'],
  [6, 5, 4, 2, 'bright'],
  [8, 7, 5, 1, 'warm'],
  [7, 8, 4, 2, 'warm'],
  [6, 10, 4, 2, 'warmDark'],
  [5, 12, 3, 1, 'warmDark'],
];

// 污染：烟囱往外吐烟
const POLLUTION: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 7, 4, 6, 'metalDark'],
  [4, 8, 2, 5, 'metal'],
  [3, 6, 4, 1, 'metal'],
  [8, 3, 3, 1, 'stoneDark'],
  [10, 4, 3, 1, 'stoneDark'],
  [8, 5, 4, 1, 'stoneDark'],
  [11, 6, 3, 1, 'stoneDark'],
  [12, 7, 3, 1, 'stoneDark'],
  [4, 11, 2, 1, 'warm'],
  [6, 12, 1, 1, 'red'],
];

// 币：一摞 GT 币
const COIN: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [5, 3, 6, 1, 'warmDark'],
  [4, 4, 8, 1, 'warm'],
  [5, 5, 6, 1, 'warmDark'],
  [4, 6, 8, 1, 'warm'],
  [5, 7, 6, 1, 'warmDark'],
  [4, 8, 8, 1, 'warm'],
  [5, 9, 6, 1, 'warmDark'],
  [4, 10, 8, 1, 'warm'],
  [7, 4, 2, 1, 'bright'],
  [7, 8, 2, 1, 'bright'],
  [6, 11, 4, 1, 'warmDark'],
];

// 时间：一块表
const CLOCK: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 3, 10, 10, 'metalDark'],
  [4, 4, 8, 8, 'dark'],
  [7, 4, 2, 5, 'bright'],
  [8, 7, 5, 2, 'bright'],
  [7, 7, 2, 2, 'accent'],
  [3, 3, 1, 1, 'metal'],
  [12, 3, 1, 1, 'metal'],
  [3, 12, 1, 1, 'metal'],
  [12, 12, 1, 1, 'metal'],
];

// 时空线缆：一根两头带接头的线
const CABLE: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [1, 4, 3, 4, 'metalDark'],
  [12, 4, 3, 4, 'metalDark'],
  [2, 5, 12, 1, 'ore'],
  [2, 6, 12, 1, 'accent'],
  [3, 7, 10, 1, 'oreDark'],
  [1, 5, 1, 1, 'metal'],
  [14, 5, 1, 1, 'metal'],
  [6, 4, 1, 1, 'bright'],
  [10, 8, 1, 1, 'bright'],
];

// 加成节点：一颗四角星
const STAR: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [7, 2, 2, 2, 'bright'],
  [5, 4, 6, 2, 'ore'],
  [2, 6, 12, 3, 'ore'],
  [5, 9, 6, 2, 'ore'],
  [7, 11, 2, 2, 'oreDark'],
  [6, 6, 4, 2, 'bright'],
];

// 平行宇宙：一颗带光环的星球
const UNIVERSE: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [6, 3, 4, 1, 'accent'],
  [5, 4, 6, 6, 'ore'],
  [7, 6, 2, 2, 'bright'],
  [6, 8, 4, 2, 'oreDark'],
  [2, 9, 12, 1, 'metal'],
  [1, 8, 2, 1, 'metalDark'],
  [13, 10, 2, 1, 'metalDark'],
];

// 普朗克 / 量子：原子
const ATOM: SpriteRect[] = [
  [2, 12, 12, 1, 'shadow'],
  [3, 5, 10, 1, 'accent'],
  [4, 4, 2, 1, 'accent'],
  [10, 4, 2, 1, 'accent'],
  [3, 10, 10, 1, 'accent'],
  [4, 11, 2, 1, 'accent'],
  [10, 11, 2, 1, 'accent'],
  [6, 2, 4, 1, 'oreDark'],
  [6, 13, 4, 1, 'oreDark'],
  [7, 7, 2, 2, 'bright'],
];

// 烧矿发电：炉子里的火
const FURNACE: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [3, 2, 10, 1, 'metalDark'],
  [3, 3, 10, 10, 'metalDark'],
  [4, 4, 8, 8, 'stoneDark'],
  [4, 4, 8, 1, 'stoneLight'],
  [6, 7, 4, 4, 'dark'],
  [7, 8, 2, 2, 'warm'],
  [5, 11, 1, 1, 'warmDark'],
  [10, 11, 1, 1, 'warmDark'],
];

// 被薅：钱包里飞走一枚币
const THIEF: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [2, 8, 8, 5, 'metalDark'],
  [3, 9, 6, 3, 'metal'],
  [2, 7, 8, 1, 'stoneLight'],
  [4, 9, 1, 1, 'dark'],
  [5, 9, 1, 1, 'dark'],
  [12, 3, 2, 2, 'warm'],
  [11, 5, 1, 1, 'warmDark'],
  [9, 4, 2, 1, 'bright'],
];

// 源质：一瓶发光的液体
const ESSENTIA: SpriteRect[] = [
  [2, 13, 12, 1, 'shadow'],
  [6, 2, 4, 1, 'metal'],
  [6, 3, 4, 1, 'metalDark'],
  [5, 4, 6, 1, 'metal'],
  [5, 5, 6, 7, 'oreDark'],
  [6, 6, 4, 5, 'ore'],
  [7, 7, 2, 3, 'bright'],
  [5, 12, 6, 1, 'metalDark'],
];

// 成就配图用的一组：讲不清是哪种机器的东西
export const ACHIEVEMENT_SPRITES: Record<AchievementSpriteKind, SpriteRect[]> = {
  overclock: OVERCLOCK,
  wrench: WRENCH,
  grid: GRID,
  lightning: LIGHTNING,
  pollution: POLLUTION,
  coin: COIN,
  clock: CLOCK,
  cable: CABLE,
  star: STAR,
  universe: UNIVERSE,
  atom: ATOM,
  furnace: FURNACE,
  thief: THIEF,
  essentia: ESSENTIA,
};
