// Renders the plaza the demo actually places, straight down, into a PNG.
//
// For every column it resolves the same top surface layout.js builds (the
// highest authored blueprint layer) and paints that cell with the real 16x16
// texture the renderer uses. Comparing the result with the in-browser screenshot
// is the quickest way to confirm the 3D floor is the blueprint's mosaic.
//
// Usage: node tools/floor-map.mjs [out.png]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const bin = readFileSync(join(root, "assets", "floor.bin"));
const size = bin.readUInt32LE(0);
const layers = bin.readUInt32LE(8);
const cells = bin.subarray(12, 12 + size * size * layers);
const palette = bin.subarray(12 + size * size * layers).toString("utf8").split("|");
const AIR = 3;

// texture file per palette index, mirroring FLOOR_SPECS in src/layout.js
const FLOOR_TEX = [
  "floor-gray-concrete",
  "floor-polished-diorite",
  "floor-polished-diorite-stairs",
  null, // 3 = air
  "floor-polished-granite",
  "floor-bricks",
  "floor-white-concrete",
  "floor-polished-andesite-slab",
  "floor-smooth-quartz-slab",
  "floor-yellow-terracotta",
  "floor-black-concrete",
  "floor-grass-block",
  "floor-moss-block",
  "floor-cyan-terracotta",
  "floor-verdant-froglight",
  "floor-iron-trapdoor",
  "floor-pearlescent-froglight",
];

/** Minimal decoder for the 16x16 RGBA textures the extractor produced. */
function readPng(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a png: ${path}`);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error(`${path}: need 8-bit RGBA`);
    } else if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      const x = line[i];
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

const tex = FLOOR_TEX.map((name) => (name ? readPng(join(root, "assets", "tex", `${name}.png`)) : null));

// Visible surface of the authored layers, after the source coordinate reorder.
const top = new Uint8Array(size * size);
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    let idx = AIR;
    for (let y = layers - 1; y >= 0; y--) {
      const v = cells[x + z * size + y * size * size];
      if (v !== AIR) { idx = v; break; }
    }
    top[x + z * size] = idx;
  }
}

// expand each cell's 16x16 texture, so the map is directly comparable to a render
const SCALE = 16;
const W = size * SCALE;
const out = Buffer.alloc(W * W * 4);
const counts = {};
for (let z = 0; z < size; z++) {
  for (let x = 0; x < size; x++) {
    const idx = top[x + z * size];
    counts[idx] = (counts[idx] || 0) + 1;
    const t = tex[idx] || tex[0];
    for (let py = 0; py < SCALE; py++) {
      for (let px = 0; px < SCALE; px++) {
        const src = (py * t.width + px) * 4;
        const dst = ((z * SCALE + py) * W + (x * SCALE + px)) * 4;
        out[dst] = t.data[src];
        out[dst + 1] = t.data[src + 1];
        out[dst + 2] = t.data[src + 2];
        out[dst + 3] = 255;
      }
    }
  }
}

/** Encode an RGBA buffer as a filter-0 PNG. */
function writePng(path, width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])) >>> 0, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

let crcTable = null;
function crc(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const outPath = process.argv[2] || join(root, "dist", "floor-top-map.png");
writePng(outPath, W, W, out);
const present = Object.keys(counts).map(Number).sort((a, b) => a - b);
console.log(`floor-top-map.png ${W}x${W} (${size}x${size} cells, 16x nearest)`);
console.log(`  top surfaces: ${present.length} distinct materials`);
for (const i of present) console.log(`    ${String(i).padStart(2)} ${(palette[i] || "?").padEnd(30)} ${counts[i]}`);
console.log(`  written: ${outPath}`);
