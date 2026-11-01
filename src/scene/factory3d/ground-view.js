import * as THREE from 'three';
import { BlockWorld, FLOOR_LAYERS } from './blocks.js';
import { placeFloor } from './floor-layout.js';
import { meshWorld } from './mesher.js';
import { GROUND_MATERIALS, groundCell, createGround } from './ground';
import { createTerrainView } from './terrain-view';

const BLUEPRINT_OFFSET = 72;
const SPAN = 4096;

export function createGroundView(scene, atlas) {
  const root = new THREE.Group();
  root.name = 'machine-ground';
  scene.add(root);
  const terrain = createTerrainView(root);
  let updateVersion = 0;
  const world = new BlockWorld();
  let blueprint = null;
  let design = createGround();
  const textures = new Map();
  const materials = new Map();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const tileGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const edits = new THREE.Group();
  root.add(edits);
  function textureFor(id) {
    if (textures.has(id)) return textures.get(id);
    const material = GROUND_MATERIALS.find(item => item.id === id);
    const rectangle = atlas.uv.get(material.texture);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    canvas.getContext('2d').drawImage(atlas.canvas,
      rectangle.u0 * atlas.canvas.width, (1 - rectangle.v1) * atlas.canvas.height, 16, 16, 0, 0, 16, 16);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    textures.set(id, texture);
    return texture;
  }
  function materialFor(id, floor) {
    const key = `${id}:${floor}`;
    if (materials.has(key)) return materials.get(key);
    const map = textureFor(id);
    const material = floor
      ? new THREE.MeshBasicMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      : new THREE.MeshLambertMaterial({ map, emissive: id.startsWith('froglight') ? 0x555555 : 0x000000 });
    materials.set(key, material);
    return material;
  }
  const pattern = document.createElement('canvas');
  pattern.width = pattern.height = 256;
  const context = pattern.getContext('2d');
  context.imageSmoothingEnabled = false;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    context.drawImage(textureFor(groundCell(x, z)).image, x * 16, z * 16);
  }
  const gridTexture = new THREE.CanvasTexture(pattern);
  gridTexture.colorSpace = THREE.SRGBColorSpace;
  gridTexture.wrapS = gridTexture.wrapT = THREE.RepeatWrapping;
  gridTexture.magFilter = THREE.NearestFilter;
  gridTexture.minFilter = THREE.LinearMipmapLinearFilter;
  gridTexture.repeat.set(SPAN / 16, SPAN / 16);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: gridTexture }));
  grid.userData.groundKind = 'floor';
  root.add(grid);
  const cursor = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.015, 1.015, 1.015)),
    new THREE.LineBasicMaterial({ color: 0x287e58, depthTest: false, transparent: true, opacity: 0.9 }));
  cursor.visible = false;
  cursor.renderOrder = 10;
  scene.add(cursor);

  function ensureBlueprint() {
    if (blueprint) return;
    placeFloor(world);
    blueprint = new THREE.Group();
    blueprint.position.set(-BLUEPRINT_OFFSET, 0, -BLUEPRINT_OFFSET);
    const material = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.02 });
    for (const part of meshWorld(world, atlas).meshes) {
      const mesh = new THREE.Mesh(part.geo, material);
      mesh.userData.groundKind = 'floor';
      blueprint.add(mesh);
    }
    root.add(blueprint);
    scene.updateMatrixWorld(true);
  }
  function surface(x, z, width = 1, depth = 1) {
    if (design.preset === 'grid') return 0;
    if (design.preset === 'imported') return terrain.surface(x, z, width, depth);
    let height = 0;
    for (let dx = 0; dx < width; dx++) for (let dz = 0; dz < depth; dz++) {
      for (let y = FLOOR_LAYERS - 1; y >= 0; y--) {
        if (!world.get(Math.floor(x + dx) + BLUEPRINT_OFFSET, y, Math.floor(z + dz) + BLUEPRINT_OFFSET)) continue;
        height = Math.max(height, y + 1);
        break;
      }
    }
    return height;
  }
  function clearEdits() {
    for (const mesh of [...edits.children]) { mesh.removeFromParent(); mesh.dispose(); }
  }
  async function update(next, structure) {
    const version = ++updateVersion;
    if (next.preset === 'imported') {
      if (!structure) throw new Error('此预设的蓝图数据缺失，请重新导入场地文件。');
      await terrain.loadTexture();
      if (version !== updateVersion) return false;
    }
    design = next;
    if (design.preset === 'preset-1') ensureBlueprint();
    if (design.preset === 'imported') terrain.build(structure); else terrain.clear();
    grid.visible = design.preset !== 'preset-1';
    if (blueprint) blueprint.visible = design.preset === 'preset-1';
    clearEdits();
    const groups = new Map();
    for (const [key, id] of Object.entries(design.cells)) {
      const [x, y, z] = key.split(',').map(Number);
      const groupKey = `${id}:${y === -1}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { id, floor: y === -1, cells: [] });
      groups.get(groupKey).cells.push({ x, y, z });
    }
    const matrix = new THREE.Matrix4();
    for (const group of groups.values()) {
      const mesh = new THREE.InstancedMesh(group.floor ? tileGeometry : geometry, materialFor(group.id, group.floor), group.cells.length);
      mesh.userData.groundKind = group.floor ? 'floor-edit' : 'block';
      mesh.userData.cells = group.cells;
      group.cells.forEach((cell, index) => {
        matrix.makeTranslation(cell.x + 0.5, surface(cell.x, cell.z) + (group.floor ? 0.003 : cell.y + 0.5), cell.z + 0.5);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.computeBoundingSphere();
      edits.add(mesh);
    }
    cursor.visible = false;
    root.updateMatrixWorld(true);
    return true;
  }
  function pick(raycaster, editor) {
    const hit = raycaster.intersectObjects(root.children.filter(child => child.visible), true)[0];
    if (!hit) return null;
    let x = Math.floor(hit.point.x), z = Math.floor(hit.point.z), y = editor.tool === 'floor' ? -1 : editor.layer;
    if (hit.object.userData.groundKind === 'block' && editor.tool !== 'floor') {
      const cell = hit.object.userData.cells[hit.instanceId];
      ({ x, y, z } = cell);
      if (editor.tool === 'block') {
        x += Math.round(hit.face.normal.x);
        y += Math.round(hit.face.normal.y);
        z += Math.round(hit.face.normal.z);
      }
    } else if (editor.tool === 'erase') y = -1;
    return { x, y, z, material: editor.tool === 'erase' ? null : editor.material };
  }
  function showCursor(edit, allowed = true) {
    cursor.visible = !!edit;
    if (!edit) return;
    cursor.position.set(edit.x + 0.5, surface(edit.x, edit.z) + (edit.y === -1 ? 0.015 : edit.y + 0.5), edit.z + 0.5);
    cursor.scale.set(1, edit.y === -1 ? 0.015 : 1, 1);
    cursor.material.color.setHex(!allowed || edit.material === null ? 0xb84148 : 0x287e58);
  }
  return {
    root, surface, update, pick, showCursor,
    frame(camera) {
      // 只移动一张重复平面；移动距离不会增加地块、纹理或几何体数量。
      const span = Math.ceil(Math.max(SPAN, camera.far * 4) / 32) * 32;
      grid.scale.set(span / SPAN, 1, span / SPAN); gridTexture.repeat.set(span / 16, span / 16);
      grid.position.set(Math.floor(camera.position.x / 16) * 16, design.preset === 'imported' ? -0.006 : 0, Math.floor(camera.position.z / 16) * 16);
      grid.updateMatrixWorld();
    },
    dispose() {
      updateVersion++;
      clearEdits();
      terrain.dispose();
      geometry.dispose(); tileGeometry.dispose(); grid.geometry.dispose(); grid.material.dispose(); gridTexture.dispose();
      if (blueprint) {
        const ownedMaterials = new Set();
        for (const mesh of blueprint.children) { mesh.geometry.dispose(); ownedMaterials.add(mesh.material); }
        ownedMaterials.forEach(material => material.dispose());
      }
      textures.forEach(texture => texture.dispose());
      materials.forEach(material => material.dispose());
      cursor.geometry.dispose(); cursor.material.dispose(); cursor.removeFromParent(); root.removeFromParent();
      world.blocks.clear();
    },
  };
}
