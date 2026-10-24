import * as THREE from 'three';
import { FACE_DEF, FACE_ORDER } from '../../../gtnh3d/src/blocks.js';

function textureTimeline(metadata, label = '原生纹理') {
  if (!Array.isArray(metadata?.frames) || !metadata.frames.length || !(metadata.frameTime > 0)) {
    throw new Error(`${label}动画元数据无效`);
  }
  const frames = [], durations = [];
  let total = 0;
  for (const item of metadata.frames) {
    const index = typeof item === 'number' ? item : item?.index;
    const duration = typeof item === 'number' ? metadata.frameTime : item?.time ?? metadata.frameTime;
    if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(duration) || duration <= 0) {
      throw new Error(`${label}动画帧无效`);
    }
    frames.push(index);
    durations.push(duration);
    total += duration;
  }
  if (!Number.isSafeInteger(total)) throw new Error(`${label}动画周期无效`);
  return { frames, durations, total };
}

function frameAt(timeline, ticks, label) {
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error(`${label}动画时间无效`);
  let remaining = ticks % timeline.total;
  for (let index = 0; index < timeline.frames.length; index++) {
    if (remaining < timeline.durations[index]) return timeline.frames[index];
    remaining -= timeline.durations[index];
  }
  return timeline.frames[0];
}

export function animationFrame(metadata, ticks) {
  const timeline = textureTimeline(metadata);
  return frameAt(timeline, ticks, '原生纹理');
}

export function createNativeAtlas(manifest, images, maxTextureSize) {
  const entries = Object.entries(manifest.textures);
  if (!entries.length) throw new Error('原生机器纹理清单为空');
  if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1) throw new Error('原生机器图集尺寸限制无效');
  const timelines = new Map();
  for (const [key, metadata] of entries) {
    if (!Number.isSafeInteger(metadata.width) || metadata.width < 1
      || !Number.isSafeInteger(metadata.height) || metadata.height < metadata.width) {
      throw new Error(`原生纹理元数据无效：${key}`);
    }
    const timeline = textureTimeline(metadata, `原生纹理 ${key} `);
    for (const frame of new Set(timeline.frames)) {
      if ((frame + 1) * metadata.width > metadata.height) throw new Error(`原生纹理动画帧越界：${key}`);
    }
    timelines.set(key, timeline);
  }
  const tileSize = Math.max(32, ...entries.map(([, metadata]) => metadata.width));
  const cellSize = tileSize + 2;
  const columns = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
  const rows = Math.max(1, Math.ceil(entries.length / columns));
  if (Math.max(columns, rows) * cellSize > maxTextureSize) throw new Error('原生机器纹理图集超出显卡尺寸限制');
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  // 图集只写入并上传 GPU，不会读取像素；避免请求偏 CPU 的 Canvas 后端。
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建原生机器图集');
  context.imageSmoothingEnabled = false;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const tiles = new Map();
  const animated = [];

  function paint(tile, ticks) {
    const frame = frameAt(tile.timeline, ticks, `原生纹理 ${tile.key} `);
    if (tile.frame === frame) return false;
    tile.frame = frame;
    context.clearRect(tile.x - 1, tile.y - 1, cellSize, cellSize);
    context.drawImage(tile.image, 0, frame * tile.metadata.width, tile.metadata.width, tile.metadata.width,
      tile.x, tile.y, tileSize, tileSize);
    // 边缘扩一像素，避免远处或斜视时采样到相邻 tile。
    context.drawImage(canvas, tile.x, tile.y, tileSize, 1, tile.x, tile.y - 1, tileSize, 1);
    context.drawImage(canvas, tile.x, tile.y + tileSize - 1, tileSize, 1, tile.x, tile.y + tileSize, tileSize, 1);
    context.drawImage(canvas, tile.x, tile.y - 1, 1, cellSize, tile.x - 1, tile.y - 1, 1, cellSize);
    context.drawImage(canvas, tile.x + tileSize - 1, tile.y - 1, 1, cellSize, tile.x + tileSize, tile.y - 1, 1, cellSize);
    return true;
  }

  try {
    entries.forEach(([key, metadata], index) => {
      const image = images.get(key);
      if (!image) throw new Error(`原生纹理图片缺失：${key}`);
      const tile = {
        key, metadata, timeline: timelines.get(key), image,
        x: index % columns * cellSize + 1, y: Math.floor(index / columns) * cellSize + 1, frame: -1,
      };
      tile.uv = {
        u0: tile.x / canvas.width, u1: (tile.x + tileSize) / canvas.width,
        v0: 1 - (tile.y + tileSize) / canvas.height, v1: 1 - tile.y / canvas.height,
      };
      tiles.set(key, tile);
      paint(tile, 0);
      if (metadata.frames.length > 1) animated.push(tile);
    });
  } catch (error) {
    texture.dispose();
    canvas.width = canvas.height = 1;
    throw error;
  }
  texture.needsUpdate = true;
  return {
    texture, tiles,
    update(ticks, allowed = null) {
      let changed = false;
      for (const tile of animated) if ((!allowed || allowed.has(tile.key)) && paint(tile, ticks)) changed = true;
      if (changed) texture.needsUpdate = true;
      return changed;
    },
    dispose() {
      texture.dispose();
      canvas.width = canvas.height = 1;
      tiles.clear();
      animated.length = 0;
    },
  };
}

export function nativeModel(manifest, id) {
  const model = manifest.models[id];
  if (!model) throw new Error(`缺少原生机器模型：${id}`);
  if (!Array.isArray(model.size) || model.size.length !== 3 || model.size.some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error(`原生机器模型尺寸无效：${id}`);
  }
  if (!['single', 'multiblock', 'custom', 'effect'].includes(model.kind)) {
    throw new Error(`原生机器模型类型无效：${id}`);
  }
  return model;
}

function rotateNormal(normal, quarterTurns) {
  let [x, y, z] = normal;
  for (let turn = 0; turn < quarterTurns; turn++) [x, z] = [z, -x];
  return [x, y, z];
}

function rotateCorner(corner, quarterTurns) {
  let x = corner[0] - 0.5;
  let z = corner[2] - 0.5;
  for (let turn = 0; turn < quarterTurns; turn++) [x, z] = [z, -x];
  return [x + 0.5, corner[1], z + 0.5];
}

function applyFacing(vector, facing) {
  const [x, y, z] = vector;
  if (facing === 'UP') return [x, z, -y];
  if (facing === 'DOWN') return [x, -z, y];
  return vector;
}

// 自定义网格回调接收 { id, model, mode, tiles }，返回已使用图集 UV 的 BufferGeometry。
// 网格与方块结构共用局部原点、完整 size、材质、实例和拾取流程；生命周期归本视图管理。
export function createModelGeometry(manifest, id, mode, atlas, meshGeometry) {
  const model = nativeModel(manifest, id);
  const custom = meshGeometry?.({ id, model, mode, tiles: atlas.tiles });
  if (custom != null) {
    if (!custom.isBufferGeometry || !custom.getAttribute('position') || !custom.getAttribute('uv')) {
      throw new Error(`自定义机器网格无效：${id}（${mode}）`);
    }
    custom.clearGroups();
    if (!custom.getAttribute('normal')) custom.computeVertexNormals();
    custom.computeBoundingBox();
    custom.computeBoundingSphere();
    return custom;
  }
  if (!Array.isArray(model.blocks) || !model.blocks.length) throw new Error(`原生机器模型没有几何数据：${id}`);
  const blocks = new Map();
  for (const block of model.blocks) {
    if (!Array.isArray(block) || (block.length !== 4 && block.length !== 5 && block.length !== 6)) {
      throw new Error(`原生机器方块定义无效：${id}`);
    }
    const [x, y, z, typeId, rawTurns = 0, facing = 'SOUTH'] = block;
    const coordinates = [x, y, z];
    const key = coordinates.join(',');
    const type = manifest.types[typeId];
    const faces = type?.[mode];
    const quarterTurns = rawTurns ?? 0;
    if (coordinates.some((value, axis) => !Number.isInteger(value) || value < 0 || value >= model.size[axis])
      || blocks.has(key) || typeof type?.opaque !== 'boolean' || faces?.length !== 6
      || !Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3
      || !['SOUTH', 'UP', 'DOWN'].includes(facing)) {
      throw new Error(`原生机器方块定义无效：${id} / ${key} / ${typeId}`);
    }
    for (const textureKey of faces) if (!atlas.tiles.has(textureKey)) throw new Error(`原生机器面纹理缺失：${id} / ${textureKey}`);
    blocks.set(key, { coordinates, faces, opaque: type.opaque, quarterTurns, facing });
  }
  const positions = [], normals = [], uvs = [], indices = [];
  for (const { coordinates: [x, y, z], faces, opaque, quarterTurns, facing } of blocks.values()) {
    for (const sourceFace of FACE_ORDER) {
      const definition = FACE_DEF[sourceFace];
      const normal = applyFacing(rotateNormal(definition.n, quarterTurns), facing);
      const neighbour = blocks.get([x + normal[0], y + normal[1], z + normal[2]].join(','));
      if (opaque && neighbour?.opaque) continue;
      const tile = atlas.tiles.get(faces[sourceFace]);
      const start = positions.length / 3;
      for (let index = 0; index < 4; index++) {
        const corner = applyFacing(rotateCorner(definition.c[index], quarterTurns).map((value, axis) => value - (axis === 1 ? 0.5 : 0.5)), facing).map(value => value + 0.5);
        positions.push(x + corner[0] - 0.5, y + corner[1] - 0.5, z + corner[2] - 0.5);
        normals.push(...normal);
        let [u, v] = definition.uv[index];
        for (let turn = 0; turn < quarterTurns; turn++) [u, v] = [v, 1 - u];
        uvs.push(u ? tile.uv.u1 : tile.uv.u0, v ? tile.uv.v1 : tile.uv.v0);
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCustomGeometry(manifest, id) {
  const model = manifest.models[id];
  if (!model?.meshes?.length) throw new Error(`缺少原生自定义模型：${id}`);
  const source = new Map(manifest.meshes.map(mesh => [mesh.name, mesh]));
  const positions = [], normals = [], uvs = [];
  let start = 0;
  const groups = [];
  for (let materialIndex = 0; materialIndex < model.meshes.length; materialIndex++) {
    const name = model.meshes[materialIndex];
    const mesh = source.get(name);
    if (!mesh || mesh.vertices.length % 9 || mesh.vertices.length !== mesh.normals.length
      || mesh.uv.length * 3 !== mesh.vertices.length * 2) throw new Error(`自定义原生网格无效：${id}/${name}`);
    positions.push(...mesh.vertices); normals.push(...mesh.normals); uvs.push(...mesh.uv);
    const count = mesh.vertices.length / 3;
    groups.push({ start, count, materialIndex });
    start += count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  groups.forEach(group => geometry.addGroup(group.start, group.count, group.materialIndex));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
