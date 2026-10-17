// Voxel mesher: emits only visible faces, bakes Minecraft-style directional
// shading plus per-vertex ambient occlusion, and merges everything into one
// buffer geometry per (texture, emissive) group.

import * as THREE from "three";
import { FACE_DEF, FACE_ORDER, FACE_SHADE, PASS, aoNeighbours } from "./blocks.js";
import { atlasRectFor } from "./atlas.js";

const AO_LEVELS = [0.55, 0.72, 0.86, 1.0];

export function meshWorld(world, atlas, { hidden = null } = {}) {
  const groups = new Map(); // "key|emissive" -> arrays
  const isHidden = hidden || (() => false);

  const specAt = (x, y, z) => {
    if (isHidden(x, y, z)) return null;
    const e = world.blocks.get(`${x},${y},${z}`);
    return e ? e.spec : null;
  };
  const solidAt = (x, y, z) => {
    const s = specAt(x, y, z);
    return !!s && s.solid;
  };
  // Culling two touching faces that both draw the same opaque texture is
  // invisible: the seam only ever shows if a block is later removed, and the
  // machine layer is rebuilt whenever that happens.
  const sameTex = (a, b, face) => {
    if (a.pass !== PASS.OPAQUE || a.solid !== true) return false;
    if (b.pass !== PASS.OPAQUE || b.solid !== true) return false;
    if (b.tex[face] !== a.tex[face]) return false;
    return b.tint[0] === a.tint[0] && b.tint[1] === a.tint[1] && b.tint[2] === a.tint[2];
  };

  for (const entry of world.blocks.values()) {
    const { x, y, z, spec } = entry;
    if (isHidden(x, y, z)) continue;
    if (spec.hidden) continue;

    for (const f of FACE_ORDER) {
      const d = FACE_DEF[f];
      const nx = x + d.n[0];
      const ny = y + d.n[1];
      const nz = z + d.n[2];
      const neighbour = specAt(nx, ny, nz);
      if (neighbour && sameTex(spec, neighbour, f)) continue;
      if (neighbour && neighbour.solid && neighbour.pass === PASS.OPAQUE) continue;
      if (neighbour === spec) continue; // same translucent/water block: skip inner face

      const texKey = spec.tex[f];
      if (!texKey) continue;
      // Specs hold the imported png URL (data URL in the single-file build);
      // `uv` keyed by logical name is the authoring interface. Accept both.
      const uvRect = atlas.bySrc ? atlas.bySrc.get(texKey) || atlas.uv.get(texKey) : atlasRectFor(texKey);
      if (!uvRect) continue;
      const groupKey = `${texKey}|${spec.emissive}`;
      let g = groups.get(groupKey);
      if (!g) {
        g = { texKey, emissive: spec.emissive, pos: [], uv: [], col: [], idx: [] };
        groups.set(groupKey, g);
      }

      const shade = FACE_SHADE[f] + spec.emissive;
      const ao = aoNeighbours(f);
      const base = g.pos.length / 3;
      for (let i = 0; i < 4; i++) {
        const c = d.c[i];
        g.pos.push(x + c[0], y + c[1], z + c[2]);

        const uvc = d.uv[i];
        const u = uvc[0] === 0 ? uvRect.u0 : uvRect.u1;
        const v = uvc[1] === 0 ? uvRect.v0 : uvRect.v1;
        // pull UVs half a texel inside the cell to stay clear of neighbours
        const inset = 0.5 / 16 / 16;
        g.uv.push(uvc[0] === 0 ? u + inset : u - inset, uvc[1] === 0 ? v + inset : v - inset);

        const o = ao[i];
        const c1 = solidAt(x + o.side1[0], y + o.side1[1], z + o.side1[2]) ? 1 : 0;
        const c2 = solidAt(x + o.side2[0], y + o.side2[1], z + o.side2[2]) ? 1 : 0;
        const cc = solidAt(x + o.corner[0], y + o.corner[1], z + o.corner[2]) ? 1 : 0;
        const occ = c1 && c2 ? 0 : 3 - (c1 + c2 + cc);
        const light = shade * AO_LEVELS[occ];
        g.col.push(light * spec.tint[0], light * spec.tint[1], light * spec.tint[2], spec.opacity ?? 1);
      }
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const meshes = [];
  let faces = 0;
  for (const g of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(g.col, 4));
    geo.setIndex(g.idx.length > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
    geo.computeBoundingSphere();
    faces += g.idx.length / 6;
    meshes.push({ geo, texKey: g.texKey, emissive: g.emissive, opacity: g.opacity });
  }
  return { meshes, faces, groups: groups.size };
}
