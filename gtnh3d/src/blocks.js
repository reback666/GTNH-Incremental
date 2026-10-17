// Voxel block model: specs (per-face texture + tint + flags), world storage,
// and the definition of the mcschematic-derived floor.

import { FLOOR_LAYERS, FLOOR_PALETTE, FLOOR_RLE_HEX, FLOOR_SIZE, FLOOR_TILE } from "./floor-data.js";

export const FACE = { EAST: 0, WEST: 1, UP: 2, DOWN: 3, SOUTH: 4, NORTH: 5 };
export const FACE_ORDER = [FACE.EAST, FACE.WEST, FACE.UP, FACE.DOWN, FACE.SOUTH, FACE.NORTH];

// face -> { n: normal, c: the 4 corners in CCW order seen from outside, uv: uvs }
// corner = [x, y, z] offsets; uv = [u, v] with (0,0) bottom-left of the texture.
export const FACE_DEF = {
  [FACE.EAST]: {
    n: [1, 0, 0],
    c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  [FACE.WEST]: {
    n: [-1, 0, 0],
    c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  [FACE.UP]: {
    n: [0, 1, 0],
    c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  [FACE.DOWN]: {
    n: [0, -1, 0],
    c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  [FACE.SOUTH]: {
    n: [0, 0, 1],
    c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  [FACE.NORTH]: {
    n: [0, 0, -1],
    c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
};

const OPPOSITE = {
  [FACE.EAST]: FACE.WEST,
  [FACE.WEST]: FACE.EAST,
  [FACE.UP]: FACE.DOWN,
  [FACE.DOWN]: FACE.UP,
  [FACE.SOUTH]: FACE.NORTH,
  [FACE.NORTH]: FACE.SOUTH,
};
export const oppositeFace = (f) => OPPOSITE[f];

export const PASS = { OPAQUE: 0, CUTOUT: 1, TRANSLUCENT: 2, WATER: 3 };

/** Per-face ambient-occlusion neighbour offsets, aligned with FACE_DEF corners. */
const AO_NEIGHBOURS = (() => {
  const table = {};
  for (const f of FACE_ORDER) {
    const d = FACE_DEF[f];
    const entries = [];
    for (let i = 0; i < 4; i++) {
      const p = d.c[i];
      // corner P relative to the face plane: build a tangential 2D basis.
      const axis = [0, 1, 2].filter((a) => d.n[a] === 0);
      const [a1, a2] = axis;
      const s1 = [0, 0, 0];
      const s2 = [0, 0, 0];
      s1[a1] = p[a1] === 1 ? 1 : -1;
      s2[a2] = p[a2] === 1 ? 1 : -1;
      const base = [p[0] + d.n[0], p[1] + d.n[1], p[2] + d.n[2]];
      const side1 = [base[0] + s1[0], base[1] + s1[1], base[2] + s1[2]];
      const side2 = [base[0] + s2[0], base[1] + s2[1], base[2] + s2[2]];
      const corner = [
        base[0] + s1[0] + s2[0],
        base[1] + s1[1] + s2[1],
        base[2] + s1[2] + s2[2],
      ];
      entries.push({ side1, side2, corner });
    }
    table[f] = entries;
  }
  return table;
})();

export const aoNeighbours = (f) => AO_NEIGHBOURS[f];

/** Face brightness, matching Minecraft's per-direction block shading. */
export const FACE_SHADE = {
  [FACE.UP]: 1.0,
  [FACE.DOWN]: 0.5,
  [FACE.EAST]: 0.75,
  [FACE.WEST]: 0.75,
  [FACE.SOUTH]: 0.86,
  [FACE.NORTH]: 0.86,
};

function allFaces(tex) {
  return [tex, tex, tex, tex, tex, tex];
}

/**
 * A block spec.
 * @param {object} o
 * @param {string|string[]} o.tex  texture key, or 6 keys in FACE_ORDER
 * @param {number[]} [o.tint]      RGB multiplier applied on top of the texture
 * @param {number} [o.pass]        PASS value
 * @param {boolean} [o.solid]      occludes neighbours / culls faces
 * @param {number} [o.emissive]    extra brightness (0..1) for glowing blocks
 * @param {string} [o.name]        中文名
 * @param {string} [o.nameEn]      英文名
 * @param {object} [o.meta]        arbitrary info shown in the HUD
 */
export function block(o) {
  const tex = Array.isArray(o.tex) ? o.tex.slice() : allFaces(o.tex);
  return {
    tex: tex.length === 1 ? allFaces(tex[0]) : tex,
    tint: o.tint || [1, 1, 1],
    pass: o.pass ?? PASS.OPAQUE,
    solid: o.solid ?? true,
    emissive: o.emissive ?? 0,
    name: o.name || "",
    nameEn: o.nameEn || "",
    meta: o.meta || null,
    animated: !!o.animated,
  };
}

export class BlockWorld {
  constructor() {
    /** @type {Map<string, {spec: object, x: number, y: number, z: number, front?: number, tag?: string}>} */
    this.blocks = new Map();
    this.minX = 0;
    this.maxX = 0;
    this.minY = 0;
    this.maxY = 0;
    this.minZ = 0;
    this.maxZ = 0;
  }

  static k(x, y, z) {
    return `${x},${y},${z}`;
  }

  set(x, y, z, spec, extra = {}) {
    const key = BlockWorld.k(x, y, z);
    if (!spec) {
      this.blocks.delete(key);
      return null;
    }
    const entry = { x, y, z, spec, ...extra };
    this.blocks.set(key, entry);
    // bounds only ever grow; recomputed lazily by consumers
    return entry;
  }

  get(x, y, z) {
    return this.blocks.get(BlockWorld.k(x, y, z)) || null;
  }

  specAt(x, y, z) {
    const e = this.blocks.get(BlockWorld.k(x, y, z));
    return e ? e.spec : null;
  }

  isSolid(x, y, z) {
    const e = this.blocks.get(BlockWorld.k(x, y, z));
    return !!e && e.spec.solid;
  }

  tag(x, y, z) {
    const e = this.blocks.get(BlockWorld.k(x, y, z));
    return e ? e.tag || "" : "";
  }

  /** Build a dense grid for a cuboid region; returns accessor closures. */
  region(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0 + 1;
    const dy = y1 - y0 + 1;
    const dz = z1 - z0 + 1;
    const arr = new Array(dx * dy * dz).fill(null);
    const idx = (x, y, z) => (x - x0) + (z - z0) * dx + (y - y0) * dx * dz;
    for (const e of this.blocks.values()) {
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1 || e.z < z0 || e.z > z1) continue;
      arr[idx(e.x, e.y, e.z)] = e;
    }
    return {
      dx,
      dy,
      dz,
      at: (x, y, z) =>
        x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1 ? null : arr[idx(x, y, z)],
      count: () => arr.reduce((n, e) => n + (e ? 1 : 0), 0),
    };
  }

  bounds() {
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (const e of this.blocks.values()) {
      if (e.x < mnx) mnx = e.x;
      if (e.y < mny) mny = e.y;
      if (e.z < mnz) mnz = e.z;
      if (e.x > mxx) mxx = e.x;
      if (e.y > mxy) mxy = e.y;
      if (e.z > mxz) mxz = e.z;
    }
    return { mnx, mny, mnz, mxx, mxy, mxz };
  }
}

// ---------------------------------------------------------------------------
// Blueprint floor
// ---------------------------------------------------------------------------

let floorCells = null;
/**
 * The decoded blueprint grid, every layer verbatim, front to back:
 *   index = x + z * FLOOR_SIZE + y * FLOOR_SIZE * FLOOR_SIZE
 * Palette index 3 is air (no block). This is the schematic as authored -- the
 * plaza is this tile repeated 2x2 (see layout.js), not a per-column compaction.
 */
export function floorGrid() {
  if (!floorCells) {
    const hex = FLOOR_RLE_HEX;
    const pairs = hex.length >> 1;
    const out = new Uint8Array(FLOOR_SIZE * FLOOR_SIZE * FLOOR_LAYERS);
    let at = 0;
    for (let i = 0; i < pairs; i++) {
      const value = parseInt(hex.substr(i * 2, 2), 16);
      const run = parseInt(hex.substr((++i) * 2, 2), 16);
      for (let n = 0; n < run; n++) out[at++] = value;
    }
    if (at !== out.length) {
      throw new Error(`floor rle decoded ${at} cells, expected ${out.length}`);
    }
    floorCells = out;
  }
  return floorCells;
}

/** Palette index at world column (x, z) on blueprint layer y; outside -> gray. */
export function floorIndexAt(x, z, y = FLOOR_LAYERS - 1) {
  if (x < 0 || z < 0 || x >= FLOOR_SIZE || z >= FLOOR_SIZE) return 0;
  return floorGrid()[x + z * FLOOR_SIZE + y * FLOOR_SIZE * FLOOR_SIZE];
}

/** Palette name at world column (x, z) on blueprint layer y. */
export function floorPaletteNameAt(x, z, y = FLOOR_LAYERS - 1) {
  return FLOOR_PALETTE[floorIndexAt(x, z, y)] || "gray_concrete";
}

/**
 * The blueprint is a 160x160 "7x7 large plot" module: a decorative ground
 * palette with three authored layers. It is tiled 2x2 into a 320x320 plaza
 * (see layout.js), which is what makes the floor extend in every direction.
 */
export { FLOOR_SIZE, FLOOR_TILE, FLOOR_LAYERS };
