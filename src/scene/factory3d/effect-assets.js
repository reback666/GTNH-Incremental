import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import manifest from '../../assets/factory3d/effects-manifest.json';
import { createNativeAtlas } from './native-geometry';

const pngs = import.meta.glob('../../assets/factory3d/effects/*.png', {
  eager: true, query: '?url', import: 'default',
});
const objs = import.meta.glob('../../assets/factory3d/effects/*.obj', {
  eager: true, query: '?raw', import: 'default',
});

function readImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`多方块特效纹理无法读取：${file}`));
    const url = pngs[`../../assets/factory3d/${file}`];
    if (!url) { reject(new Error(`缺少多方块特效纹理：${file}`)); return; }
    image.src = url;
  });
}

export async function loadMultiblockAssets(maxTextureSize) {
  const images = new Map(await Promise.all(Object.entries(manifest.textures)
    .map(async ([key, data]) => [key, await readImage(data.file)])));
  const textures = new Map();
  for (const key of [...manifest.eye.starLayers, manifest.eye.spaceTexture]) {
    const texture = new THREE.Texture(images.get(key));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    textures.set(key, texture);
  }
  const loader = new OBJLoader();
  const geometries = new Map();
  for (const [key, model] of Object.entries(manifest.models)) {
    const raw = objs[`../../assets/factory3d/${model.file}`];
    if (!raw) throw new Error(`缺少多方块特效模型：${model.file}`);
    const object = loader.parse(raw);
    const parts = [];
    object.traverse(child => {
      if (!child.isMesh) return;
      parts.push(child.geometry);
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material.dispose());
    });
    const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts);
    if (!geometry) throw new Error(`多方块特效模型为空：${key}`);
    if (parts.length > 1) parts.forEach(part => part.dispose());
    geometry.clearGroups();
    geometry.computeBoundingSphere();
    geometries.set(key, geometry);
  }
  function atlas(keys) {
    const atlasTextures = Object.fromEntries(keys.map(key => {
      const data = manifest.textures[key];
      return [key, { ...data, frameTime: 1, frames: data.frames.map(frame => ({ index: frame.index, time: frame.ticks })) }];
    }));
    return createNativeAtlas({ textures: atlasTextures }, images, maxTextureSize);
  }
  const turbineAtlas = atlas([...manifest.turbine.active, ...manifest.turbine.idle]);
  const planetAtlas = atlas(manifest.eye.orbitTextures.flat());
  return { manifest, textures, geometries, turbineAtlas, planetAtlas };
}
