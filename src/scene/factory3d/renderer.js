import * as THREE from 'three';
import { buildAtlas } from './atlas.js';
import * as floorTextures from './floor-textures.js';
import nativeManifest from '../../assets/factory3d/native-manifest.json';
import customManifest from '../../assets/factory3d/custom-manifest.json';
import { createGroundView } from './ground-view';
import { createGround, isGroundCoordinate } from './ground';
import { machineGridPosition, machineIndexAtCell } from './model-layout';
import { matchesSceneFilter } from './state';
import { createCustomGeometry, createModelGeometry, createNativeAtlas, nativeModel } from './native-geometry';
import { loadMultiblockAssets } from './effect-assets';
import { createMultiblockEffects, modelCenterOffset, multiblockEffectKind } from './multiblock-effects';

const nativeUrls = import.meta.glob('../../assets/factory3d/native/*.png', {
  eager: true, query: '?url', import: 'default',
});
const customUrls = import.meta.glob('../../assets/factory3d/custom/*.png', {
  eager: true, query: '?url', import: 'default',
});
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

function disposeObject(object) {
  if (object.isInstancedMesh) object.dispose();
  object.removeFromParent();
}

function createPreviewGroundView() {
  return {
    surface: () => 0,
    update: async () => true,
    pick: () => null,
    showCursor: () => {},
    frame: () => {},
    dispose: () => {},
  };
}

export async function createFactoryView(canvas, onSelect, onProject = () => {}, options = {}) {
  const preview = options.preview === true;
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
  const floorAtlas = preview ? null : await buildAtlas(floorSources);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // 方块贴图本身就是像素风；1 倍内部像素既清晰，又避免大厂区的填充率翻倍。
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(preview ? '#111820' : '#c9d9e5');
  if (!preview) scene.fog = new THREE.Fog('#c9d9e5', 320, 1100);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 1400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x778491, 2.3));
  const sun = new THREE.DirectionalLight(0xfff8e5, 2.4);
  sun.position.set(-30, 90, 40);
  scene.add(sun);
  const ground = preview ? createPreviewGroundView() : createGroundView(scene, floorAtlas);
  let groundDesign = createGround();
  let groundSite = '';
  let groundStructure = null;
  let groundRevision = 0;
  let editor = { tool: 'view', material: 'white-concrete', layer: 0 };
  const cameraPoses = new Map();
  let pendingPose = null;
  const previewTarget = new THREE.Vector3();

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
  const previewPivot = preview ? new THREE.Group() : null;
  if (previewPivot) {
    previewPivot.add(machines);
    scene.add(previewPivot);
  } else {
    scene.add(machines);
  }
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
  const multiblockEffects = createMultiblockEffects(previewPivot ?? scene, await loadMultiblockAssets(renderer.capabilities.maxTextureSize));
  let states = [];
  let totalOwned = 0;
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
  let needsMultiblockAnimation = false;
  let activeTextureKeys = new Set();
  const matrix = new THREE.Matrix4();
  const unitScale = new THREE.Vector3(1, 1, 1);
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
    else if (model.blocks) geometry.translate(...modelCenterOffset(model).map(value => -value));
    geometryCache.set(key, geometry);
    return geometry;
  }

  function placementFor(state, index) {
    const key = `${state.id}:${index}`;
    const cached = placements.get(key);
    if (cached) return cached;
    const model = nativeModel(nativeManifest, state.id);
    if (preview) {
      const placement = {
        // 预览模型几何已经按模型中心归一化，放在原点即可让旋转枢轴位于机器中心。
        position: new THREE.Vector3(0, 0, 0),
        model,
        footprint: modelFootprint(model),
      };
      placements.set(key, placement);
      return placement;
    }
    const footprint = modelFootprint(model);
    const slot = machineGridPosition(index);
    const x = groundDesign.machine.x - Math.floor(footprint.width / 2) + slot.x * (footprint.width + 1);
    const z = groundDesign.machine.z - Math.floor(footprint.depth / 2) + slot.z * (footprint.depth + 1);
    const surface = ground.surface(x, z, footprint.width, footprint.depth);
    const position = new THREE.Vector3(
      x + footprint.width / 2,
      surface + model.size[1] / 2,
      z + footprint.depth / 2,
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
      && state.category === 'generator' && state.activity > 0 && state.running > 0 && !multiblockEffectKind(state.id));
    hasEffects = next.some(state => matchesSceneFilter(state, filter) && state.modelKind === 'effect');
    needsEffects = animate && hasEffects && effectTextures.length > 0;
    needsMultiblockAnimation = animate && multiblockEffects.hasRunning;
    needsAnimation = needsNativeAnimation || needsParticles || needsEffects || needsMultiblockAnimation;
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
    canvas.dataset.instanceIndex = String(selectedIndex);
    highlight.visible = !preview && !!state && matchesSceneFilter(state, filter);
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

  function update(next, animated, nextFilter = {}, ownedCount = next.reduce((sum, state) => sum + state.count, 0)) {
    states = next;
    totalOwned = ownedCount;
    selected = next[0]?.id ?? null;
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
          if (batch.effect) matrix.compose(placement.position, camera.quaternion, unitScale);
          else matrix.makeTranslation(placement.position.x, placement.position.y, placement.position.z);
          mesh.setMatrixAt(index, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        // 重新计算实例边界会遍历整批矩阵；厂区镜头由显式 bounds 控制，整批不参与 frustum 剔除。
        mesh.frustumCulled = false;
      }
    }
    for (const key of [...batches.keys()]) if (!used.has(key)) releaseBatch(key);
    multiblockEffects.update(next, filter, placementFor, matchesSceneFilter);
    // 静态厂区不维持空转循环。运行但没有动画纹理的设备也不需要逐帧重绘。
    configureAnimation(next);
    signature = nextSignature;
    if (!fitted && !deviceBounds.isEmpty()) { fitted = true; reset(); }
    if (pendingPose) {
      camera.position.copy(pendingPose.position); yaw = pendingPose.yaw; pitch = pendingPose.pitch;
      applyLook(); pendingPose = null;
    }
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
    canvas.dataset.ownedCount = String(totalOwned);
    canvas.dataset.blockCount = String(visibleCount);
    canvas.dataset.iconCount = '0';
    canvas.dataset.voxelCount = String(voxelCount);
    canvas.dataset.multiblockCount = String(shown
      .filter(state => nativeModel(nativeManifest, state.id).kind === 'multiblock')
      .reduce((sum, state) => sum + state.count, 0));
    canvas.dataset.sceneModelId = states[0]?.id ?? '';
    canvas.dataset.instanceIndex = String(selectedIndex);
    canvas.dataset.groundPreset = groundDesign.preset;
    canvas.dataset.groundEdits = String(Object.keys(groundDesign.cells).length);
    canvas.dataset.terrainBlockCount = String(groundStructure?.blockCount ?? 0);
    canvas.dataset.terrainFormat = groundStructure?.format ?? '';
  }

  function lookAt(target, offset) {
    setCameraPose(target.clone().add(offset), target);
    labels();
    invalidate();
  }

  function reset() {
    const bounds = deviceBounds.isEmpty()
      ? new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(16, 1, 16))
      : deviceBounds.clone();
    const center = bounds.getCenter(new THREE.Vector3());
    if (previewPivot) previewPivot.rotation.set(0, 0, 0);
    previewTarget.copy(center);
    const size = bounds.getSize(new THREE.Vector3());
    const halfFov = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
    const distance = Math.max(preview ? 2.5 : 14, size.length() / 2 / Math.sin(halfFov) * 1.08);
    const direction = (preview
      ? new THREE.Vector3(0, 0.85, 1.8)
      : new THREE.Vector3(0.25, 1.2, 1.5)).normalize();
    // 详情预览保持约 50% 的画面占比，留出完整模型周围的观察空间。
    let fittedDistance = distance * (preview ? 0.6 : 0.5);
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
    if (scene.fog) {
      scene.fog.near = Math.max(120, fittedDistance * 1.5);
      scene.fog.far = Math.max(650, fittedDistance * 4);
    }
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
    if (!start && editor.tool !== 'view') {
      setPointerRay(event);
      const edit = ground.pick(raycaster, editor);
      ground.showCursor(edit, canPlace(edit));
      if (edit) options.onGroundHover?.(edit);
      invalidate();
      return;
    }
    if (!start || start.id !== event.pointerId || start.button !== 0 || pointers.size !== 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 2) start.moved = true;
    if (!start.moved) return;
    if (previewPivot) {
      previewPivot.rotation.y -= dx * 0.004;
      previewPivot.rotation.x = THREE.MathUtils.clamp(
        previewPivot.rotation.x - dy * 0.004,
        -Math.PI * 0.42,
        Math.PI * 0.42,
      );
      // 初始姿态不倾斜；用户拖动时可在水平和垂直方向自由观察模型。
      previewPivot.rotation.z = 0;
    } else {
      yaw -= dx * 0.004;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.004, -Math.PI / 2 + 0.015, Math.PI / 2 - 0.015);
      applyLook();
    }
    start.x = event.clientX;
    start.y = event.clientY;
    invalidate();
  };
  const pointerUp = event => {
    const start = pointerStart;
    pointerStart = null;
    pointers.delete(event.pointerId);
    if (!start || start.id !== event.pointerId || pointers.size || start.button !== 0 || start.moved) return;
    setPointerRay(event);
    if (editor.tool !== 'view') {
      applyGroundEdit(ground.pick(raycaster, editor));
      return;
    }
    const hit = raycaster.intersectObjects(machines.children.filter(mesh => mesh.visible), false)[0];
    if (!hit) return;
    const index = hit.object.userData.start + hit.instanceId;
    select(hit.object.userData.modelId, index);
    onSelect(hit.object.userData.modelId, index);
  };
  function setPointerRay(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
  }
  function canPlace(edit) {
    if (!edit || !isGroundCoordinate(edit.x, edit.y, edit.z)) return false;
    if (!edit.material || edit.y === -1 || deviceBounds.isEmpty()) return true;
    const y = ground.surface(edit.x, edit.z) + edit.y;
    const cell = new THREE.Box3(new THREE.Vector3(edit.x + 0.001, y + 0.001, edit.z + 0.001),
      new THREE.Vector3(edit.x + 0.999, y + 0.999, edit.z + 0.999));
    const state = states[0];
    const index = machineIndexAtCell(edit.x, edit.z, state.size[0], state.size[2], groundDesign.machine.x, groundDesign.machine.z);
    if (index === null || index >= state.count) return true;
    const placement = placementFor(state, index);
    const half = new THREE.Vector3(...placement.model.size).multiplyScalar(0.5);
    return !cell.intersectsBox(new THREE.Box3(placement.position.clone().sub(half), placement.position.clone().add(half)));
  }
  function applyGroundEdit(edit) {
    if (!canPlace(edit)) { options.onGroundError?.('此处与设备重叠，或高度超出 0～255 格。'); return; }
    options.onGroundEdit?.(edit);
  }
  async function setGround(design, site, structure = null) {
    const revision = ++groundRevision;
    if (groundDesign === design && groundSite === site && groundStructure === structure) return;
    if (!await ground.update(design, structure) || revision !== groundRevision) return;
    if (design.preset !== groundDesign.preset || design.machine.x !== groundDesign.machine.x || design.machine.z !== groundDesign.machine.z) fitted = false;
    if (site !== groundSite) {
      if (groundSite) cameraPoses.set(groundSite, { position: camera.position.clone(), yaw, pitch });
      pendingPose = cameraPoses.get(site) ?? null;
      groundSite = site;
      fitted = false;
    }
    groundDesign = design;
    groundStructure = structure;
    placements.clear(); signature = '';
    invalidate();
  }
  function setGroundEditor(value) {
    editor = value;
    canvas.dataset.groundTool = editor.tool;
    ground.showCursor(null);
    invalidate();
  }
  function moveCamera(forward, side = 0, lift = 0) {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    camera.position.addScaledVector(direction, forward);
    camera.position.add(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(side));
    camera.position.y += lift;
    invalidate();
  }
  const keyDown = event => {
    const key = event.key.toLowerCase();
    if (key === 'escape') { options.onGroundExit?.(); return; }
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
      event.preventDefault(); options.onGroundUndo?.(key === 'y' || event.shiftKey); return;
    }
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
  const wheel = event => {
    if (!preview) return;
    event.preventDefault();
    const direction = camera.position.clone().sub(previewTarget);
    const distance = THREE.MathUtils.clamp(direction.length() * (event.deltaY > 0 ? 1.1 : 0.9), 2.5, 120);
    camera.position.copy(previewTarget).add(direction.normalize().multiplyScalar(distance));
    camera.lookAt(previewTarget);
    camera.updateMatrixWorld();
    invalidate();
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('contextmenu', preventContextMenu);
  canvas.addEventListener('wheel', wheel, { passive: false });
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
        : needsEffects || needsMultiblockAnimation ? 1000 / 20 : 0;
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
    if (preview && previewPivot && !keys.size && !pointers.size && animate) {
      previewPivot.rotation.y += delta * 0.18;
      dirty = true;
    }
    // 实例的平移保持在世界坐标中，只旋转节点自身以面向相机。
    if (dirty && hasEffects) for (const batch of batches.values()) {
      if (!batch.effect || !batch.mesh?.visible) continue;
      const state = states.find(item => item.id === batch.mesh.userData.modelId);
      if (!state) continue;
      for (let index = 0; index < batch.mesh.count; index++) {
        const position = placementFor(state, batch.mesh.userData.start + index).position;
        matrix.compose(position, camera.quaternion, unitScale);
        batch.mesh.setMatrixAt(index, matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
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
          || !matchesSceneFilter(state, filter) || multiblockEffectKind(state.id)) continue;
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
    const effectFrame = multiblockEffects.frame(camera, animationTime, animate);
    if (effectFrame.changed) dirty = true;
    needsMultiblockAnimation = effectFrame.animated;
    needsAnimation = needsNativeAnimation || needsParticles || needsEffects || needsMultiblockAnimation;
    if (dirty) {
      ground.frame(camera);
      renderer.render(scene, camera);
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
      canvas.dataset.effectEyes = String(multiblockEffects.metrics.eyes);
      canvas.dataset.effectOrbits = String(multiblockEffects.metrics.orbits);
      canvas.dataset.effectTurbines = String(multiblockEffects.metrics.turbines);
      canvas.dataset.effectAnimated = String(multiblockEffects.metrics.animated);
      canvas.dataset.effectTime = String(multiblockEffects.metrics.time);
      canvas.dataset.geometryCount = String(renderer.info.memory.geometries);
      canvas.dataset.textureCount = String(renderer.info.memory.textures);
      canvas.dataset.cameraX = String(camera.position.x);
      canvas.dataset.cameraZ = String(camera.position.z);
      labels();
      dirty = false;
    }
    if (needsAnimation || keys.size || pointers.size) scheduleRender();
  }

  reset();
  resize();
  scheduleRender();
  return {
    update, select, focus, reset, setGround, setGroundEditor, applyGroundEdit, moveCamera,
    setVisible(value) { visible = value; visibility(); },
    dispose() {
      active = false;
      groundRevision++;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('blur', clearKeys);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', visibility);
      multiblockEffects.dispose();
      ground.dispose();
      const geometries = new Set([highlightGeometry, particleGeometry]);
      const materials = new Set([nativeMaterial, particleMaterial, highlight.material]);
      const textures = new Set([nativeAtlas.texture]);
      if (floorAtlas) textures.add(floorAtlas.texture);
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
    },
  };
}
