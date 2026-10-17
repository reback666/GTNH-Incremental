import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BlockWorld } from '../../../gtnh3d/src/blocks.js';
import { placeFloor } from '../../../gtnh3d/src/layout.js';
import { meshWorld } from '../../../gtnh3d/src/mesher.js';
import { buildAtlas } from '../../../gtnh3d/src/atlas.js';
import * as floorTextures from '../../../gtnh3d/src/textures.js';
import manifest from '../../assets/factory3d/manifest.json';
import config from '../../content/scene-machines.json';

const urls = import.meta.glob('../../assets/factory3d/*.png', { eager: true, query: '?url', import: 'default' });
const FACE_NAMES = ['side', 'side', 'top', 'bottom', 'front', 'back'];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('机器材质无法读取'));
    image.src = src;
  });
}

function animationFrame(metadata, ticks) {
  const frames = metadata.frames;
  const durations = frames.map(frame => typeof frame === 'number' ? metadata.frameTime : frame.time ?? metadata.frameTime);
  const duration = durations.reduce((sum, value) => sum + value, 0);
  let remaining = ticks % duration;
  for (let index = 0; index < frames.length; index++) {
    if (remaining < durations[index]) return typeof frames[index] === 'number' ? frames[index] : frames[index].index;
    remaining -= durations[index];
  }
  return 0;
}

export async function createFactoryView(canvas, onSelect, onProject = () => {}) {
  const images = new Map(await Promise.all(Object.keys(manifest.textures).map(async key => {
    const src = urls[`../../assets/factory3d/${key}.png`];
    if (!src) throw new Error(`机器材质缺失：${key}`);
    return [key, await loadImage(src)];
  })));
  const floorSources = Object.fromEntries(Object.entries(floorTextures).filter(([key]) => key.startsWith('floor')));
  const atlas = await buildAtlas(floorSources);
  const world = new BlockWorld();
  placeFloor(world);
  const floor = meshWorld(world, atlas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9d9e5');
  scene.fog = new THREE.Fog('#c9d9e5', 320, 1100);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 1400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x778491, 2.3));
  const sun = new THREE.DirectionalLight(0xfff8e5, 2.4);
  sun.position.set(-30, 90, 40);
  scene.add(sun);
  const floorMaterial = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.02 });
  for (const part of floor.meshes) scene.add(new THREE.Mesh(part.geo, floorMaterial));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 1.7;
  controls.maxDistance = 620;
  controls.maxPolarAngle = Math.PI / 2 - 0.035;
  controls.panSpeed = 0.85;
  controls.zoomSpeed = 0.85;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const materialCache = new Map();
  const animatedFaces = [];

  function material(layers) {
    const cacheKey = layers.join('|');
    if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
    const image = document.createElement('canvas');
    image.width = image.height = 16;
    const ctx = image.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const result = new THREE.MeshLambertMaterial({ map: texture });
    let lastFrame = '';
    const paint = ticks => {
      const frames = layers.map(key => animationFrame(manifest.textures[key], ticks));
      const signature = frames.join(',');
      if (signature === lastFrame) return;
      lastFrame = signature;
      ctx.clearRect(0, 0, 16, 16);
      layers.forEach((key, index) => {
        const source = images.get(key);
        const size = manifest.textures[key].width;
        ctx.drawImage(source, 0, frames[index] * size, size, size, 0, 0, 16, 16);
      });
      texture.needsUpdate = true;
    };
    paint(0);
    if (layers.some(key => manifest.textures[key].frames.length > 1)) animatedFaces.push(paint);
    materialCache.set(cacheKey, result);
    return result;
  }

  const materials = new Map(config.machines.map(profile => [profile.modelId, {
    idle: FACE_NAMES.map(face => material(manifest.profiles[profile.modelId][face].idle)),
    active: FACE_NAMES.map(face => material(manifest.profiles[profile.modelId][face].active)),
  }]));
  const machines = new THREE.Group();
  scene.add(machines);
  const slots = new Map(config.machines.map((profile, index) => {
    const x = 74 + index % 3 * 6;
    const z = 75 + Math.floor(index / 3) * 8;
    let y = 0;
    while (world.get(x, y, z)) y++;
    return [profile.modelId, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)];
  }));
  const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(cube), new THREE.LineBasicMaterial({
    color: 0xe2b961, transparent: true, opacity: 0.85,
  }));
  highlight.scale.setScalar(1.07);
  highlight.visible = false;
  highlight.renderOrder = 4;
  scene.add(highlight);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xcfd4d9, transparent: true, opacity: 0.45 });
  const particles = new THREE.InstancedMesh(cube, particleMaterial, config.machines.length * 4);
  particles.frustumCulled = false;
  particles.count = 0;
  scene.add(particles);
  let states = [];
  let animate = true;
  let active = true;
  let visible = true;
  let dirty = true;
  let selected = null;
  let signature = '';
  let frame = 0;
  let previous = performance.now();
  let animationTime = 0;
  const matrix = new THREE.Matrix4();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const keys = new Set();
  let pointerStart = null;

  function labels() {
    camera.updateMatrixWorld();
    onProject(states.filter(state => state.count > 0).map(state => {
      const point = slots.get(state.id).clone().add(new THREE.Vector3(0, 0.85, 0)).project(camera);
      return { id: state.id, x: (point.x + 1) * 50, y: (1 - point.y) * 50,
        visible: camera.position.distanceTo(slots.get(state.id)) < 85 && point.z > -1 && point.z < 1 && Math.abs(point.x) < 0.98 && Math.abs(point.y) < 0.98 };
    }));
  }

  function select(id) {
    selected = id;
    highlight.visible = !!id && states.some(state => state.id === id && state.count > 0);
    if (highlight.visible) highlight.position.copy(slots.get(id));
    dirty = true;
  }

  function update(next, animated) {
    states = next;
    animate = animated;
    const nextSignature = next.map(state => `${state.id}:${Math.min(config.visiblePerModel, state.count)}:${state.activity > 0 ? Math.min(config.visiblePerModel, state.running) : 0}`).join('|');
    if (signature !== nextSignature) {
      for (const child of [...machines.children]) { machines.remove(child); child.dispose(); }
      for (const state of next) {
        const count = Math.min(config.visiblePerModel, state.count);
        const running = state.activity > 0 ? Math.min(count, state.running) : 0;
        for (const [mode, start, size] of [['active', 0, running], ['idle', running, count - running]]) {
          if (!size) continue;
          const mesh = new THREE.InstancedMesh(cube, materials.get(state.id)[mode], size);
          mesh.userData.modelId = state.id;
          for (let index = 0; index < size; index++) {
            const offset = start + index;
            const position = slots.get(state.id).clone();
            if (count > 1) {
              position.x += (offset % 3 - 1) * 1.35;
              position.z += Math.floor(offset / 3) * 1.35;
              const x = Math.floor(position.x), z = Math.floor(position.z);
              let y = 0;
              while (world.get(x, y, z)) y++;
              position.y = y + 0.5;
            }
            matrix.makeTranslation(position.x, position.y, position.z);
            mesh.setMatrixAt(index, matrix);
          }
          mesh.computeBoundingSphere();
          machines.add(mesh);
        }
      }
      signature = nextSignature;
    }
    select(selected);
    labels();
    dirty = true;
  }

  function lookAt(target, offset) {
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.target.copy(target);
    camera.position.copy(target).add(offset);
    controls.update();
    controls.enableDamping = damping;
    labels();
    dirty = true;
  }
  function reset() { lookAt(new THREE.Vector3(80.5, 1.2, 79.5), new THREE.Vector3(9, 10, 17)); }
  function focus(id) {
    const slot = slots.get(id);
    if (!slot) return;
    select(id);
    lookAt(slot, new THREE.Vector3(2.8, 2.1, 3.8));
  }
  function overview() { lookAt(new THREE.Vector3(160, 0, 160), new THREE.Vector3(145, 280, 310)); }
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = true;
    labels();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const changed = () => { dirty = true; labels(); };
  controls.addEventListener('change', changed);
  const pointerDown = event => {
    canvas.focus({ preventScroll: true });
    pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
  };
  const pointerUp = event => {
    if (!pointerStart || pointerStart.button !== 0 || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return;
    pointerStart = null;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(machines.children, false)[0];
    if (hit) { select(hit.object.userData.modelId); onSelect(hit.object.userData.modelId); }
  };
  const keyDown = event => {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'r'].includes(key)) {
      event.preventDefault();
      keys.add(key);
      if (key === 'r') reset();
    }
  };
  const keyUp = event => keys.delete(event.key.toLowerCase());
  const clearKeys = () => keys.clear();
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('keydown', keyDown);
  canvas.addEventListener('keyup', keyUp);
  canvas.addEventListener('blur', clearKeys);
  window.addEventListener('blur', clearKeys);
  const visibility = () => { previous = performance.now(); keys.clear(); dirty = true; };
  document.addEventListener('visibilitychange', visibility);

  function render(stamp) {
    if (!active) return;
    frame = requestAnimationFrame(render);
    const delta = Math.min((stamp - previous) / 1000, 0.06);
    if (stamp - previous < 1000 / 30) return;
    previous = stamp;
    if (!visible || document.hidden) return;
    if (keys.size) {
      const direction = camera.getWorldDirection(new THREE.Vector3());
      direction.y = 0;
      direction.normalize();
      const right = new THREE.Vector3().crossVectors(direction, camera.up).normalize();
      const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      const side = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      const lift = Number(keys.has(' ')) - Number(keys.has('shift'));
      const speed = Math.max(3, camera.position.distanceTo(controls.target) * 0.5) * delta;
      const move = direction.multiplyScalar(forward).addScaledVector(right, side).addScaledVector(camera.up, lift).multiplyScalar(speed);
      camera.position.add(move);
      controls.target.add(move);
      dirty = true;
    }
    controls.update();
    if (animate) {
      animationTime += delta;
      animatedFaces.forEach(paint => paint(Math.floor(animationTime * 20)));
      let count = 0;
      for (const state of states) {
        if (!state.running || state.activity <= 0 || state.category !== 'generator') continue;
        for (let index = 0; index < 4; index++) {
          const t = (animationTime * 0.5 + index / 4) % 1;
          const slot = slots.get(state.id);
          const scale = 0.06 + t * 0.13;
          matrix.makeScale(scale, scale, scale);
          matrix.setPosition(slot.x + Math.sin(t * 5 + index) * 0.13, slot.y + 0.6 + t * 1.8, slot.z - 0.15);
          particles.setMatrixAt(count++, matrix);
        }
      }
      particles.count = count;
      particles.instanceMatrix.needsUpdate = true;
      dirty = true;
    } else if (particles.count) { particles.count = 0; dirty = true; }
    if (dirty) { renderer.render(scene, camera); labels(); dirty = false; }
  }

  reset();
  resize();
  frame = requestAnimationFrame(render);
  return {
    update, select, focus, reset, overview,
    setVisible(value) { visible = value; previous = performance.now(); dirty = true; if (!value) keys.clear(); },
    dispose() {
      active = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.removeEventListener('change', changed);
      controls.dispose();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('blur', clearKeys);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', visibility);
      const geometries = new Set(), allMaterials = new Set(), textures = new Set([atlas.texture]);
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => allMaterials.add(item));
        if (object.isInstancedMesh) object.dispose();
      });
      for (const item of materialCache.values()) allMaterials.add(item);
      for (const item of allMaterials) { if (item.map) textures.add(item.map); item.dispose(); }
      geometries.forEach(item => item.dispose());
      textures.forEach(item => item.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      images.clear();
      world.blocks.clear();
    },
  };
}
