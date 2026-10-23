// Atlas round-trip check: reads the atlas canvas the demo actually renders with
// and compares the cell for each logical key against the source png on disk
// (decoded in Node). Any UV/rect/colour-space bug shows up as a mismatch.
//
//   node gtnh3d/tools/verify-faces.mjs

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = join(ROOT, "dist", "GTNH-3D-ULV-LV.html");
const chrome = [
  process.env.CHROME_PATH,
  join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((p) => existsSync(p));
if (!chrome) {
  console.error("✗ no Chrome found");
  process.exit(2);
}

// ---- decode a 16x16 RGBA png in Node (zlib only, no deps) ------------------
import { inflateSync } from "node:zlib";

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error(`png ${w}x${h} bd${bitDepth} ct${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(w * bpp);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + w * bpp));
    p += w * bpp;
    for (let i = 0; i < line.length; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pr) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4] = line[x * bpp];
      out[(y * w + x) * 4 + 1] = line[x * bpp + 1] ?? line[x * bpp];
      out[(y * w + x) * 4 + 2] = line[x * bpp + 2] ?? line[x * bpp];
      out[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, data: out };
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 300 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(pathToFileURL(HTML).href, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction("window.__gtnh3dReady === true", { timeout: 90000 });

// logical key -> cell origin (from the atlas the page built)
const cells = await page.evaluate(() => {
  const a = window.__gtnh3d.atlas;
  const out = {};
  for (const [k, r] of a.uv) out[k] = { u0: r.u0, v0: r.v0, u1: r.u1, v1: r.v1 };
  return { cells: out, W: a.canvas.width, H: a.canvas.height, n: a.uv.size };
});

// Every atlas cell as raw RGBA, read from the page's own atlas canvas.
const atlasCells = await page.evaluate(() => {
  const a = window.__gtnh3d.atlas;
  const ctx = a.canvas.getContext("2d");
  const out = {};
  for (const [key, r] of a.uv) {
    const x0 = Math.round(r.u0 * a.canvas.width);
    const y0 = Math.round((1 - r.v1) * a.canvas.height);
    out[key] = Array.from(ctx.getImageData(x0, y0, 16, 16).data);
  }
  return out;
});

const wanted = process.argv.slice(2);
const keys = wanted.length ? wanted : Object.keys(atlasCells).sort();

let bad = 0;
let checked = 0;
let skipped = 0;
for (const key of keys) {
  const cell = atlasCells[key];
  if (!cell) {
    console.log(`  ? ${key}: not in atlas`);
    skipped++;
    continue;
  }
  const srcPath = join(ROOT, "assets", "tex", `${key}.png`);
  let src;
  try {
    src = decodePng(await readFile(srcPath));
  } catch (e) {
    console.log(`  ? ${key}: source unreadable (${e.message})`);
    skipped++;
    continue;
  }
  let diff = 0;
  let worst = 0;
  let worstTexel = "";
  for (let i = 0; i < 16 * 16 * 4; i += 4) {
    const texel = `${(i / 4) % 16},${Math.floor(i / 4 / 16)}`;
    const srcA = src.data[i + 3];
    // Fully transparent texels have undefined RGB: the browser normalises them
    // (typically to 0,0,0,0), so only alpha is comparable there.
    const chan = srcA === 0 ? [i + 3] : [i, i + 1, i + 2, i + 3];
    for (const c of chan) {
      const d = Math.abs(cell[c] - src.data[c]);
      // canvas 2D round-trips sRGB through 8-bit premultiplication: +-1 is expected
      if (d > 1) {
        diff++;
        if (d > worst) {
          worst = d;
          worstTexel = `texel (${texel}) chan ${"rgba"[c - i]} atlas ${cell[c]} vs src ${src.data[c]}`;
        }
      }
    }
  }
  checked++;
  if (diff) {
    bad++;
    console.log(`  ✗ ${key}: ${diff} channels differ (max ${worst}) — ${worstTexel}`);
  }
}

console.log(`\natlas ${cells.W}x${cells.H} · ${cells.n} keys · compared ${checked} · mismatched ${bad} · skipped ${skipped}`);
if (errors.length) console.log("page errors:", errors.join(" | "));
await browser.close();
console.log(bad === 0 && skipped === 0 ? "✓ atlas matches every source png\n" : "✗ atlas verification failed\n");
process.exit(bad === 0 && skipped === 0 ? 0 : 1);
