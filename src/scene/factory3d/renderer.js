import * as THREE from 'three';
import { BlockWorld, FLOOR_LAYERS } from '../../../gtnh3d/src/blocks.js';
import { placeFloor } from '../../../gtnh3d/src/layout.js';
import { meshWorld } from '../../../gtnh3d/src/mesher.js';
import { buildAtlas } from '../../../gtnh3d/src/atlas.js';
import * as floorTextures from '../../../gtnh3d/src/textures.js';
import nativeManifest from '../../assets/factory3d/native-manifest.json';
import customManifest from '../../assets/factory3d/custom-manifest.json';
import { createCompactLayout } from './compact-layout';
import { matchesSceneFilter } from './state';
import { createCustomGeometry, createModelGeometry, createNativeAtlas, nativeModel } from './native-geometry';

const nativeUrls = import.meta.glob('../../assets/factory3d/native/*.png', {
  eager: true, query: '?url', import: 'default',
});
const customUrls = import.meta.glob('../../assets/factory3d/custom/*.png', {
  eager: true, query: '?url', import: 'default',
});
const ORIGIN_X = 74.5;
const ORIGIN_Z = 75.5;
const PARTICLE_LIMIT = 512;

function loadImage(src, key) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`原生机器纹理无法读取：${key}`));
    image.src = src;
  });
}

function modelFootprint(model) {
  return { width: model.size[0], depth: model.size[2] };
}

function floorSurface(world, x, z, width, depth) {
  let surface = 0;
  for (let offsetX = 0; offsetX < width; offsetX++) {
    for (let offsetZ = 0; offsetZ < depth; offsetZ++) {
      const columnX = x + offsetX;
      const columnZ = z + offsetZ;
      for (let layer = FLOOR_LAYERS - 1; layer >= 0; layer--) {
        if (!world.get(columnX, layer, columnZ)) continue;
        surface = Math.max(surface, layer + 1);
        break;
      }
    }
  }
  return surface;
}

function disposeObject(object) {
  if (object.isInstancedMesh) object.dispose();
  object.removeFromParent();
}

export async function createFactoryView(canvas, onSelect, onProject = () => {}, options = {}) {
  const textureEntries = Object.entries(nativeManifest.textures);
  const images = new Map(await Promise.all(textureEntries.map(async ([key, metadata]) => {
    const src = nativeUrls[`../../assets/factory3d/${metadata.file}`];
    if (!src) throw new Error(`原生机器纹理缺失：${metadata.file}`);
    return [key, await loadImage(src, key)];
  })));
  const customImages = new Map(await Promise.all(Object.entries(customManifest.textures).map(async ([key, metadata]) => {
    const src = customUrls[`../../assets/factory3d/${metadata.file}`];
    if (!src) throw new Error(`原生自定义纹理缺失：${metadata.file}`);
    return [key, await loadImage(src, key)];
  })));
  const floorSources = Object.fromEntries(Object.entries(floorTextures).filter(([key]) => key.startsWith('floor')));
  const floorAtlas = await buildAtlas(floorSources);
  const world = new BlockWorld();
  placeFloor(world);
  const floor = meshWorld(world, floorAtlas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // 方块贴图本身就是像素风；1 倍内部像素既清晰，又避免大厂区的填充率翻倍。
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9d9e5');
  scene.fog = new THREE.Fog('#c9d9e5', 320, 1100);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 1400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x778491, 2.3));
  const sun = new THREE.DirectionalLight(0xfff8e5, 2.4);
  sun.position.set(-30, 90, 40);
  scene.add(sun);
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorAtlas.texture, vertexColors: true, alphaTest: 0.02 });
  for (const part of floor.meshes) scene.add(new THREE.Mesh(part.geo, floorMaterial));

  // MC 创造飞行：相机位置与视线相互独立，不围绕一个固定目标旋转。
  let yaw = 0;
  let pitch = -0.22;
  const flyForward = new THREE.Vector3();
  const flyRight = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  function applyLook() {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
  }
  function setCameraPose(position, target) {
    camera.position.copy(position);
    const direction = target.clone().sub(position).normalize();
    yaw = Math.atan2(-direction.x, -direction.z);
    pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    applyLook();
  }
  const nativeAtlas = createNativeAtlas(nativeManifest, images, renderer.capabilities.maxTextureSize);
  // 这些 BufferGeometry 没有 color attribute。若启用 vertexColors，Three 会把缺失颜色当作黑色相乘。
  // 原版面贴图已包含明暗信息，用无光照材质也能保留清晰的像素细节。
  const nativeMaterial = new THREE.MeshBasicMaterial({
    map: nativeAtlas.texture, alphaTest: 0.02, side: THREE.FrontSide, toneMapped: false,
  });
  const customTextures = new Map();
  const customMaterials = new Map();
  const effectTextures = [];
  const customMeshByName = new Map(customManifest.meshes.map(mesh => [mesh.name, mesh]));
  function materialForCustom(meshName) {
    const mesh = customMeshByName.get(meshName);
    if (!mesh) throw new Error(`缺少自定义网格：${meshName}`);
    const key = `${mesh.texture}:${mesh.alphaMode}`;
    if (customMaterials.has(key)) return customMaterials.get(key);
    const image = customImages.get(mesh.texture.replace(/^custom\//, '').replace(/\.png$/, ''));
    if (!image) throw new Error(`缺少自定义网格纹理：${mesh.texture}`);
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.needsUpdate = true;
    if (mesh.billboard?.enabled) {
      const { frameCount, layerCount, layer } = mesh.billboard;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1 / frameCount, 1 / layerCount);
      texture.offset.set(0, 1 - (layer + 1) / layerCount);
      effectTextures.push({ texture, frameCount, interval: mesh.billboard.frameIntervalSeconds });
    }
    customTextures.set(key, texture);
    const transparent = mesh.alphaMode === 'blend' || mesh.alphaMode === 'add';
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent, depthWrite: !transparent, side: THREE.DoubleSide,
      blending: mesh.alphaMode === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending, alphaTest: transparent ? 0 : 0.02, toneMapped: false });
    customMaterials.set(key, material);
    return material;
  }
  function materialsForCustom(id) {
    const model = customManifest.models[id];
    if (!model) throw new Error(`缺少自定义模型清单：${id}`);
    return model.meshes.map(materialForCustom);
  }
  const machines = new THREE.Group();
  scene.add(machines);
  const compactLayout = options.compact ? createCompactLayout() : null;
  const batches = new Map();
  const placements = new Map();
  const geometryCache = new Map();
  const highlightGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const highlight = new THREE.LineSegments(highlightGeometry, new THREE.LineBasicMaterial({
    color: 0xe2b961, transparent: true, opacity: 0.85,
  }));
  highlight.visible = false;
  highlight.renderOrder = 4;
  scene.add(highlight);
  const particleGeometry = new THREE.BoxGeometry(1, 1, 1);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xcfd4d9, transparent: true, opacity: 0.45 });
  const particles = new THREE.InstancedMesh(particleGeometry, particleMaterial, PARTICLE_LIMIT);
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  particles.count = 0;
  scene.add(particles);
  let states = [];
  let animate = true;
  let active = true;
  let visible = true;
  let dirty = true;
  let selected = null;
  let selectedIndex = 0;
  let filter = {};
  let fitted = false;
  const deviceBounds = new THREE.Box3();
  let signature = '';
  let frame = 0;
  let previous = performance.now();
  let animationTime = 0;
  let needsAnimation = false;
  let needsNativeAnimation = false;
  let needsParticles = false;
  let hasEffects = false;
  let needsEffects = false;
  let activeTextureKeys = new Set();
  const matrix = new THREE.Matrix4();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const keys = new Set();
  const pointers = new Set();
  let pointerStart = null;

  function invalidate() { dirty = true; scheduleRender(); }

  function geometryFor(id, mode) {
    const key = `${id}:${mode}`;
    if (geometryCache.has(key)) return geometryCache.get(key);
    const model = nativeModel(nativeManifest, id);
    const geometry = model.kind === 'custom' || model.kind === 'effect'
      ? createCustomGeometry(customManifest, id) : createModelGeometry(nativeManifest, id, mode, nativeAtlas);
    if (model.center) geometry.translate(-model.center[0], -model.center[1], -model.center[2]);
    geometryCache.set(key, geometry);
    return geometry;
  }

  function placementFor(state, index) {
    const key = `${state.id}:${index}`;
    const cached = placements.get(key);
    if (cached) return cached;
    const model = nativeModel(nativeManifest, state.id);
    const footprint = modelFootprint(model);
    const point = compactLayout
      ? compactLayout.position(state.id, index, footprint)
      : { x: (index % 32) * (footprint.width + 1), z: Math.floor(index / 32) * (footprint.depth + 1) };
    const x = ORIGIN_X + point.x;
    const z = ORIGIN_Z + point.z;
    const surface = floorSurface(world, Math.floor(x), Math.floor(z), footprint.width, footprint.depth);
    const position = new THREE.Vector3(
      x + (footprint.width - 1) / 2,
      surface + model.size[1] / 2,
      z + (footprint.depth - 1) / 2,
    );
    const placement = { position, model, footprint };
    placements.set(key, placement);
    return placement;
  }

  function labelHeight(state) {
    return nativeModel(nativeManifest, state.id).size[1] / 2 + 0.35;
  }

  function hasNativeAnimation(id, mode) {
    const model = nativeModel(nativeManifest, id);
    if (!model.blocks) return false;
    return model.blocks.some(([, , , typeId]) => nativeManifest.types[typeId][mode]
      .some(textureId => nativeManifest.textures[textureId].frames.length > 1));
  }

  function activeTextures(id, mode, output) {
    const model = nativeModel(nativeManifest, id);
    for (const [, , , typeId] of model.blocks ?? []) for (const textureId of nativeManifest.types[typeId][mode]) {
      if (nativeManifest.textures[textureId].frames.length > 1) output.add(textureId);
    }
  }

  function configureAnimation(next) {
    // 必须在数量未变时也执行：右上角“动态”开关只改变 animate，不能被 update 的签名快路径吞掉。
    needsNativeAnimation = animate && next.some(state => matchesSceneFilter(state, filter)
      && state.activity > 0 && state.running > 0 && hasNativeAnimation(state.id, 'active'));
    activeTextureKeys = new Set();
    if (needsNativeAnimation) for (const state of next) {
      if (matchesSceneFilter(state, filter) && state.activity > 0 && state.running > 0) activeTextures(state.id, 'active', activeTextureKeys);
    }
    needsParticles = animate && next.some(state => matchesSceneFilter(state, filter)
      && state.category === 'generator' && state.activity > 0 && state.running > 0);
    hasEffects = next.some(state => matchesSceneFilter(state, filter) && state.modelKind === 'effect');
    needsEffects = animate && hasEffects && effectTextures.length > 0;
    needsAnimation = needsNativeAnimation || needsParticles || needsEffects;
  }

  function labels() {
    camera.updateMatrixWorld();
    onProject(states.filter(state => state.count > 0 && matchesSceneFilter(state, filter)).map(state => {
      const index = state.id === selected ? selectedIndex : 0;
      const placement = placementFor(state, Math.min(index, state.count - 1));
      const point = placement.position.clone().add(new THREE.Vector3(0, labelHeight(state), 0)).project(camera);
      return {
        id: state.id, x: (point.x + 1) * 50, y: (1 - point.y) * 50, index,
        visible: camera.position.distanceTo(placement.position) < 110
          && point.z > -1 && point.z < 1 && Math.abs(point.x) < 0.98 && Math.abs(point.y) < 0.98,
      };
    }));
  }

  function select(id, index = 0) {
    selected = id;
    const state = states.find(item => item.id === id && item.count > 0);
    selectedIndex = state ? Math.min(Math.max(0, index), state.count - 1) : 0;
    highlight.visible = !!state && matchesSceneFilter(state, filter);
    if (highlight.visible) {
      const { position, model } = placementFor(state, selectedIndex);
      highlight.position.copy(position);
      highlight.scale.set(model.size[0] * 1.035, model.size[1] * 1.035, model.size[2] * 1.035);
    }
    invalidate();
  }

  function releaseBatch(key) {
    const batch = batches.get(key);
    if (!batch) return;
    disposeObject(batch.mesh);
    batches.delete(key);
  }

  function update(next, animated, nextFilter = {}) {
    states = next;
    const motionChanged = animate !== animated;
    animate = animated;
    filter = nextFilter;
    const nextSignature = `${filter.category ?? ''}:${filter.tier ?? ''}|`
      + next.map(state => `${state.id}:${state.count}:${state.activity > 0 ? Math.min(state.count, state.running) : 0}`).join('|');
    if (signature === nextSignature) {
      configureAnimation(next);
      // 停止动态时需要最后一帧移除粒子；重新开启时也要立即安排下一帧。
      if (motionChanged || particles.count) invalidate();
      publishMetrics();
      return;
    }
    deviceBounds.makeEmpty();
    const used = new Set();
    for (const state of next) {
      const count = state.count;
      if (!count) continue;
      const shown = matchesSceneFilter(state, filter);
      const running = state.activity > 0 ? Math.min(count, state.running) : 0;
      for (let index = 0; index < count; index++) {
        const placement = placementFor(state, index);
        if (!shown) continue;
        const half = new THREE.Vector3(...placement.model.size).multiplyScalar(0.5);
        deviceBounds.expandByPoint(placement.position.clone().sub(half));
        deviceBounds.expandByPoint(placement.position.clone().add(half));
      }
      for (const [mode, start, size] of [['active', 0, running], ['idle', running, count - running]]) {
        if (!size) continue;
        const key = `${state.id}:${mode}`;
        used.add(key);
        let batch = batches.get(key);
        if (!batch) {
          batch = { mesh: null, capacity: 0, geometry: geometryFor(state.id, mode),
            material: state.modelKind === 'custom' || state.modelKind === 'effect' ? materialsForCustom(state.id) : nativeMaterial, effect: state.modelKind === 'effect' };
          batches.set(key, batch);
        }
        if (batch.capacity < size) {
          if (batch.mesh) disposeObject(batch.mesh);
          batch.capacity = Math.max(size, batch.capacity * 2, 4);
          batch.mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.capacity);
          batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          batch.mesh.userData.modelId = state.id;
          machines.add(batch.mesh);
        }
        const mesh = batch.mesh;
        mesh.count = size;
        mesh.visible = shown;
        mesh.userData.start = start;
        for (let index = 0; index < size; index++) {
          const placement = placementFor(state, start + index);
          matrix.makeTranslation(placement.position.x, placement.position.y, placement.position.z);
          mesh.setMatrixAt(index, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        // 重新计算实例边界会遍历整批矩阵；厂区镜头由显式 bounds 控制，整批不参与 frustum 剔除。
        mesh.frustumCulled = false;
        if (batch.effect) mesh.quaternion.copy(camera.quaternion);
      }
    }
    for (const key of [...batches.keys()]) if (!used.has(key)) releaseBatch(key);
    // 静态厂区不维持空转循环。运行但没有动画纹理的设备也不需要逐帧重绘。
    configureAnimation(next);
    signature = nextSignature;
    if (!fitted && !deviceBounds.isEmpty()) { fitted = true; reset(); }
    select(selected, selectedIndex);
    labels();
    publishMetrics();
    invalidate();
  }

  function publishMetrics() {
    const shown = states.filter(state => matchesSceneFilter(state, filter));
    const visibleCount = shown.reduce((sum, state) => sum + state.count, 0);
    const voxelCount = shown.reduce((sum, state) => sum + state.count * (nativeModel(nativeManifest, state.id).blocks?.length ?? 0), 0);
    canvas.dataset.machineCount = String(visibleCount);
    canvas.dataset.ownedCount = String(states.reduce((sum, state) => sum + state.count, 0));
    canvas.dataset.blockCount = String(visibleCount);
    canvas.dataset.iconCount = '0';
    canvas.dataset.voxelCount = String(voxelCount);
    canvas.dataset.multiblockCount = String(shown
      .filter(state => nativeModel(nativeManifest, state.id).kind === 'multiblock')
      .reduce((sum, state) => sum + state.count, 0));
  }

  function lookAt(target, offset) {
    setCameraPose(target.clone().add(offset), target);
    labels();
    invalidate();
  }

  function reset() {
    const bounds = deviceBounds.isEmpty()
      ? new THREE.Box3(new THREE.Vector3(77.5, 1, 76.5), new THREE.Vector3(83.5, 2, 82.5))
      : deviceBounds;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const halfFov = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
    const distance = Math.max(7, size.length() / 2 / Math.sin(halfFov) * 1.08);
    const direction = new THREE.Vector3(0.25, 1.2, 1.5).normalize();
    let fittedDistance = distance * 0.5;
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    for (let attempt = 0; attempt < 16; attempt++) {
      camera.position.copy(center).addScaledVector(direction, fittedDistance);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      if (corners.every(point => {
        const projected = point.clone().project(camera);
        return projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 0.86 && Math.abs(projected.y) < 0.82;
      })) break;
      fittedDistance *= 1.1;
    }
    camera.far = Math.max(1400, fittedDistance * 4);
    camera.updateProjectionMatrix();
    scene.fog.near = Math.max(120, fittedDistance * 1.5);
    scene.fog.far = Math.max(650, fittedDistance * 4);
    lookAt(center, direction.multiplyScalar(fittedDistance));
  }

  function focus(id, index = 0) {
    const state = states.find(item => item.id === id);
    if (!state?.count) return;
    select(id, index);
    const { position, model } = placementFor(state, selectedIndex);
    const radius = Math.max(...model.size);
    lookAt(position, new THREE.Vector3(2.8, 2.1, 3.8).normalize().multiplyScalar(Math.max(5, radius * 2.2)));
  }

  function overview() {
    scene.fog.near = 320;
    scene.fog.far = 1100;
    lookAt(new THREE.Vector3(160, 0, 160), new THREE.Vector3(145, 280, 310));
  }

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
    labels();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const pointerDown = event => {
    canvas.focus({ preventScroll: true });
    pointers.add(event.pointerId);
    canvas.setPointerCapture?.(event.pointerId);
    pointerStart = pointers.size === 1 ? { x: event.clientX, y: event.clientY, button: event.button, id: event.pointerId, moved: false } : null;
    invalidate();
  };
  const pointerMove = event => {
    const start = pointerStart;
    if (!start || start.id !== event.pointerId || start.button !== 0 || pointers.size !== 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 2) start.moved = true;
    if (!start.moved) return;
    yaw -= dx * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.004, -Math.PI / 2 + 0.015, Math.PI / 2 - 0.015);
    start.x = event.clientX;
    start.y = event.clientY;
    applyLook();
    invalidate();
  };
  const pointerUp = event => {
    const start = pointerStart;
    pointerStart = null;
    pointers.delete(event.pointerId);
    if (!start || start.id !== event.pointerId || pointers.size || start.button !== 0 || start.moved) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(machines.children.filter(mesh => mesh.visible), false)[0];
    if (!hit) return;
    const index = hit.object.userData.start + hit.instanceId;
    select(hit.object.userData.modelId, index);
    onSelect(hit.object.userData.modelId, index);
  };
  const keyDown = event => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'control', 'r'].includes(key)) {
      event.preventDefault();
      keys.add(key);
      if (key === 'r') reset();
      invalidate();
    }
  };
  const keyUp = event => keys.delete(event.key.toLowerCase());
  const clearKeys = () => keys.clear();
  const pointerCancel = event => { pointerStart = null; pointers.delete(event.pointerId); };
  const preventContextMenu = event => event.preventDefault();
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('contextmenu', preventContextMenu);
  canvas.addEventListener('keydown', keyDown);
  canvas.addEventListener('keyup', keyUp);
  canvas.addEventListener('blur', clearKeys);
  window.addEventListener('blur', clearKeys);
  function scheduleRender() {
    if (active && visible && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }
  const visibility = () => {
    previous = performance.now();
    keys.clear();
    pointers.clear();
    pointerStart = null;
    dirty = true;
    if (!visible || document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else scheduleRender();
  };
  document.addEventListener('visibilitychange', visibility);

  function render(stamp) {
    frame = 0;
    if (!active || !visible || document.hidden) return;
    const delta = Math.min((stamp - previous) / 1000, 0.06);
    // 操作相机时必须跟随显示器刷新；此前统一限制到 12 FPS，拖动时会显著卡顿。
    // 纯贴图帧动画最多 30 FPS 即可，避免为像素动画无意义地满速提交 GPU。
    const interval = keys.size || pointers.size || needsParticles ? 1000 / 60
      : needsNativeAnimation ? 1000 / 30
        : needsEffects ? 1000 / 20 : 0;
    if (interval && stamp - previous < interval) {
      if (needsAnimation || keys.size || pointers.size) scheduleRender();
      return;
    }
    previous = stamp;
    if (keys.size) {
      flyForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      flyRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      const side = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      const lift = Number(keys.has(' ')) - Number(keys.has('shift'));
      const speed = (keys.has('control') ? 52 : 18) * delta;
      const move = flyForward.multiplyScalar(forward).addScaledVector(flyRight, side).addScaledVector(worldUp, lift).multiplyScalar(speed);
      camera.position.add(move);
      dirty = true;
    }
    // 节点 billboard 只在相机变更触发的脏帧中对齐；静止时不维持 60 FPS 循环。
    if (dirty && hasEffects) for (const batch of batches.values()) if (batch.effect && batch.mesh?.visible) batch.mesh.quaternion.copy(camera.quaternion);
    if (needsAnimation) {
      animationTime += delta;
      if (needsNativeAnimation && nativeAtlas.update(Math.floor(animationTime * 20), activeTextureKeys)) dirty = true;
      if (needsEffects) for (const effect of effectTextures) {
        const frame = Math.floor(animationTime / effect.interval) % effect.frameCount;
        if (effect.frame !== frame) {
          effect.frame = frame;
          effect.texture.offset.x = frame / effect.frameCount;
          dirty = true;
        }
      }
      let count = 0;
      for (const state of needsParticles ? states : []) {
        if (!state.running || state.activity <= 0 || state.category !== 'generator'
          || !matchesSceneFilter(state, filter)) continue;
        const placement = placementFor(state, 0);
        const remaining = PARTICLE_LIMIT - count;
        if (remaining <= 0) break;
        const amount = Math.min(4, state.count, remaining);
        for (let index = 0; index < amount; index++) {
          const t = (animationTime * 0.5 + index / 4) % 1;
          const scale = 0.06 + t * 0.13;
          matrix.makeScale(scale, scale, scale);
          matrix.setPosition(
            placement.position.x + Math.sin(t * 5 + index) * 0.13,
            placement.position.y + placement.model.size[1] / 2 + 0.1 + t * 1.8,
            placement.position.z - 0.15,
          );
          particles.setMatrixAt(count++, matrix);
        }
      }
      if (particles.count !== count) dirty = true;
      particles.count = count;
      if (count) particles.instanceMatrix.needsUpdate = true;
    } else if (particles.count) {
      particles.count = 0;
      dirty = true;
    }
    if (dirty) {
      renderer.render(scene, camera);
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
      labels();
      dirty = false;
    }
    if (needsAnimation || keys.size || pointers.size) scheduleRender();
  }

  reset();
  resize();
  scheduleRender();
  return {
    update, select, focus, reset, overview,
    setVisible(value) { visible = value; visibility(); },
    dispose() {
      active = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      canvas.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('blur', clearKeys);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', visibility);
      const geometries = new Set([highlightGeometry, particleGeometry]);
      const materials = new Set([floorMaterial, nativeMaterial, particleMaterial, highlight.material]);
      const textures = new Set([floorAtlas.texture, nativeAtlas.texture]);
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => materials.add(item));
        if (object.isInstancedMesh) object.dispose();
      });
      for (const geometry of geometryCache.values()) geometries.add(geometry);
      geometries.forEach(item => item.dispose());
      for (const material of materials) {
        if (material.map) textures.add(material.map);
        material.dispose();
      }
      textures.forEach(item => item.dispose());
      nativeAtlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      images.clear();
      placements.clear();
      world.blocks.clear();
    },
  };
}
