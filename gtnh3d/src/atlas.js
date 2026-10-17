// Packs the imported 16x16 block textures into one atlas texture so the whole
// factory renders with a single material / draw call.

import * as THREE from "three";

const CELL = 16;

// Two lookup tables, because voxel specs carry the imported texture URL (the
// bundler inlines every png as a data URL) rather than the logical key:
//   uv    : logical key -> atlas rect   (the public/authoring interface)
//   bySrc : texture URL -> atlas rect   (what the mesher looks up)
let bySrc = new Map();
export const atlasRectFor = (src) => bySrc.get(src) || null;

export async function buildAtlas(sources) {
  const keys = Object.keys(sources).sort();
  const n = keys.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rects = new Map();
  await Promise.all(
    keys.map(async (key, i) => {
      const img = await loadImage(sources[key]);
      const cx = (i % cols) * CELL;
      const cy = Math.floor(i / cols) * CELL;
      ctx.drawImage(img, cx, cy, CELL, CELL);
      if (img.close) img.close();
      rects.set(key, [cx, cy]);
    })
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  // Two lookup tables, because voxel specs carry the imported texture URL (the
  // bundler inlines every png as a data URL) rather than the logical key.
  const uv = new Map();
  bySrc = new Map();
  const texW = canvas.width;
  const texH = canvas.height;
  for (const [key, [cx, cy]] of rects) {
    const rect = {
      u0: cx / texW,
      v1: 1 - cy / texH, // top edge in v space (canvas y grows down)
      u1: (cx + CELL) / texW,
      v0: 1 - (cy + CELL) / texH, // bottom edge
    };
    uv.set(key, rect);
    bySrc.set(sources[key], rect);
  }
  return { texture, uv, bySrc, cells: { cols, rows, CELL, count: n }, canvas };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("texture failed to decode"));
    img.src = src;
  });
}
