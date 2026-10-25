import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import manifest from '../src/assets/factory3d/native-manifest.json';
import { createMultiblockEffects, effectAnchor, effectRunning, eyeDetail, modelCenterOffset,
  multiblockEffectKind, turbineGeometry, TURBINE_EFFECT_IDS } from '../src/scene/factory3d/multiblock-effects.js';

describe('多方块运行特效', () => {
  it('仅鸿蒙之眼和四种有控制器转子的涡轮使用新增特效', () => {
    expect(multiblockEffectKind('g-max-mb-blackhole')).toBe('eye');
    expect(TURBINE_EFFECT_IDS.size).toBe(4);
    for (const id of TURBINE_EFFECT_IDS) expect(multiblockEffectKind(id)).toBe('turbine');
    expect(multiblockEffectKind('g-iv-mb-steam')).toBeNull();
    expect(multiblockEffectKind('g-uxv-mb-annihilation')).toBeNull();
  });

  it('宇宙位于结构中心，涡轮紧贴控制器所在的整片正面', () => {
    const eye = manifest.models['g-max-mb-blackhole'];
    expect(modelCenterOffset(eye)).toEqual([16, 16, 16]);
    expect(effectAnchor(eye, 'eye')).toEqual([0, 0, 0]);
    for (const id of TURBINE_EFFECT_IDS) {
      const model = manifest.models[id];
      const [x, y, z] = effectAnchor(model, 'turbine');
      expect([x, y]).toEqual([0, 0]);
      expect(z).toBeCloseTo(model.size[2] / 2 + 0.001);
    }
  });

  it('停机、断供及非运行实例不播放生产特效', () => {
    const state = { count: 4, running: 2, activity: 1 };
    expect([0, 1, 2, 3].map(index => effectRunning(state, index))).toEqual([true, true, false, false]);
    expect(effectRunning({ ...state, activity: 0 }, 0)).toBe(false);
    expect(effectRunning({ ...state, running: 0 }, 0)).toBe(false);
  });

  it('远景简化宇宙层次，超出显示范围不更新细节', () => {
    expect(eyeDetail(60)).toBe(2);
    expect(eyeDetail(150)).toBe(1);
    expect(eyeDetail(300)).toBe(0);
  });

  it('九格覆盖层形成一个完整的三乘三平面且图集 UV 正确', () => {
    const keys = Array.from({ length: 9 }, (_, index) => String(index));
    const tiles = new Map(keys.map((key, index) => [key, { uv: { u0: index / 9, u1: (index + 1) / 9, v0: 0, v1: 1 } }]));
    const geometry = turbineGeometry(keys, { tiles });
    expect(geometry.boundingBox.min).toEqual(new THREE.Vector3(-1.5, -1.5, 0));
    expect(geometry.boundingBox.max).toEqual(new THREE.Vector3(1.5, 1.5, 0));
    expect(geometry.getAttribute('position').count).toBe(36);
    expect(geometry.index.count).toBe(54);
    expect(geometry.getAttribute('uv').getX(0)).toBe(0);
    expect(geometry.getAttribute('uv').getX(33)).toBe(1);
    geometry.dispose();
  });

  it('批量复用宇宙网格，动态关闭保持静态姿态，停机和筛选移除效果', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1000);
    camera.position.set(0, 0, 70);
    camera.lookAt(0, 0, 0);
    const keys = Array.from({ length: 9 }, (_, index) => String(index));
    const tile = { uv: { u0: 0, u1: 1, v0: 0, v1: 1 } };
    const assets = {
      manifest: {
        turbine: { idle: keys, active: keys },
        eye: { spaceTexture: 'space', starLayers: ['star0', 'star1', 'star2'], orbitTextures: [Array(6).fill('planet')], parameters: {
          spaceInward: false, spaceScale: 1, starBaseScale: 1, layerGrowth: 1.04,
          layerAlphas: [1, 0.4, 0.2], baseAngles: [130, -49, 67], rotationDegreesPerSecond: 15.625,
          orbits: [{ texture: 0, distance: 8, scale: 0.5, zAngle: 0.2, xAngle: 0.1, speed: 0.3, spin: 0.7 }],
        } },
      },
      textures: new Map(['space', 'star0', 'star1', 'star2', 'planet'].map(key => [key, new THREE.Texture()])),
      geometries: new Map(['star', 'space'].map(key => [key, new THREE.SphereGeometry(1, 8, 6)])),
      turbineAtlas: { tiles: new Map(keys.map(key => [key, tile])), texture: new THREE.Texture(), update: () => false, dispose() { this.texture.dispose(); } },
      planetAtlas: { tiles: new Map([['planet', tile]]), texture: new THREE.Texture(), dispose() { this.texture.dispose(); } },
    };
    const effects = createMultiblockEffects(scene, assets);
    const state = { id: 'g-max-mb-blackhole', count: 100, running: 100, activity: 1 };
    const placement = () => ({ model: manifest.models[state.id], position: new THREE.Vector3() });
    effects.update([state], {}, placement, () => true);
    expect(effects.frame(camera, 1, true).animated).toBe(true);
    expect(effects.metrics.eyes).toBe(100);
    expect(effects.metrics.orbits).toBe(100);
    const group = scene.getObjectByName('multiblock-running-effects');
    expect(group.children.length).toBe(5);
    const star = group.getObjectByName('eye-star-0');
    expect(star.count).toBe(100);
    const before = new Float32Array(star.instanceMatrix.array);
    expect(effects.frame(camera, 1, false).animated).toBe(false);
    expect(star.instanceMatrix.array).toEqual(before);
    effects.frame(camera, 2, true);
    expect(star.instanceMatrix.array).not.toEqual(before);
    effects.update([{ ...state, activity: 0 }], {}, placement, () => true);
    effects.frame(camera, 2, true);
    expect(effects.metrics.eyes).toBe(0);
    expect(star.visible).toBe(false);
    effects.update([state], {}, placement, () => false);
    effects.frame(camera, 2, true);
    expect(effects.metrics.eyes).toBe(0);
    effects.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
