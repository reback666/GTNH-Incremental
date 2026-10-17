// Side-by-side comparison of the two floor collapse rules, using the real
// extracted textures: left = old "highest level" rule, right = current
// "material rank" rule. Written so the difference can be seen without opening
// the demo.
//
// Usage: node tools/floor-compare.mjs <map-top.png> <map-rank.png> <out.png> [width]
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported png bd=${bd} ct=${ct}`);
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, bpp, data: out };
}
function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const o = Buffer.alloc(12 + data.length);
  o.writeUInt32BE(data.length, 0); o.write(type, 4, "ascii"); data.copy(o, 8);
  o.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return o;
}
function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const [, , aPath, bPath, outPath, widthArg] = process.argv;
const a = decodePng(readFileSync(resolve(aPath)));
const b = decodePng(readFileSync(resolve(bPath)));
const W = Number(widthArg) || 720;
const GAP = 12;
const H = W;
const out = Buffer.alloc((W * 2 + GAP) * H * 4);
for (let i = 0; i < (W * 2 + GAP) * H; i++) { out[i * 4] = 24; out[i * 4 + 1] = 24; out[i * 4 + 2] = 32; out[i * 4 + 3] = 255; }
function blit(img, dx) {
  for (let y = 0; y < H; y++) {
    const sy = Math.min(img.h - 1, Math.floor((y / H) * img.h));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(img.w - 1, Math.floor((x / W) * img.w));
      const s = (sy * img.w + sx) * img.bpp;
      const d = (y * (W * 2 + GAP) + dx + x) * 4;
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = 255;
    }
  }
}
blit(a, 0);
blit(b, W + GAP);
writeFileSync(resolve(outPath), encodePng(out, W * 2 + GAP, H));
console.log(`wrote ${outPath} (${W * 2 + GAP}x${H}) — left: --rule=top (old), right: --rule=rank (current)`);
