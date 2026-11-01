import * as THREE from 'three';
import { FACE_DEF, FACE_ORDER, FACE_SHADE } from './blocks.js';
import atlasUrl from '../../assets/factory3d/terrain-atlas.png';
import { decodeGroundCells } from './ground-structure';
import { terrainBlock, terrainManifest } from './terrain-catalog';

export function createTerrainView(root) {
  const group = new THREE.Group(); root.add(group);
  let current = null, texture = null, loading = null;
  let disposed = false;
  let heights = null, originX = 0, originZ = 0, size = [0, 0, 0];
  const materials = [];
  const missingMaterial = new THREE.MeshBasicMaterial({ color: 0xe654a5, wireframe: true });
  function loadTexture() {
    loading ??= new THREE.TextureLoader().loadAsync(atlasUrl).then(value => {
      if (disposed) { value.dispose(); return; }
      texture = value; texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
      materials.push(new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, alphaTest: 0.02 }),
        new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, alphaTest: 0.02, transparent: true, depthWrite: false }));
    });
    return loading;
  }
  function clear() {
    for (const mesh of [...group.children]) { mesh.geometry.dispose(); mesh.removeFromParent(); }
    current = null; heights = null; group.visible = false;
  }
  function build(structure) {
    if (current === structure) { group.visible = true; return; }
    clear(); current = structure; size = structure.size;
    originX = 8 - Math.floor(size[0] / 2); originZ = 8 - Math.floor(size[2] / 2);
    const cells = decodeGroundCells(structure);
    const palette = structure.palette.map(state => terrainBlock(state, structure.overrides));
    heights = new Float32Array(size[0] * size[2]);
    const buffers = [0, 1, 2].map(() => ({ position: [], uv: [], color: [], index: [] }));
    let faces = 0;
    const indices = [0, 1, 2, 0, 2, 3];
    const at = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]
      ? 0 : cells[x + z * size[0] + y * size[0] * size[2]];
    for (let index = 0; index < cells.length; index++) {
      const paletteId = cells[index];
      if (!paletteId) continue;
      const descriptor = palette[paletteId];
      if (descriptor === 'skip') continue;
      const x = index % size[0], z = Math.floor(index / size[0]) % size[2], y = Math.floor(index / (size[0] * size[2]));
      const boxes = descriptor?.boxes ?? [[0, 0, 0, 1, 1, 1]];
      const buffer = buffers[descriptor === null ? 2 : descriptor.transparent ? 1 : 0];
      heights[x + z * size[0]] = Math.max(heights[x + z * size[0]], y + Math.max(...boxes.map(box => box[4])));
      for (const box of boxes) for (const face of FACE_ORDER) {
        const definition = FACE_DEF[face], normal = definition.n;
        const edge = normal[0] > 0 ? box[3] === 1 : normal[0] < 0 ? box[0] === 0
          : normal[1] > 0 ? box[4] === 1 : normal[1] < 0 ? box[1] === 0 : normal[2] > 0 ? box[5] === 1 : box[2] === 0;
        const neighbor = palette[at(x + normal[0], y + normal[1], z + normal[2])];
        if (edge && neighbor && neighbor !== 'skip' && neighbor.full) continue;
        if (++faces > 250_000) { clear(); throw new Error('场地可见表面超过 25 万面，请缩小选区或减少零散方块。'); }
        const tile = descriptor ? terrainManifest.textures[descriptor.faces[face]] : { x: 1, y: 1 };
        const first = buffer.position.length / 3;
        for (const corner of definition.c) {
          const px = box[0] + corner[0] * (box[3] - box[0]), py = box[1] + corner[1] * (box[4] - box[1]), pz = box[2] + corner[2] * (box[5] - box[2]);
          buffer.position.push(originX + x + px, y + py, originZ + z + pz);
          const u = face === 0 ? 1 - pz : face === 1 ? pz : face === 5 ? 1 - px : px;
          const v = face === 2 ? 1 - pz : face === 3 ? pz : py;
          buffer.uv.push((tile.x + u * 16) / terrainManifest.width, 1 - (tile.y + (1 - v) * 16) / terrainManifest.height);
          const shade = FACE_SHADE[face]; buffer.color.push(shade, shade, shade);
        }
        for (const vertex of indices) buffer.index.push(first + vertex);
      }
    }
    buffers.forEach((buffer, index) => {
      if (!buffer.position.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.position, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uv, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.color, 3));
      geometry.setIndex(buffer.index); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, index === 2 ? missingMaterial : materials[index]);
      mesh.userData.groundKind = 'terrain'; group.add(mesh);
    });
    group.visible = true; root.updateMatrixWorld(true);
  }
  return {
    loadTexture, build, clear,
    surface(x, z, width = 1, depth = 1) {
      if (!heights) return 0;
      let height = 0;
      for (let dx = 0; dx < width; dx++) for (let dz = 0; dz < depth; dz++) {
        const column = Math.floor(x + dx) - originX, row = Math.floor(z + dz) - originZ;
        if (column >= 0 && row >= 0 && column < size[0] && row < size[2]) height = Math.max(height, heights[column + row * size[0]]);
      }
      return height;
    },
    bounds() { return current ? { minX: originX, minZ: originZ, maxX: originX + size[0], maxZ: originZ + size[2], maxY: size[1] } : null; },
    dispose() { disposed = true; clear(); materials.forEach(material => material.dispose()); missingMaterial.dispose(); texture?.dispose(); group.removeFromParent(); },
  };
}
