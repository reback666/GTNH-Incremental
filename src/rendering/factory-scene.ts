// 工业基地的 Three.js 场景。只吃 FactoryPlan（纯投影），不认识 store / Vue。
// - 静态环境（地面、矿坑、母线、分区地台）只在 layoutKey 变化时重建
// - 机器代表按稳定 key 增删：新增升起 + 建造火花，移除下沉 + 回收粒子；机位挪动时平滑滑过去
// - 机器各部件按「几何 + 材质」合批成 InstancedMesh：机身按电压等级、正面图标按机型、
//   状态灯/状态条/转子/钻头/烟囱/机位各一批，绘制次数与代表数量基本无关
// - 动态关闭（暂停 / 系统减少动态）时直接落位、不放粒子、按需渲染，但仍可旋转和拾取
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  NearestFilter,
} from 'three';
import { modelIconUrl } from '../game/icons';
import { pickaxeIconUrl } from '../game/pickaxe-icons';
import { veinIconUrl } from '../game/veins';
import { AVENUE_HALF, type FactoryGroup, type FactoryPlan, type FactoryUnit } from './factory-model';
import { easeOutCubic, shellBox, tiledBox } from './geometry';
import { COLORS, STATUS_COLORS, voltageColor } from './palette';
import { ParticlePool } from './particles';
import { TextureCache } from './textures';

export interface FactorySceneCallbacks {
  /** 点击机器（或空地 = null） */
  onSelect: (modelId: string | null) => void;
  /** 悬停机型变化（用于光标 / 提示） */
  onHover?: (modelId: string | null) => void;
}

export interface FactoryMotion {
  /** 用户点了「暂停动态」 */
  paused: boolean;
  /** 系统 prefers-reduced-motion */
  reduced: boolean;
}

/** 浏览器可读的运行状态（组件挂到 data-* 上，便于调试与自动化检查） */
export interface FactorySceneStats {
  units: number;
  building: number;
  recycling: number;
  particles: boolean;
  dynamic: boolean;
  frames: number;
  /** 上一帧的绘制次数 */
  calls: number;
}

/** 部件相对机器根节点的局部变换 */
interface Part {
  batch: string;
  ox: number;
  oy: number;
  oz: number;
  sx: number;
  sy: number;
  sz: number;
  /** 转子：绕 y 轴转 */
  spin?: boolean;
  /** 状态灯：闪烁时缩成 0 */
  lamp?: boolean;
  color?: string;
  /** 参与射线拾取 */
  pick?: boolean;
}

interface UnitEntry {
  data: FactoryUnit;
  parts: Part[];
  /** 当前显示位置（向 data.x / data.z 平滑靠拢） */
  x: number;
  z: number;
  y: number;
  sx: number;
  sy: number;
  sz: number;
  spin: number;
  lampOn: boolean;
  phase: 'build' | 'live' | 'recycle';
  t: number;
  seed: number;
}

interface PadEntry {
  group: FactoryGroup;
  x: number;
  z: number;
}

/** 一批同几何同材质的实例 */
interface Batch {
  geometry: BufferGeometry;
  material: Material | Material[];
  mesh: InstancedMesh | null;
  slots: { entry: UnitEntry; part: Part }[];
  pick: boolean;
}

const BUILD_SECONDS = 0.7;
const RECYCLE_SECONDS = 0.55;
const MOVE_RATE = 8;
const CAMERA_SECONDS = 0.45;
const MAX_FPS = 50;
const MAX_DPR = 1.5;
const DEFAULT_YAW = Math.PI / 4;
const DEFAULT_PITCH = Math.atan(1 / Math.SQRT2); // 真等轴 35.26°
const PLATE_TOP = 0.15;
const FIT_MARGIN = 1.08;
const MIN_VIEW = 7;

const tmpRoot = new Matrix4();
const tmpLocal = new Matrix4();
const tmpOut = new Matrix4();
const tmpPos = new Vector3();
const tmpScale = new Vector3();
const tmpQuat = new Quaternion();
const AXIS_Y = new Vector3(0, 1, 0);
const tmpColor = new Color();
const ZERO = new Matrix4().makeScale(0, 0, 0);

/** 机器各部件（局部坐标，root 原点在地台面上的机器中心） */
function unitParts(unit: FactoryUnit): Part[] {
  const t = unit.tier;
  const status = STATUS_COLORS[unit.status];
  if (unit.block === 'multiblock') {
    return [
      { batch: `bodyM:${t}`, ox: 0, oy: 1.1, oz: 0, sx: 1, sy: 1, sz: 1, pick: true },
      // 正面控制器方块 + 机型图标
      { batch: `bodyS:${t}`, ox: 0, oy: 0.75, oz: 0.86, sx: 1, sy: 1, sz: 1, pick: true },
      { batch: `icon:${unit.modelId}`, ox: 0, oy: 0.75, oz: 1.362, sx: 1, sy: 1, sz: 1, pick: true },
      { batch: `chimney:${t}`, ox: 0.7, oy: 3, oz: -0.6, sx: 1, sy: 1, sz: 1 },
      { batch: `fanM:${t}`, ox: -0.6, oy: 2.25, oz: -0.4, sx: 1, sy: 1, sz: 1, spin: true },
      { batch: 'lamp', ox: -1.1, oy: 2.35, oz: 1.1, sx: 1.6, sy: 1.6, sz: 1.6, lamp: true, color: status },
      { batch: 'strip', ox: 0, oy: 0.12, oz: 1.32, sx: 2.6, sy: 1.4, sz: 1, color: status },
    ];
  }
  const parts: Part[] = [
    { batch: `bodyS:${t}`, ox: 0, oy: 0.5, oz: 0, sx: 1, sy: 1, sz: 1, pick: true },
    { batch: `icon:${unit.modelId}`, ox: 0, oy: 0.5, oz: 0.502, sx: 1, sy: 1, sz: 1, pick: true },
    { batch: 'lamp', ox: 0.38, oy: 1.08, oz: 0.38, sx: 1, sy: 1, sz: 1, lamp: true, color: status },
    { batch: 'strip', ox: 0, oy: 0.06, oz: 0.515, sx: 1, sy: 1, sz: 1, color: status },
  ];
  if (unit.kind === 'miner') {
    parts.push({ batch: 'drill', ox: 0, oy: 1.25, oz: 0, sx: 1, sy: 1, sz: 1, spin: true, color: voltageColor(t) });
  } else if (unit.kind === 'generator' || unit.kind === 'machine') {
    parts.push({ batch: `fan:${t}`, ox: 0, oy: 1.03, oz: 0, sx: 0.7, sy: 1, sz: 1, spin: true });
  }
  return parts;
}

interface CameraPose {
  x: number;
  y: number;
  z: number;
  view: number;
}

export class FactoryScene {
  private readonly container: HTMLElement;
  private readonly callbacks: FactorySceneCallbacks;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly textures = new TextureCache();
  private readonly loader = new TextureLoader();
  private readonly sparks = new ParticlePool({ capacity: 1536, gravity: 9.8, blending: 'additive' });
  private readonly smoke = new ParticlePool({ capacity: 640, gravity: 9.8, blending: 'normal', soft: true });
  private readonly envGroup = new Group();
  private readonly batchGroup = new Group();
  private readonly highlightGroup = new Group();
  /** 只属于环境的几何/材质，环境重建时释放 */
  private envDisposables: { dispose: () => void }[] = [];
  /** 整个生命周期共享的几何/材质 */
  private readonly shared: { dispose: () => void }[] = [];
  /** 按贴图 key 复用的 Lambert 材质（机身、转子、烟囱共用） */
  private readonly lamberts = new Map<string, MeshLambertMaterial>();
  private readonly batches = new Map<string, Batch>();
  private readonly units = new Map<string, UnitEntry>();
  private recycling: UnitEntry[] = [];
  private readonly pads = new Map<string, PadEntry>();
  private padBatch: { plate: InstancedMesh | null; strip: InstancedMesh | null; list: PadEntry[] } = { plate: null, strip: null, list: [] };
  private readonly geo: Record<'unit' | 'shellS' | 'shellM' | 'lamp' | 'strip' | 'drill' | 'chimney' | 'icon' | 'pad' | 'pillar' | 'fan', BufferGeometry>;
  private readonly edgeSingle: EdgesGeometry;
  private readonly edgeMulti: EdgesGeometry;
  private readonly highlightMat = new LineBasicMaterial({ color: COLORS.hazard });
  private readonly whiteBasic = new MeshBasicMaterial({ color: '#ffffff' });
  private readonly gratePadMat: MeshLambertMaterial;
  private readonly resizeObserver: ResizeObserver;
  private plan: FactoryPlan | null = null;
  private layoutKey = '';
  private selected: string | null = null;
  private hovered: string | null = null;
  private motion: FactoryMotion = { paused: false, reduced: false };
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private zoom = 1;
  private readonly target = new Vector3();
  private viewSize = 40;
  /** 用户动过视角（旋转/缩放/平移/聚焦）后，布局变化不再自动重新取景 */
  private userView = false;
  private camAnim: { from: CameraPose; to: CameraPose; t: number } | null = null;
  private structureDirty = true;
  private matricesDirty = true;
  private raf = 0;
  private lastFrame = 0;
  private lastRender = 0;
  private clock = 0;
  private emitAccumulator = 0;
  private frames = 0;
  private disposed = false;
  private drag: { id: number; x: number; y: number; moved: boolean; yaw: number; pitch: number } | null = null;
  private vein: { tex: Texture; frames: number } | null = null;
  private vajra: { mesh: Mesh; tex: Texture | null } | null = null;
  private readonly postLampMat: MeshBasicMaterial;

  /** WebGL 不可用（构造渲染器失败）时返回 null，由调用方降级 */
  static create(container: HTMLElement, callbacks: FactorySceneCallbacks): FactoryScene | null {
    try {
      return new FactoryScene(container, callbacks);
    } catch {
      return null;
    }
  }

  private constructor(container: HTMLElement, callbacks: FactorySceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color('#101215'));
    const canvas = this.renderer.domElement;
    canvas.className = 'factory-scene__canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    this.scene.add(new HemisphereLight('#c8d4e0', '#2a2622', 1.6));
    this.scene.add(new AmbientLight('#ffffff', 0.35));
    const sun = new DirectionalLight('#fff1dc', 1.9);
    sun.position.set(30, 60, 18);
    this.scene.add(sun);
    this.scene.add(this.envGroup, this.batchGroup, this.highlightGroup);
    this.scene.add(this.sparks.points, this.smoke.points);

    const pad = new PlaneGeometry(1, 1);
    pad.rotateX(-Math.PI / 2);
    this.geo = {
      unit: new BoxGeometry(1, 1, 1),
      shellS: shellBox(1, 1, 1, 1, false),
      shellM: shellBox(2.6, 2.2, 2.6, 1, true),
      lamp: new BoxGeometry(0.16, 0.16, 0.16),
      strip: new BoxGeometry(0.62, 0.07, 0.03),
      drill: new CylinderGeometry(0.06, 0.2, 0.7, 6),
      chimney: new CylinderGeometry(0.22, 0.28, 1.6, 8),
      icon: new PlaneGeometry(1, 1),
      pad,
      pillar: tiledBox(0.3, 1, 0.3, 1),
      fan: new BoxGeometry(0.9, 0.04, 0.12),
    };
    this.edgeSingle = new EdgesGeometry(new BoxGeometry(1.12, 1.12, 1.12));
    this.edgeMulti = new EdgesGeometry(new BoxGeometry(2.75, 2.35, 2.75));
    this.postLampMat = new MeshBasicMaterial({ map: this.textures.get('lamp') });
    this.gratePadMat = new MeshLambertMaterial({ map: this.textures.get('grate') });
    this.shared.push(...Object.values(this.geo), this.edgeSingle, this.edgeMulti, this.highlightMat, this.whiteBasic, this.postLampMat, this.gratePadMat);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  /** 新快照投影：环境按 layoutKey 重建，机器按稳定 key 增删改 */
  setPlan(plan: FactoryPlan): void {
    if (this.disposed) return;
    const first = this.plan === null;
    const prev = this.plan?.bounds;
    this.plan = plan;
    if (plan.layoutKey !== this.layoutKey) {
      this.layoutKey = plan.layoutKey;
      this.buildEnvironment(plan);
    }
    this.syncPads(plan);
    this.syncUnits(plan, first);
    const b = plan.bounds;
    const changed = !prev || prev.minX !== b.minX || prev.maxX !== b.maxX || prev.minZ !== b.minZ || prev.maxZ !== b.maxZ;
    // 用户没动过视角：基地变大/变小都重新取景，新机器不会留在画外
    if (first) this.fitView(false);
    else if (changed && !this.userView) this.fitView(this.dynamic);
    if (this.selected && !plan.groups.some((g) => g.modelId === this.selected)) this.setSelected(null);
    else this.updateHighlight();
    this.invalidate();
  }

  setSelected(modelId: string | null): void {
    if (this.disposed) return;
    this.selected = modelId;
    this.updateHighlight();
    this.invalidate();
  }

  setMotion(motion: FactoryMotion): void {
    this.motion = { ...motion };
    if (!this.dynamic) {
      // 静态模式：所有过渡立即落位，清空粒子
      for (const entry of this.recycling) this.dropFromBatches(entry);
      this.recycling = [];
      for (const entry of this.units.values()) this.settle(entry);
      if (this.camAnim) this.applyPose(this.camAnim.to);
      this.camAnim = null;
      this.sparks.clear();
      this.smoke.clear();
      this.matricesDirty = true;
    }
    this.invalidate();
  }

  rotate(deltaYaw: number, deltaPitch = 0): void {
    this.userView = true;
    this.yaw += deltaYaw;
    this.pitch = Math.max(0.35, Math.min(1.25, this.pitch + deltaPitch));
    this.updateCamera();
    this.invalidate();
  }

  zoomBy(factor: number): void {
    this.userView = true;
    this.zoom = Math.max(0.5, Math.min(6, this.zoom * factor));
    this.updateCamera();
    this.invalidate();
  }

  pan(dx: number, dz: number): void {
    this.userView = true;
    this.camAnim = null;
    // 平移方向跟随当前朝向；步长随缩放变化，屏幕上的移动量大致恒定
    const k = this.viewSize / (24 * this.zoom);
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    this.target.x += (dx * cos + dz * sin) * k;
    this.target.z += (-dx * sin + dz * cos) * k;
    this.updateCamera();
    this.invalidate();
  }

  /** 复位：回到默认朝向并取景完整基地，之后布局变化继续自动取景 */
  resetView(): void {
    this.userView = false;
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.fitView(this.dynamic);
    this.invalidate();
  }

  /** 聚焦某机型的机位（默认当前选中） */
  focusModel(modelId: string | null = this.selected): boolean {
    const group = modelId ? this.plan?.groups.find((g) => g.modelId === modelId) : undefined;
    if (!group) return false;
    this.userView = true;
    const h = group.block === 'multiblock' ? 3.2 : 1.4;
    this.moveCamera(
      this.poseFor(
        group.padX - group.padW / 2,
        group.padX + group.padW / 2,
        group.padZ - group.padD / 2,
        group.padZ + group.padD / 2,
        h,
        MIN_VIEW,
      ),
      this.dynamic,
    );
    this.invalidate();
    return true;
  }

  getStats(): FactorySceneStats {
    let building = 0;
    for (const entry of this.units.values()) if (entry.phase === 'build') building += 1;
    return {
      units: this.units.size,
      building,
      recycling: this.recycling.length,
      particles: this.sparks.alive || this.smoke.alive,
      dynamic: this.dynamic,
      frames: this.frames,
      calls: this.renderer.info.render.calls,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clearHighlight();
    this.disposeEnvironment();
    this.units.clear();
    this.recycling = [];
    this.pads.clear();
    this.disposeBatches();
    this.padBatch.plate?.dispose();
    this.padBatch.strip?.dispose();
    this.batchGroup.clear();
    for (const mat of this.lamberts.values()) mat.dispose();
    this.lamberts.clear();
    for (const item of this.shared) item.dispose();
    this.sparks.dispose();
    this.smoke.dispose();
    this.textures.dispose();
    this.scene.clear();
    this.renderer.dispose();
    // 主动交还 WebGL 上下文，反复进出页面不会累积上下文
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  // ── 渲染循环 ─────────────────────────────────────────────

  private get dynamic(): boolean {
    return !this.motion.paused && !this.motion.reduced;
  }

  /** 请求至少再画一帧；动态模式下循环自己续命 */
  private invalidate(): void {
    if (this.disposed || this.raf) return;
    if (document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed || document.hidden) return;
    const minGap = 1000 / MAX_FPS;
    if (this.lastRender && now - this.lastRender < minGap - 1 && this.dynamic) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    this.lastRender = now;
    const animating = this.step(this.dynamic ? dt : 0, dt);
    this.flushBatches();
    this.renderer.render(this.scene, this.camera);
    this.frames += 1;
    if (this.dynamic || animating) this.raf = requestAnimationFrame(this.frame);
    else this.lastFrame = 0;
  };

  /** 推进动画；返回是否还有过渡在进行。realDt 只给相机过渡用（静态模式下相机也直接落位） */
  private step(dt: number, realDt: number): boolean {
    this.clock += dt;
    let busy = this.stepCamera(this.dynamic ? realDt : 1);
    let moved = false;
    for (const entry of this.units.values()) {
      if (entry.phase === 'build') {
        entry.t += dt / BUILD_SECONDS;
        const k = easeOutCubic(entry.t);
        entry.y = PLATE_TOP - entry.data.size * 1.1 * (1 - k);
        entry.sx = 1;
        entry.sy = 0.3 + 0.7 * k;
        entry.sz = 1;
        if (entry.t >= 1) this.settle(entry);
        busy = true;
      } else if (dt > 0) {
        this.animateLive(entry, dt);
      }
      // 机位重排时平滑滑到新位置
      const ex = entry.data.x - entry.x;
      const ez = entry.data.z - entry.z;
      if (ex !== 0 || ez !== 0) {
        const k = dt > 0 ? 1 - Math.exp(-MOVE_RATE * dt) : 1;
        if (Math.abs(ex) < 0.01 && Math.abs(ez) < 0.01) {
          entry.x = entry.data.x;
          entry.z = entry.data.z;
        } else {
          entry.x += ex * k;
          entry.z += ez * k;
          busy = true;
        }
        if (this.selected === entry.data.modelId) moved = true;
      }
    }
    for (const pad of this.pads.values()) {
      const g = pad.group;
      if (pad.x === g.padX && pad.z === g.padZ) continue;
      const k = dt > 0 ? 1 - Math.exp(-MOVE_RATE * dt) : 1;
      pad.x += (g.padX - pad.x) * k;
      pad.z += (g.padZ - pad.z) * k;
      if (Math.abs(g.padX - pad.x) < 0.01 && Math.abs(g.padZ - pad.z) < 0.01) {
        pad.x = g.padX;
        pad.z = g.padZ;
      } else busy = true;
      if (this.selected === g.modelId) moved = true;
    }
    if (moved) this.updateHighlight();
    if (this.recycling.length > 0) {
      const keep: UnitEntry[] = [];
      for (const entry of this.recycling) {
        entry.t += dt / RECYCLE_SECONDS;
        const k = easeOutCubic(entry.t);
        entry.y = PLATE_TOP - entry.data.size * 1.1 * k;
        entry.sx = 1 - 0.5 * k;
        entry.sy = 1 - 0.6 * k;
        entry.sz = 1 - 0.5 * k;
        if (entry.t >= 1) this.dropFromBatches(entry);
        else keep.push(entry);
      }
      this.recycling = keep;
      busy = true;
    }
    if (dt > 0 || busy) this.matricesDirty = true;
    if (dt > 0) {
      this.ambientParticles(dt);
      this.animateEnvironment();
    }
    this.sparks.update(dt);
    this.smoke.update(dt);
    return busy || this.sparks.alive || this.smoke.alive;
  }

  private settle(entry: UnitEntry): void {
    entry.phase = 'live';
    entry.t = 1;
    entry.x = entry.data.x;
    entry.z = entry.data.z;
    entry.y = PLATE_TOP;
    entry.sx = entry.sy = entry.sz = 1;
    entry.lampOn = true;
  }

  private animateLive(entry: UnitEntry, dt: number): void {
    const s = entry.data.status;
    const t = this.clock + entry.seed;
    if (s === 'running') entry.spin += dt * (entry.data.kind === 'miner' ? 6 : 3);
    else if (s === 'faulty') entry.spin += Math.sin(t * 25) * dt * 2;
    if (s === 'running') {
      entry.lampOn = true;
      entry.y = PLATE_TOP + Math.max(0, Math.sin(t * 18)) * 0.012;
    } else if (s === 'faulty') {
      entry.lampOn = Math.sin(t * 9) > -0.2;
    } else if (s === 'unpowered') {
      entry.lampOn = Math.sin(t * 3) > 0;
    } else {
      entry.lampOn = true;
    }
  }

  /** 机械火花 / 蒸汽 / 故障火星 / 矿尘：总发射量按秒计且封顶 */
  private ambientParticles(dt: number): void {
    this.emitAccumulator += dt;
    if (this.emitAccumulator < 0.12) return;
    this.emitAccumulator = 0;
    let budget = 10;
    for (const entry of this.units.values()) {
      if (budget <= 0) break;
      if (entry.phase !== 'live') continue;
      const d = entry.data;
      const x = entry.x;
      const z = entry.z;
      const top = PLATE_TOP + (d.block === 'multiblock' ? 2.2 : 1);
      const r = Math.random();
      if (d.status === 'faulty' && r < 0.35) {
        this.sparks.emit({ x, y: top, z, count: 6, color: '#ff5a2a', spread: 0.25, speed: 1.4, vy: 1.6, life: 0.5, size: 0.09, gravity: 1 });
        this.smoke.emit({ x, y: top, z, count: 2, color: '#2b2b2b', spread: 0.2, speed: 0.2, vy: 0.8, life: 1.6, size: 0.45, gravity: -0.02 });
        budget -= 2;
      } else if (d.status === 'running' && r < (d.block === 'multiblock' ? 0.3 : 0.06)) {
        if (d.kind === 'generator' || d.kind === 'purifier') {
          this.smoke.emit({ x: x + (d.block === 'multiblock' ? 0.7 : 0), y: top + (d.block === 'multiblock' ? 1.6 : 0.1), z, count: 3, color: '#cfd6dc', spread: 0.15, speed: 0.25, vy: 1.2, life: 2, size: 0.5, gravity: -0.03 });
        } else if (d.kind === 'miner') {
          this.smoke.emit({ x, y: PLATE_TOP + 0.2, z, count: 3, color: voltageColor(this.plan?.veinTier ?? 1), spread: 0.4, speed: 0.4, vy: 0.5, life: 1, size: 0.18, gravity: 0.1 });
        } else {
          this.sparks.emit({ x, y: top, z, count: 4, color: COLORS.amber, spread: 0.3, speed: 1.1, vy: 1.4, life: 0.45, size: 0.07, gravity: 1 });
        }
        budget -= 1;
      }
    }
    // 矿坑上空的矿尘
    if (Math.random() < 0.5) {
      const tier = this.plan?.veinTier ?? 1;
      this.smoke.emit({ x: (Math.random() - 0.5) * 6, y: -0.4, z: (Math.random() - 0.5) * 3, count: 2, color: voltageColor(Math.max(1, tier)), spread: 0.3, speed: 0.15, vy: 0.6, life: 2.4, size: 0.14, gravity: -0.01 });
    }
  }

  // ── 静态环境 ─────────────────────────────────────────────

  private envMesh(geometry: BufferGeometry, material: Material | Material[], x: number, y: number, z: number): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    this.envGroup.add(mesh);
    this.envDisposables.push(geometry);
    if (Array.isArray(material)) this.envDisposables.push(...material);
    else this.envDisposables.push(material);
    return mesh;
  }

  /** 平铺贴图共用同一 Texture；重复次数写在 UV 里（tiledBox） */
  private lambert(map: Texture): MeshLambertMaterial {
    return new MeshLambertMaterial({ map });
  }

  private disposeEnvironment(): void {
    this.envGroup.clear();
    for (const item of this.envDisposables) item.dispose();
    this.envDisposables = [];
    this.vajra = null;
    this.vein = null;
  }

  private buildEnvironment(plan: FactoryPlan): void {
    this.disposeEnvironment();
    const { minX, maxX, minZ, maxZ } = plan.bounds;
    const w = maxX - minX + 16;
    const d = maxZ - minZ + 16;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    // 地基：混凝土大平台，四周暗色基岩裙边
    this.envMesh(tiledBox(w, 1, d, 2), this.lambert(this.textures.get('concrete')), cx, -0.5, cz);
    this.envMesh(tiledBox(w + 1, 3, d + 1, 2), this.lambert(this.textures.get('stone')), cx, -2.4, cz);

    // 中央矿坑：下挖三层台阶，坑底铺当前矿脉方块
    const pitW = 9;
    const pitD = 5;
    const stone = this.lambert(this.textures.get('stone'));
    this.envDisposables.push(stone);
    for (let step = 0; step < 3; step += 1) {
      const sw = pitW - step * 2;
      const sd = pitD - step * 1.2;
      const ring = this.envMesh(tiledBox(sw, 0.02, sd, 1), new MeshBasicMaterial({ color: step === 0 ? '#0e0f10' : '#16181a' }), 0, 0.01 - step * 0.6, 0);
      ring.renderOrder = -1;
    }
    // 坑壁（四面）
    const wallH = 1.8;
    this.envMesh(tiledBox(pitW, wallH, 0.4, 1), stone, 0, -wallH / 2 + 0.02, -pitD / 2);
    this.envMesh(tiledBox(pitW, wallH, 0.4, 1), stone, 0, -wallH / 2 + 0.02, pitD / 2);
    this.envMesh(tiledBox(0.4, wallH, pitD, 1), stone, -pitW / 2, -wallH / 2 + 0.02, 0);
    this.envMesh(tiledBox(0.4, wallH, pitD, 1), stone, pitW / 2, -wallH / 2 + 0.02, 0);
    this.buildVeinBlocks(plan.veinTier);

    // 坑沿安全黄护栏
    const hazard = new MeshLambertMaterial({ map: this.textures.get('hazard') });
    this.envMesh(tiledBox(pitW + 0.8, 0.12, 0.3, 1), hazard, 0, 0.06, -pitD / 2 - 0.4);
    this.envMesh(tiledBox(pitW + 0.8, 0.12, 0.3, 1), hazard, 0, 0.06, pitD / 2 + 0.4);
    this.envMesh(tiledBox(0.3, 0.12, pitD + 0.8, 1), hazard, -pitW / 2 - 0.4, 0.06, 0);
    this.envMesh(tiledBox(0.3, 0.12, pitD + 0.8, 1), hazard, pitW / 2 + 0.4, 0.06, 0);

    // 坑上方的 GT 钢框架龙门 + 金刚杵（玩家手动挖矿的那把）
    const frameMat = new MeshLambertMaterial({ map: this.textures.get('frame'), alphaTest: 0.5, side: DoubleSide });
    this.envDisposables.push(frameMat);
    const frames: number[][] = [];
    for (const sx of [-1, 1]) {
      for (let y = 0; y < 4; y += 1) frames.push([sx * (pitW / 2 + 1.2), 0.5 + y, 0]);
    }
    for (let x = -pitW / 2 - 1; x <= pitW / 2 + 1.01; x += 1) frames.push([x + 0.3, 4.5, 0]);
    this.envInstances(this.geo.unit, frameMat, frames, false);
    this.buildVajra();

    // 主母线：沿大道两侧的铜缆（北）与青绿管道（南），再接到每个分区
    const cable = new MeshLambertMaterial({ map: this.textures.get('cable') });
    const pipe = new MeshLambertMaterial({ map: this.textures.get('pipe') });
    this.envDisposables.push(cable, pipe);
    const busLen = maxX - minX + 4;
    const busZ = AVENUE_HALF - 1.4;
    this.envMesh(tiledBox(busLen, 0.25, 0.25, 1), cable, cx, 0.13, -busZ);
    this.envMesh(tiledBox(busLen, 0.25, 0.25, 1), cable, cx, 0.13, -busZ + 0.4);
    this.envMesh(tiledBox(busLen, 0.45, 0.45, 1), pipe, cx, 0.6, busZ);
    // 管道支架
    const supports: number[][] = [];
    for (let x = minX; x <= maxX; x += 4) supports.push([x, 0.2, busZ, 0.67, 0.4, 0.67]);
    this.envInstances(this.geo.pillar, this.lambert(this.textures.side(1)), supports);
    // 大道路面标线
    this.envMesh(tiledBox(busLen, 0.02, 0.2, 1), hazard, cx, 0.01, -AVENUE_HALF + 0.1);
    this.envMesh(tiledBox(busLen, 0.02, 0.2, 1), hazard, cx, 0.01, AVENUE_HALF - 0.1);

    const plateMat = this.lambert(this.textures.get('plate'));
    const posts: number[] = [];
    const postZ: number[] = [];
    for (const zone of plan.zones) {
      if (zone.d <= 0) continue;
      // 分区钢板地台
      this.envMesh(tiledBox(zone.w - 0.6, PLATE_TOP, zone.d, 1), plateMat, zone.x, PLATE_TOP / 2, zone.z);
      // 分区边缘安全线
      const edgeZ = zone.north ? zone.z + zone.d / 2 : zone.z - zone.d / 2;
      this.envMesh(tiledBox(zone.w - 0.6, 0.04, 0.25, 1), hazard, zone.x, PLATE_TOP + 0.02, edgeZ);
      // 支线：母线 → 分区（北岸铜缆 / 南岸管道）
      const branchLen = Math.abs(edgeZ) - busZ;
      if (branchLen > 0) {
        const bz = (zone.north ? -1 : 1) * (busZ + branchLen / 2);
        if (zone.north) this.envMesh(tiledBox(0.25, 0.25, branchLen, 1), cable, zone.x, 0.13, bz);
        else this.envMesh(tiledBox(0.35, 0.35, branchLen, 1), pipe, zone.x, 0.3, bz);
      }
      // 地面分区牌
      // 只写分区名：台数随购买变化，不值得为它重建环境；真实台数在组件 HUD 里
      const label = this.textures.label(zone.title, '#e8e2d0');
      const sign = this.envMesh(new PlaneGeometry(4, 1), new MeshBasicMaterial({ map: label, transparent: true }), zone.x, 0.03, edgeZ + (zone.north ? 0.9 : -0.9));
      sign.rotation.x = -Math.PI / 2;
      // 角落路灯
      const lz = edgeZ + (zone.north ? 0.5 : -0.5);
      posts.push(zone.x - zone.w / 2 + 0.6, zone.x + zone.w / 2 - 0.9);
      postZ.push(lz, lz);
    }
    this.envInstances(this.geo.pillar, new MeshLambertMaterial({ color: COLORS.steel }), posts.map((x, i) => [x, 1.1, postZ[i]!, 1, 2.2, 1]));
    this.envInstances(this.geo.unit, this.postLampMat, posts.map((x, i) => [x, 2.35, postZ[i]!, 0.45, 0.45, 0.45]), false);

    // 远角工业结构：储罐与冷却塔（纯装饰，空存档也有环境）
    const tankMat = this.lambert(this.textures.casing(Math.max(1, plan.maxTier)));
    this.envDisposables.push(tankMat);
    const tank = new CylinderGeometry(1.4, 1.4, 3, 12);
    this.envMesh(tank, tankMat, maxX + 3, 1.5, -2.5);
    const tank2 = new CylinderGeometry(1.1, 1.1, 2.4, 12);
    this.envMesh(tank2, tankMat, maxX + 3, 1.2, 2.2);
    const tower = new CylinderGeometry(1.2, 1.8, 4.5, 10, 1, true);
    this.envMesh(tower, new MeshLambertMaterial({ map: this.textures.get('plate'), side: DoubleSide }), minX - 3, 2.25, 0);
  }

  /** 重复的环境小件（框架、支架、路灯、矿块）合成一批；几何是共享的，材质随环境释放 */
  private envInstances(geometry: BufferGeometry, material: Material, items: number[][], ownMaterial = true): InstancedMesh | null {
    if (ownMaterial) this.envDisposables.push(material);
    if (items.length === 0) return null;
    const mesh = new InstancedMesh(geometry, material, items.length);
    items.forEach(([x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1], i) => {
      tmpOut.compose(tmpPos.set(x, y, z), tmpQuat.identity(), tmpScale.set(sx, sy, sz));
      mesh.setMatrixAt(i, tmpOut);
    });
    mesh.computeBoundingSphere();
    this.envGroup.add(mesh);
    this.envDisposables.push(mesh);
    return mesh;
  }

  /**
   * 异步加载内联贴图。回调里检查：场景已销毁 → 立即释放；目标网格已被重建移除 → 只入缓存。
   * 所有贴图都交给 TextureCache，销毁时统一释放。
   */
  private loadTexture(key: string, url: string, apply: (texture: Texture) => void): void {
    const cached = this.textures.peek(key);
    if (cached) {
      apply(cached);
      return;
    }
    this.loader.load(
      url,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        const raced = this.textures.peek(key);
        if (raced) {
          texture.dispose();
          apply(raced);
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        this.textures.adopt(key, texture);
        apply(texture);
        this.invalidate();
      },
      undefined,
      () => undefined,
    );
  }

  /** 矿坑底的矿脉方块：贴图是竖排动画条带时按帧滚动 offset */
  private buildVeinBlocks(veinTier: number): void {
    const mat = new MeshLambertMaterial({ color: '#777' });
    this.envDisposables.push(mat);
    const blocks: [number, number, number][] = [];
    for (let x = -3; x <= 3; x += 1) {
      for (let z = -1; z <= 1; z += 1) {
        // 中间被挖低一格，形成台阶
        const dug = Math.abs(x) <= 1 && z === 0;
        blocks.push([x, dug ? -2.1 : -1.5, z]);
      }
    }
    blocks.push([-2, -0.6, -1], [3, -0.6, 1], [2, -0.6, -1]);
    this.envInstances(this.geo.unit, mat, blocks, false);
    const url = veinIconUrl(veinTier);
    this.vein = null;
    mat.userData.alive = true;
    this.envDisposables.push({ dispose: () => (mat.userData.alive = false) });
    if (!url) return;
    this.loadTexture(`vein:${veinTier}`, url, (texture) => {
      if (!mat.userData.alive) return;
      const image = texture.image as { width?: number; height?: number } | undefined;
      const frames = image?.width && image.height ? Math.max(1, Math.round(image.height / image.width)) : 1;
      if (frames > 1) {
        texture.wrapT = 1000; // RepeatWrapping
        texture.repeat.set(1, 1 / frames);
        texture.offset.set(0, 1 - 1 / frames);
        texture.needsUpdate = true;
      }
      mat.map = texture;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
      this.vein = { tex: texture, frames };
    });
  }

  /** 龙门下悬挂的金刚杵（现有 Modernity 动画条带），在矿坑上方缓慢自转 */
  private buildVajra(): void {
    const mat = new MeshBasicMaterial({ transparent: true, alphaTest: 0.1, side: DoubleSide, color: '#ffffff' });
    const mesh = this.envMesh(new PlaneGeometry(2.2, 2.2), mat, 0, 2.6, 0);
    mesh.visible = false;
    const tier = Math.max(1, Math.min(14, this.plan?.maxTier ?? 1));
    const entry = { mesh, tex: null as Texture | null };
    this.vajra = entry;
    const url = pickaxeIconUrl('vajra', tier);
    if (!url) return;
    this.loadTexture(`vajra:${tier}`, url, (texture) => {
      if (this.vajra !== entry) return;
      texture.repeat.set(1, 1 / 33);
      texture.offset.set(0, 1 - 1 / 33);
      mat.map = texture;
      mat.needsUpdate = true;
      mesh.visible = true;
      entry.tex = texture;
    });
  }

  private animateEnvironment(): void {
    if (this.vajra) {
      const { mesh, tex } = this.vajra;
      mesh.rotation.y = this.clock * 0.8;
      mesh.position.y = 2.6 + Math.sin(this.clock * 1.6) * 0.12;
      if (tex) {
        const frame = Math.floor(this.clock * 20) % 33;
        tex.offset.y = 1 - (frame + 1) / 33;
      }
    }
    if (this.vein && this.vein.frames > 1) {
      const frame = Math.floor(this.clock * 10) % this.vein.frames;
      this.vein.tex.offset.y = 1 - (frame + 1) / this.vein.frames;
    }
  }

  // ── 机位 ─────────────────────────────────────────────────

  /** 机位：格栅地板一批 + 前沿电压色标条一批，按真实机位滑动到新位置 */
  private syncPads(plan: FactoryPlan): void {
    const live = new Set<string>();
    let structural = false;
    for (const group of plan.groups) {
      live.add(group.key);
      const existing = this.pads.get(group.key);
      if (existing) {
        if (existing.group.padW !== group.padW || existing.group.padD !== group.padD || existing.group.tier !== group.tier) structural = true;
        existing.group = group;
        if (!this.dynamic) {
          existing.x = group.padX;
          existing.z = group.padZ;
        }
        continue;
      }
      this.pads.set(group.key, { group, x: group.padX, z: group.padZ });
      structural = true;
    }
    for (const key of [...this.pads.keys()]) {
      if (live.has(key)) continue;
      this.pads.delete(key);
      structural = true;
    }
    if (structural) this.structureDirty = true;
    this.matricesDirty = true;
  }

  private writePads(): void {
    const list = [...this.pads.values()];
    const need = list.length;
    let { plate, strip } = this.padBatch;
    if (!plate || plate.instanceMatrix.count < need) {
      plate?.removeFromParent();
      plate?.dispose();
      strip?.removeFromParent();
      strip?.dispose();
      const cap = Math.max(8, 1 << Math.ceil(Math.log2(Math.max(1, need))));
      plate = new InstancedMesh(this.geo.pad, this.gratePadMat, cap);
      strip = new InstancedMesh(this.geo.unit, this.whiteBasic, cap);
      plate.frustumCulled = false;
      strip.frustumCulled = false;
      this.batchGroup.add(plate, strip);
    }
    plate.count = need;
    strip!.count = need;
    list.forEach((pad, i) => {
      const g = pad.group;
      tmpOut.compose(tmpPos.set(pad.x, PLATE_TOP + 0.012, pad.z), tmpQuat.identity(), tmpScale.set(g.padW, 1, g.padD));
      plate!.setMatrixAt(i, tmpOut);
      // 色标条在靠大道一侧（北岸 +z，南岸 -z）
      const front = g.padZ < 0 ? 1 : -1;
      tmpOut.compose(tmpPos.set(pad.x, PLATE_TOP + 0.03, pad.z + front * (g.padD / 2 - 0.06)), tmpQuat.identity(), tmpScale.set(g.padW, 0.05, 0.12));
      strip!.setMatrixAt(i, tmpOut);
      strip!.setColorAt(i, tmpColor.set(voltageColor(g.tier)));
    });
    plate.instanceMatrix.needsUpdate = true;
    strip!.instanceMatrix.needsUpdate = true;
    if (strip!.instanceColor) strip!.instanceColor.needsUpdate = true;
    plate.boundingSphere = null;
    this.padBatch = { plate, strip: strip!, list };
  }

  // ── 材质与合批 ───────────────────────────────────────────

  /** 按贴图复用 Lambert 材质；贴图归 TextureCache 管 */
  private sharedLambert(key: string, map: Texture): MeshLambertMaterial {
    let mat = this.lamberts.get(key);
    if (!mat) {
      mat = new MeshLambertMaterial({ map });
      this.lamberts.set(key, mat);
    }
    return mat;
  }

  /** 批次 key → 几何与材质。tier / modelId 编在 key 里，同 key 的部件画在一次（或两次）绘制里 */
  private batchFor(key: string, unit: FactoryUnit): Batch {
    let batch = this.batches.get(key);
    if (batch) return batch;
    const t = unit.tier;
    const [kind] = key.split(':');
    let geometry: BufferGeometry;
    let material: Material | Material[];
    switch (kind) {
      case 'bodyS':
        geometry = this.geo.shellS;
        material = [this.sharedLambert(`side:${t}`, this.textures.side(t)), this.sharedLambert(`top:${t}`, this.textures.top(t))];
        break;
      case 'bodyM':
        geometry = this.geo.shellM;
        material = [this.sharedLambert(`casing:${t}`, this.textures.casing(t)), this.sharedLambert(`top:${t}`, this.textures.top(t))];
        break;
      case 'chimney':
        geometry = this.geo.chimney;
        material = this.sharedLambert(`casing:${t}`, this.textures.casing(t));
        break;
      case 'fanM':
        geometry = this.geo.fan;
        material = this.sharedLambert(`top:${t}`, this.textures.top(t));
        break;
      case 'fan':
        geometry = this.geo.fan;
        material = this.sharedLambert(`side:${t}`, this.textures.side(t));
        break;
      case 'icon':
        geometry = this.geo.icon;
        material = this.iconMaterial(unit.modelId, t);
        break;
      case 'lamp':
        geometry = this.geo.lamp;
        material = this.whiteBasic;
        break;
      case 'drill':
        geometry = this.geo.drill;
        material = this.whiteBasic;
        break;
      default:
        geometry = this.geo.strip;
        material = this.whiteBasic;
    }
    batch = { geometry, material, mesh: null, slots: [], pick: kind === 'bodyS' || kind === 'bodyM' || kind === 'icon' };
    this.batches.set(key, batch);
    return batch;
  }

  /** 机型正面图标：贴图到之前先用机壳侧板顶上，避免白块闪烁 */
  private iconMaterial(modelId: string, tier: number): MeshLambertMaterial {
    const key = `icon:${modelId}`;
    const cached = this.lamberts.get(key);
    if (cached) return cached;
    const mat = new MeshLambertMaterial({ map: this.textures.side(tier) });
    this.lamberts.set(key, mat);
    const url = modelIconUrl(modelId);
    if (url) {
      this.loadTexture(key, url, (texture) => {
        if (this.lamberts.get(key) !== mat) return;
        mat.map = texture;
        mat.needsUpdate = true;
      });
    }
    return mat;
  }

  /** 按当前机器重新分配每批的实例槽；容量按 2 的幂增长，避免频繁重建 */
  private rebuildBatches(): void {
    for (const batch of this.batches.values()) batch.slots = [];
    const add = (entry: UnitEntry) => {
      for (const part of entry.parts) this.batchFor(part.batch, entry.data).slots.push({ entry, part });
    };
    for (const entry of this.units.values()) add(entry);
    for (const entry of this.recycling) add(entry);
    for (const [key, batch] of this.batches) {
      const need = batch.slots.length;
      if (need === 0) {
        // 不再使用的批次：只释放实例缓冲；几何与材质是共享的
        batch.mesh?.removeFromParent();
        batch.mesh?.dispose();
        this.batches.delete(key);
        continue;
      }
      if (!batch.mesh || batch.mesh.instanceMatrix.count < need) {
        batch.mesh?.removeFromParent();
        batch.mesh?.dispose();
        const cap = Math.max(4, 1 << Math.ceil(Math.log2(need)));
        const mesh = new InstancedMesh(batch.geometry, batch.material, cap);
        // 实例分布在整个基地，逐批视锥剔除意义不大；拾取用自己的包围球
        mesh.frustumCulled = false;
        mesh.userData.batch = key;
        batch.mesh = mesh;
        this.batchGroup.add(mesh);
      }
      batch.mesh.count = need;
      const colored = batch.material === this.whiteBasic;
      if (colored) {
        batch.slots.forEach(({ part }, i) => batch.mesh!.setColorAt(i, tmpColor.set(part.color ?? '#ffffff')));
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      }
    }
    this.writePads();
    this.structureDirty = false;
    this.matricesDirty = true;
  }

  private disposeBatches(): void {
    for (const batch of this.batches.values()) {
      batch.mesh?.removeFromParent();
      batch.mesh?.dispose();
    }
    this.batches.clear();
  }

  /** 每帧把机器状态写进实例矩阵（几百个矩阵，CPU 开销很小） */
  private flushBatches(): void {
    if (this.structureDirty) this.rebuildBatches();
    if (!this.matricesDirty) return;
    this.matricesDirty = false;
    this.writePads();
    for (const batch of this.batches.values()) {
      const mesh = batch.mesh;
      if (!mesh) continue;
      batch.slots.forEach(({ entry, part }, i) => {
        if ((part.lamp && !entry.lampOn) || (part.spin && entry.data.status === 'stopped')) {
          mesh.setMatrixAt(i, ZERO);
          return;
        }
        tmpRoot.compose(tmpPos.set(entry.x, entry.y, entry.z), tmpQuat.identity(), tmpScale.set(entry.sx, entry.sy, entry.sz));
        tmpQuat.setFromAxisAngle(AXIS_Y, part.spin ? entry.spin : 0);
        tmpLocal.compose(tmpPos.set(part.ox, part.oy, part.oz), tmpQuat, tmpScale.set(part.sx, part.sy, part.sz));
        mesh.setMatrixAt(i, tmpOut.multiplyMatrices(tmpRoot, tmpLocal));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }

  // ── 机器代表 ─────────────────────────────────────────────

  private syncUnits(plan: FactoryPlan, instant: boolean): void {
    const animate = this.dynamic && !instant;
    const live = new Set<string>();
    for (const unit of plan.units) {
      live.add(unit.key);
      const existing = this.units.get(unit.key);
      if (existing) {
        const restyled = existing.data.status !== unit.status || existing.data.tier !== unit.tier;
        existing.data = unit;
        if (restyled) {
          existing.parts = unitParts(unit);
          this.structureDirty = true;
        }
        if (!animate) {
          existing.x = unit.x;
          existing.z = unit.z;
        }
        continue;
      }
      const entry: UnitEntry = {
        data: unit,
        parts: unitParts(unit),
        x: unit.x,
        z: unit.z,
        y: PLATE_TOP,
        sx: 1,
        sy: 1,
        sz: 1,
        spin: Math.random() * Math.PI,
        lampOn: true,
        phase: 'live',
        t: 1,
        seed: Math.random() * 10,
      };
      this.units.set(unit.key, entry);
      this.structureDirty = true;
      if (animate) {
        entry.phase = 'build';
        entry.t = 0;
        entry.y = PLATE_TOP - unit.size * 1.1;
        entry.sy = 0.3;
        this.sparks.emit({ x: unit.x, y: PLATE_TOP + 0.2, z: unit.z, count: unit.block === 'multiblock' ? 60 : 24, color: COLORS.amber, spread: unit.size * 0.45, speed: 1.6, vy: 2.6, life: 0.7, lifeJitter: 0.25, size: 0.08, gravity: 1 });
        this.smoke.emit({ x: unit.x, y: PLATE_TOP + 0.3, z: unit.z, count: 8, color: '#9aa0a6', spread: unit.size * 0.4, speed: 0.4, vy: 0.6, life: 1.2, size: 0.5, gravity: -0.02 });
      }
    }
    for (const [key, entry] of [...this.units]) {
      if (live.has(key)) continue;
      this.units.delete(key);
      this.structureDirty = true;
      if (!animate) continue;
      entry.phase = 'recycle';
      entry.t = 0;
      this.recycling.push(entry);
      // 回收：青绿碎屑向上被「吸走」
      const d = entry.data;
      this.sparks.emit({ x: entry.x, y: PLATE_TOP + d.size * 0.6, z: entry.z, count: d.block === 'multiblock' ? 50 : 20, color: COLORS.teal, spread: d.size * 0.4, speed: 0.6, vy: 2.2, life: 0.8, size: 0.09, gravity: -0.15 });
    }
    this.matricesDirty = true;
  }

  /** 回收动画结束：从批次里拿掉 */
  private dropFromBatches(entry: UnitEntry): void {
    entry.parts = [];
    this.structureDirty = true;
  }

  // ── 选中高亮 ─────────────────────────────────────────────

  private clearHighlight(): void {
    for (const child of [...this.highlightGroup.children]) child.removeFromParent();
  }

  /** 选中机型的所有代表套黄色线框（共享几何/材质，不需要单独释放） */
  private updateHighlight(): void {
    this.clearHighlight();
    if (!this.selected) return;
    for (const entry of this.units.values()) {
      if (entry.data.modelId !== this.selected) continue;
      const multi = entry.data.block === 'multiblock';
      const box = new LineSegments(multi ? this.edgeMulti : this.edgeSingle, this.highlightMat);
      box.position.set(entry.x, PLATE_TOP + (multi ? 1.1 : 0.5), entry.z);
      this.highlightGroup.add(box);
    }
    const pad = this.pads.get(this.selected);
    if (pad) {
      const g = pad.group;
      const ring = new LineSegments(this.edgeSingle, this.highlightMat);
      ring.scale.set(g.padW / 1.12, 0.05, g.padD / 1.12);
      ring.position.set(pad.x, PLATE_TOP + 0.05, pad.z);
      this.highlightGroup.add(ring);
    }
  }

  // ── 相机 ─────────────────────────────────────────────────

  /** 当前朝向下，能完整装下一个盒子（含高度）的相机目标与视口高度；考虑容器宽高比 */
  private poseFor(minX: number, maxX: number, minZ: number, maxZ: number, height: number, minView: number): CameraPose {
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const sp = Math.sin(this.pitch);
    const cp = Math.cos(this.pitch);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const hy = height / 2;
    let halfRight = 0;
    let halfUp = 0;
    for (const dx of [minX - cx, maxX - cx]) {
      for (const dz of [minZ - cz, maxZ - cz]) {
        for (const dy of [-hy, hy]) {
          // 相机右轴 (cy, 0, -sy)，上轴 (-sp·sy, cp, -sp·cy)
          halfRight = Math.max(halfRight, Math.abs(dx * cy - dz * sy));
          halfUp = Math.max(halfUp, Math.abs(-dx * sp * sy + dy * cp - dz * sp * cy));
        }
      }
    }
    const aspect = Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
    const view = Math.max(minView, 2 * Math.max(halfUp, halfRight / aspect) * FIT_MARGIN);
    return { x: cx, y: hy, z: cz, view };
  }

  private fitView(animate: boolean): void {
    const b = this.plan?.bounds ?? { minX: -14, maxX: 14, minZ: -14, maxZ: 14 };
    this.moveCamera(this.poseFor(b.minX, b.maxX, b.minZ, b.maxZ, 4, 12), animate);
  }

  private currentPose(): CameraPose {
    return { x: this.target.x, y: this.target.y, z: this.target.z, view: this.viewSize / this.zoom };
  }

  private applyPose(pose: CameraPose): void {
    this.target.set(pose.x, pose.y, pose.z);
    this.viewSize = pose.view;
    this.zoom = 1;
    this.updateCamera();
  }

  private moveCamera(to: CameraPose, animate: boolean): void {
    if (!animate) {
      this.camAnim = null;
      this.applyPose(to);
      return;
    }
    this.camAnim = { from: this.currentPose(), to, t: 0 };
  }

  private stepCamera(dt: number): boolean {
    const anim = this.camAnim;
    if (!anim) return false;
    anim.t = Math.min(1, anim.t + dt / CAMERA_SECONDS);
    const k = easeOutCubic(anim.t);
    const lerp = (a: number, b: number) => a + (b - a) * k;
    this.applyPose({
      x: lerp(anim.from.x, anim.to.x),
      y: lerp(anim.from.y, anim.to.y),
      z: lerp(anim.from.z, anim.to.z),
      view: lerp(anim.from.view, anim.to.view),
    });
    if (anim.t >= 1) this.camAnim = null;
    return this.camAnim !== null;
  }

  private updateCamera(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const aspect = w / h;
    const half = this.viewSize / 2;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.zoom = this.zoom;
    const dist = 200;
    this.camera.position.set(
      this.target.x + dist * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.target.y + dist * Math.sin(this.pitch),
      this.target.z + dist * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    // 粒子尺寸：每世界单位的缓冲像素
    const scale = (this.renderer.getPixelRatio() * h * this.zoom) / this.viewSize;
    this.sparks.setPixelScale(scale);
    this.smoke.setPixelScale(scale);
  }

  private resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setSize(w, h, false);
    // 宽高比变了：用户没手动控制时按新比例重新取景
    if (this.plan && !this.userView && !this.camAnim) this.fitView(false);
    else this.updateCamera();
    this.invalidate();
  }

  // ── 输入 ─────────────────────────────────────────────────

  /** 射线拾取：只测机身/控制器/图标批次与机位地板，instanceId 反查代表 */
  private pick(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.flushBatches();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: InstancedMesh[] = [];
    for (const batch of this.batches.values()) if (batch.pick && batch.mesh) targets.push(batch.mesh);
    if (this.padBatch.plate) targets.push(this.padBatch.plate);
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const id = hit.instanceId;
      if (id === undefined) continue;
      if (hit.object === this.padBatch.plate) {
        const pad = this.padBatch.list[id];
        if (pad) return pad.group.modelId;
        continue;
      }
      const batch = this.batches.get(hit.object.userData.batch as string);
      const slot = batch?.slots[id];
      if (!slot || slot.entry.phase === 'recycle') continue;
      return slot.entry.data.modelId;
    }
    return null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, yaw: this.yaw, pitch: this.pitch };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        this.userView = true;
        this.yaw = drag.yaw - dx * 0.008;
        this.pitch = Math.max(0.35, Math.min(1.25, drag.pitch + dy * 0.006));
        this.updateCamera();
        this.invalidate();
      }
      return;
    }
    const id = this.pick(event.clientX, event.clientY);
    if (id !== this.hovered) {
      this.hovered = id;
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      this.callbacks.onHover?.(id);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    this.drag = null;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved && event.button === 0) {
      const id = this.pick(event.clientX, event.clientY);
      this.setSelected(id);
      this.callbacks.onSelect(id);
    }
  };

  private readonly onPointerCancel = (): void => {
    this.drag = null;
  };

  private readonly onPointerLeave = (): void => {
    if (this.hovered) {
      this.hovered = null;
      this.callbacks.onHover?.(null);
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.lastFrame = 0;
    } else {
      this.invalidate();
    }
  };
}
