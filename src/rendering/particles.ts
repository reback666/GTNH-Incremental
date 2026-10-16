// 共享 GPU 粒子池：BufferGeometry + Points，固定容量的环形缓冲。
// 粒子轨迹全在顶点着色器里按「出生时刻 + 初速度 + 重力」解析求值，
// CPU 只在发射时写一小段 attribute（addUpdateRange），每帧只改一个 uniform。
// 基地场景（世界坐标）与全屏特效（ParticleOverlay，CSS 像素坐标）共用这一份实现。
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  type Blending,
} from 'three';

export interface ParticleBurst {
  /** 发射中心 */
  x: number;
  y: number;
  z?: number;
  count: number;
  /** 颜色（十六进制或 CSS 颜色），每粒子在 colorJitter 内随机明暗 */
  color: number | string;
  colorJitter?: number;
  /** 发射体半径（各轴随机） */
  spread?: number;
  /** 基础初速度方向与随机扰动 */
  vx?: number;
  vy?: number;
  vz?: number;
  speed?: number;
  /** 寿命（秒）与随机幅度 */
  life: number;
  lifeJitter?: number;
  /** 粒子尺寸（世界单位；overlay 下为 CSS 像素） */
  size: number;
  sizeJitter?: number;
  /** 重力倍率：正值下落（火花），负值上浮（蒸汽） */
  gravity?: number;
}

export interface ParticlePoolOptions {
  capacity: number;
  /** 重力加速度（世界单位 / 秒²） */
  gravity?: number;
  /** 'additive'：火花发光；'normal'：烟尘 */
  blending?: 'additive' | 'normal';
  /** 方形像素（Minecraft 风格）还是柔和圆点 */
  soft?: boolean;
}

const VERTEX = /* glsl */ `
  attribute vec3 aVel;
  attribute float aBirth;
  attribute float aLife;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aGrav;
  uniform float uTime;
  uniform float uGravity;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float age = uTime - aBirth;
    float t = age / max(aLife, 0.0001);
    if (t < 0.0 || t > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }
    vec3 p = position + aVel * age;
    p.y -= 0.5 * uGravity * aGrav * age * age;
    vColor = aColor;
    vAlpha = (1.0 - t) * smoothstep(0.0, 0.06, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * uScale * (1.0 - 0.45 * t));
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uSoft;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float mask = mix(1.0 - step(0.5, max(abs(c.x), abs(c.y))), 1.0 - smoothstep(0.2, 0.5, d), uSoft);
    float a = vAlpha * mask;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

const tmpColor = new Color();

export class ParticlePool {
  readonly points: Points;
  readonly capacity: number;
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly birth: Float32Array;
  private readonly life: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly attrs: BufferAttribute[];
  private cursor = 0;
  /** 本帧待上传的区间（环形缓冲最多两段） */
  private dirty: [number, number][] = [];
  /** 内部时钟（秒）；全部粒子死亡后会归零，避免 float32 精度随时长下降 */
  private now = 0;
  private lastDeath = 0;
  private disposed = false;

  constructor(options: ParticlePoolOptions) {
    const n = Math.max(1, Math.floor(options.capacity));
    this.capacity = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.birth = new Float32Array(n).fill(-1e6);
    this.life = new Float32Array(n).fill(1);
    this.color = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.geometry = new BufferGeometry();
    const make = (name: string, array: Float32Array, itemSize: number) => {
      const attr = new BufferAttribute(array, itemSize);
      attr.setUsage(35048 /* DynamicDrawUsage */);
      this.geometry.setAttribute(name, attr);
      return attr;
    };
    this.attrs = [
      make('position', this.pos, 3),
      make('aVel', this.vel, 3),
      make('aBirth', this.birth, 1),
      make('aLife', this.life, 1),
      make('aColor', this.color, 3),
      make('aSize', this.size, 1),
      make('aGrav', this.grav, 1),
    ];
    const blending: Blending = options.blending === 'normal' ? NormalBlending : AdditiveBlending;
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: options.gravity ?? 9.8 },
        uScale: { value: 1 },
        uSoft: { value: options.soft ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new Points(this.geometry, this.material);
    // 粒子位置在着色器里算，包围盒无意义；关掉视锥剔除
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** 每「世界单位」对应多少帧缓冲像素（正交相机：缓冲高 / 视口高 * zoom） */
  setPixelScale(scale: number): void {
    this.material.uniforms.uScale!.value = scale;
  }

  /** 还有活着的粒子吗（无粒子时调用方可以停 RAF） */
  get alive(): boolean {
    return this.now < this.lastDeath;
  }

  /** 推进时钟（秒）。上传本帧发射的区间 */
  update(dt: number): void {
    if (this.disposed) return;
    this.now += Math.max(0, Math.min(dt, 0.1));
    if (this.now > 600 && !this.alive) this.rebase();
    this.material.uniforms.uTime!.value = this.now;
    this.flush();
  }

  emit(burst: ParticleBurst): void {
    if (this.disposed) return;
    const count = Math.max(0, Math.min(Math.floor(burst.count), this.capacity));
    if (count === 0) return;
    tmpColor.set(burst.color);
    const spread = burst.spread ?? 0;
    const speed = burst.speed ?? 0;
    const jitter = burst.colorJitter ?? 0.15;
    const z = burst.z ?? 0;
    let start = this.cursor;
    for (let k = 0; k < count; k += 1) {
      const i = this.cursor;
      const i3 = i * 3;
      this.pos[i3] = burst.x + (Math.random() - 0.5) * 2 * spread;
      this.pos[i3 + 1] = burst.y + (Math.random() - 0.5) * 2 * spread;
      this.pos[i3 + 2] = z + (Math.random() - 0.5) * 2 * spread;
      this.vel[i3] = (burst.vx ?? 0) + (Math.random() - 0.5) * 2 * speed;
      this.vel[i3 + 1] = (burst.vy ?? 0) + (Math.random() - 0.5) * 2 * speed;
      this.vel[i3 + 2] = (burst.vz ?? 0) + (Math.random() - 0.5) * 2 * speed;
      const lifeValue = Math.max(0.05, burst.life + (Math.random() - 0.5) * 2 * (burst.lifeJitter ?? 0));
      this.birth[i] = this.now;
      this.life[i] = lifeValue;
      const shade = 1 + (Math.random() - 0.5) * 2 * jitter;
      this.color[i3] = Math.min(1, tmpColor.r * shade);
      this.color[i3 + 1] = Math.min(1, tmpColor.g * shade);
      this.color[i3 + 2] = Math.min(1, tmpColor.b * shade);
      this.size[i] = Math.max(0.01, burst.size + (Math.random() - 0.5) * 2 * (burst.sizeJitter ?? 0));
      this.grav[i] = burst.gravity ?? 1;
      this.lastDeath = Math.max(this.lastDeath, this.now + lifeValue);
      this.cursor = (this.cursor + 1) % this.capacity;
      if (this.cursor === 0) {
        this.dirty.push([start, this.capacity - start]);
        start = 0;
      }
    }
    if (this.cursor > start) this.dirty.push([start, this.cursor - start]);
  }

  /** 立即清空所有粒子 */
  clear(): void {
    this.birth.fill(-1e6);
    this.dirty = [[0, this.capacity]];
    this.lastDeath = 0;
    this.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private rebase(): void {
    this.now = 0;
    this.lastDeath = 0;
    this.birth.fill(-1e6);
    this.dirty = [[0, this.capacity]];
  }

  private flush(): void {
    if (this.dirty.length === 0) return;
    // 区间过多时直接整段上传
    const ranges = this.dirty.length > 8 ? [[0, this.capacity] as [number, number]] : this.dirty;
    for (const attr of this.attrs) {
      attr.clearUpdateRanges();
      for (const [start, count] of ranges) attr.addUpdateRange(start * attr.itemSize, count * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.dirty = [];
  }
}

/**
 * 全屏粒子层：自带透明 WebGL 画布，坐标是 CSS 像素（左上原点，y 向下）。
 * 没有活粒子时自动停 RAF；隐藏页时不渲染。WebGL 不可用时 create() 返回 null。
 */
export class ParticleOverlay {
  readonly pool: ParticlePool;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: OrthographicCamera;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private readonly onResize = () => this.resize();

  private constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: OrthographicCamera,
    capacity: number,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    // CSS 像素坐标系下 y 向下，重力取负值才是「下落」
    this.pool = new ParticlePool({ capacity, gravity: -900, blending: 'additive' });
    this.scene.add(this.pool.points);
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  static create(container: HTMLElement, capacity = 2048): ParticleOverlay | null {
    try {
      const renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false });
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
      canvas.setAttribute('aria-hidden', 'true');
      container.appendChild(canvas);
      return new ParticleOverlay(renderer, new Scene(), new OrthographicCamera(0, 1, 0, 1, -10, 10), capacity);
    } catch {
      return null;
    }
  }

  /** 发射一组粒子（CSS 像素坐标），并确保动画在跑 */
  burst(burst: ParticleBurst): void {
    if (this.disposed) return;
    this.pool.emit(burst);
    this.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.pool.dispose();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = 0;
    this.camera.bottom = h;
    this.camera.updateProjectionMatrix();
    this.pool.setPixelScale(dpr);
  }

  private start(): void {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = 0;
      if (this.disposed) return;
      const dt = (now - this.last) / 1000;
      this.last = now;
      this.pool.update(dt);
      if (!document.hidden) this.renderer.render(this.scene, this.camera);
      if (this.pool.alive) this.raf = requestAnimationFrame(frame);
      else this.renderer.clear();
    };
    this.raf = requestAnimationFrame(frame);
  }
}
