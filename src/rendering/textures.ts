// 程序化像素贴图（CanvasTexture）：机壳侧板、顶部格栅、地台钢板、混凝土地面、
// 安全黄斜纹、铜缆、青绿管道、GT 框架。全部 32px 级像素风，Nearest 采样。
// 不加载任何外部资源；由 TextureCache 统一持有和释放。
import {
  CanvasTexture,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { COLORS, voltageColor } from './palette';

type Painter = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

/** 底色 + 每像素轻微噪点（金属磨砂感） */
function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, amp: number, rand: () => number) {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      ctx.fillStyle = shade(base, (rand() - 0.5) * amp);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function rivet(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#9aa3ab';
  ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = '#0e1012';
  ctx.fillRect(x + 1, y + 1, 1, 1);
}

function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, dark: string) {
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = dark;
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
}

/** 机壳侧板：深炭底、双层倒角、四角铆钉、中部通风百叶、顶边电压色条 */
function paintSide(tier: number): Painter {
  return (ctx, s, rand) => {
    noiseFill(ctx, s, s, COLORS.charcoal, 0.05, rand);
    bevel(ctx, 0, 0, s, s, '#4b5157', '#0c0d0e');
    bevel(ctx, 2, 2, s - 4, s - 4, '#121416', '#3a3f44');
    ctx.fillStyle = voltageColor(tier);
    ctx.fillRect(3, 3, s - 6, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(3, 5, s - 6, 1);
    for (let i = 0; i < 5; i += 1) {
      const y = 11 + i * 3;
      ctx.fillStyle = '#0b0c0d';
      ctx.fillRect(8, y, s - 16, 1);
      ctx.fillStyle = '#50575d';
      ctx.fillRect(8, y + 1, s - 16, 1);
    }
    rivet(ctx, 3, 7);
    rivet(ctx, s - 5, 7);
    rivet(ctx, 3, s - 5);
    rivet(ctx, s - 5, s - 5);
    // 铜色接线端子
    ctx.fillStyle = COLORS.copper;
    ctx.fillRect(s / 2 - 2, s - 6, 4, 2);
  };
}

/** 机器顶面：散热格栅 + 外框 */
function paintTop(tier: number): Painter {
  return (ctx, s, rand) => {
    noiseFill(ctx, s, s, '#2f3337', 0.05, rand);
    bevel(ctx, 0, 0, s, s, '#555c62', '#0c0d0e');
    ctx.fillStyle = '#0d0f10';
    ctx.fillRect(6, 6, s - 12, s - 12);
    for (let y = 7; y < s - 7; y += 2) {
      ctx.fillStyle = '#3c4247';
      ctx.fillRect(7, y, s - 14, 1);
    }
    ctx.fillStyle = voltageColor(tier);
    ctx.fillRect(1, 1, 3, 3);
    ctx.fillRect(s - 4, s - 4, 3, 3);
    rivet(ctx, s - 5, 2);
    rivet(ctx, 2, s - 5);
  };
}

/** 多方块机壳（如 GT 的坚固机械方块）：大面板 + 安全黄斜角 */
function paintCasing(tier: number): Painter {
  return (ctx, s, rand) => {
    noiseFill(ctx, s, s, '#3a3e42', 0.06, rand);
    bevel(ctx, 0, 0, s, s, '#6b737a', '#121416');
    bevel(ctx, 4, 4, s - 8, s - 8, '#1b1d1f', '#5b6268');
    ctx.fillStyle = '#2a2d30';
    ctx.fillRect(5, 5, s - 10, s - 10);
    ctx.fillStyle = shade(voltageColor(tier), -0.1);
    ctx.fillRect(s / 2 - 3, s / 2 - 3, 6, 6);
    ctx.fillStyle = '#101214';
    ctx.fillRect(s / 2 - 2, s / 2 - 2, 4, 4);
    rivet(ctx, 1, 1);
    rivet(ctx, s - 3, 1);
    rivet(ctx, 1, s - 3);
    rivet(ctx, s - 3, s - 3);
  };
}

/** 地台钢板（菱形防滑纹） */
const paintPlate: Painter = (ctx, s, rand) => {
  noiseFill(ctx, s, s, '#3d4246', 0.05, rand);
  for (let y = 2; y < s; y += 6) {
    for (let x = (y / 6) % 2 === 0 ? 2 : 5; x < s; x += 6) {
      ctx.fillStyle = '#5a6167';
      ctx.fillRect(x, y, 2, 1);
      ctx.fillStyle = '#25292c';
      ctx.fillRect(x, y + 1, 2, 1);
    }
  }
  bevel(ctx, 0, 0, s, s, '#555b61', '#1d2023');
};

/** 机位格栅 */
const paintGrate: Painter = (ctx, s, rand) => {
  noiseFill(ctx, s, s, '#1a1c1e', 0.04, rand);
  for (let i = 1; i < s; i += 4) {
    ctx.fillStyle = '#464c52';
    ctx.fillRect(i, 0, 1, s);
    ctx.fillRect(0, i, s, 1);
  }
  bevel(ctx, 0, 0, s, s, '#60676d', '#0c0d0e');
};

/** 混凝土地面：大块缝 + 斑驳 */
const paintConcrete: Painter = (ctx, s, rand) => {
  noiseFill(ctx, s, s, COLORS.ground, 0.07, rand);
  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(Math.floor(rand() * s), Math.floor(rand() * s), 1 + Math.floor(rand() * 3), 1);
  }
  ctx.fillStyle = '#1f2224';
  ctx.fillRect(0, 0, s, 1);
  ctx.fillRect(0, 0, 1, s);
};

/** 安全黄黑斜纹 */
const paintHazard: Painter = (ctx, s) => {
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      ctx.fillStyle = Math.floor((x + y) / 4) % 2 === 0 ? COLORS.hazard : '#1a1a1a';
      ctx.fillRect(x, y, 1, 1);
    }
  }
};

/** 铜缆：铜芯 + 绝缘橡胶纹 */
const paintCable: Painter = (ctx, s, rand) => {
  noiseFill(ctx, s, s, '#2a2420', 0.05, rand);
  ctx.fillStyle = COLORS.copper;
  ctx.fillRect(0, s / 2 - 3, s, 6);
  ctx.fillStyle = '#e39a5c';
  ctx.fillRect(0, s / 2 - 2, s, 1);
  for (let x = 0; x < s; x += 8) {
    ctx.fillStyle = '#141210';
    ctx.fillRect(x, 0, 2, s);
  }
};

/** 青绿流体管道：环箍 + 高光 */
const paintPipe: Painter = (ctx, s, rand) => {
  noiseFill(ctx, s, s, COLORS.tealDark, 0.06, rand);
  ctx.fillStyle = COLORS.teal;
  ctx.fillRect(0, 4, s, 3);
  ctx.fillStyle = '#7fe8da';
  ctx.fillRect(0, 5, s, 1);
  for (let x = 0; x < s; x += 16) {
    ctx.fillStyle = '#5d646b';
    ctx.fillRect(x, 0, 3, s);
    ctx.fillStyle = '#2b2f33';
    ctx.fillRect(x + 3, 0, 1, s);
  }
};

/** GT 框架方块：钢骨架，中心镂空（alphaTest） */
const paintFrame: Painter = (ctx, s) => {
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#6f777e';
  ctx.fillRect(0, 0, s, 3);
  ctx.fillRect(0, s - 3, s, 3);
  ctx.fillRect(0, 0, 3, s);
  ctx.fillRect(s - 3, 0, 3, s);
  for (let i = 0; i < s; i += 1) {
    ctx.fillRect(i, i, 2, 1);
    ctx.fillRect(s - 1 - i, i, 2, 1);
  }
  ctx.fillStyle = '#3a3f44';
  ctx.fillRect(0, 2, s, 1);
  ctx.fillRect(2, 0, 1, s);
};

/** 石头（矿坑壁） */
const paintStone: Painter = (ctx, s, rand) => {
  noiseFill(ctx, s, s, '#5b5f63', 0.14, rand);
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(Math.floor(rand() * s), Math.floor(rand() * s), 2, 1);
  }
};

/** 灯罩条纹（工业灯） */
const paintLamp: Painter = (ctx, s) => {
  ctx.fillStyle = '#ffd27a';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#ffb43a';
  for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1);
  bevel(ctx, 0, 0, s, s, '#fff0c8', '#a8641a');
};

function toTexture(canvas: HTMLCanvasElement, repeat: boolean): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  return texture;
}

export type TextureName =
  | 'plate'
  | 'grate'
  | 'concrete'
  | 'hazard'
  | 'cable'
  | 'pipe'
  | 'frame'
  | 'stone'
  | 'lamp';

const PAINTERS: Record<TextureName, Painter> = {
  plate: paintPlate,
  grate: paintGrate,
  concrete: paintConcrete,
  hazard: paintHazard,
  cable: paintCable,
  pipe: paintPipe,
  frame: paintFrame,
  stone: paintStone,
  lamp: paintLamp,
};

/** 统一持有程序化贴图与文字贴图；dispose() 一次释放全部 */
export class TextureCache {
  private readonly map = new Map<string, Texture>();

  private paint(key: string, painter: Painter, seed: number, repeat: boolean, size = 32): Texture {
    const cached = this.map.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) painter(ctx, size, mulberry32(seed));
    const texture = toTexture(canvas, repeat);
    this.map.set(key, texture);
    return texture;
  }

  get(name: TextureName): Texture {
    return this.paint(name, PAINTERS[name], name.length * 7919, true);
  }

  side(tier: number): Texture {
    return this.paint(`side:${tier}`, paintSide(tier), tier * 31, false);
  }

  top(tier: number): Texture {
    return this.paint(`top:${tier}`, paintTop(tier), tier * 57, false);
  }

  casing(tier: number): Texture {
    return this.paint(`casing:${tier}`, paintCasing(tier), tier * 83, true);
  }

  /** 地面文字牌（中文用系统字体，不引入外部字体） */
  label(text: string, color: string): Texture {
    const key = `label:${text}:${color}`;
    const cached = this.map.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(16,18,20,0.9)';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = COLORS.hazard;
      ctx.fillRect(0, 0, 8, 64);
      ctx.fillStyle = color;
      ctx.font = 'bold 34px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 22, 34, 224);
    }
    const texture = toTexture(canvas, false);
    texture.minFilter = 1006 /* LinearFilter */;
    texture.magFilter = 1006;
    this.map.set(key, texture);
    return texture;
  }

  /** 外部加载的贴图（机型正面、矿脉）也交给缓存统一释放 */
  adopt(key: string, texture: Texture): void {
    const old = this.map.get(key);
    if (old && old !== texture) old.dispose();
    this.map.set(key, texture);
  }

  peek(key: string): Texture | undefined {
    return this.map.get(key);
  }

  dispose(): void {
    for (const texture of this.map.values()) texture.dispose();
    this.map.clear();
  }
}
