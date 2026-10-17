// Open the built demo exactly as the user does -- first frame, default camera,
// no pose applied -- and report what the floor actually contains, so "looks the
// same as before" can be checked against data instead of impression.
//
// Usage: node tools/shot-default.mjs [htmlPath] [outPng]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "dist", "GTNH-3D-ULV-LV.html");
const out = process.argv[3] ? resolve(process.argv[3]) : join(ROOT, "dist", "shots", "default.png");

const BROWSERS = [
  "C:/Users/29797/AppData/Local/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) throw new Error("no browser found");
mkdirSync(dirname(out), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader", "--window-size=1600,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(`file:///${html.replace(/\\/g, "/")}`, { waitUntil: "load" });
await page.waitForFunction("window.__gtnh3dReady === true", { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1200));

const stats = await page.evaluate(() => {
  const g = window.__gtnh3d;
  const world = g.world;
  const blocks = world.blocks ? world.blocks : null;
  const total = blocks ? blocks.size : -1;
  // material histogram
  const hist = new Map();
  const scan = (x0, z0, x1, z1, tag) => {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const b = world.get(x, 0, z);
        if (!b) continue;
        const k = `${b.spec.name}`;
        const e = hist.get(k) || { n: 0, where: [] };
        e.n++;
        if (e.where.length < 2) e.where.push(`${x},${z}`);
        hist.set(k, e);
      }
    }
    void tag;
  };
  scan(0, 0, 159, 159, "tile0");
  // a 32x32 character map of the first tile's surface
  const chars = "0123456789ABCDEFG";
  const NAME2CH = {
    "灰色混凝土": "0", "磨制闪长岩": "1", "磨制闪长岩台阶": "2", "空气": "3",
    "磨制花岗岩": "4", "砖块": "5", "白色混凝土": "6", "磨制安山岩台阶": "7",
    "平滑石英台阶": "8", "黄色陶瓦": "9", "黑色混凝土": "A", "草方块": "B",
    "苔藓块": "C", "青色陶瓦": "D", "翠绿蛙明灯": "E", "铁板门": "F", "珠光蛙明灯": "G",
  };
  const map = [];
  for (let bz = 0; bz < 32; bz++) {
    let s = "";
    for (let bx = 0; bx < 32; bx++) {
      const t = new Map();
      for (let dz = 0; dz < 5; dz++) {
        for (let dx = 0; dx < 5; dx++) {
          const b = world.get(bx * 5 + dx, 0, bz * 5 + dz);
          if (!b) continue;
          t.set(b.spec.name, (t.get(b.spec.name) || 0) + 1);
        }
      }
      let best = "?", n = -1;
      for (const [k, c] of t) if (c > n) { n = c; best = k; }
      s += NAME2CH[best] || "?";
    }
    map.push(s);
  }
  void chars;
  // the black grid lines must be present on the surface
  const gridX = [31, 47, 63, 79, 95, 111, 127, 143].map((gx) => {
    let black = 0;
    for (let z = 0; z < 160; z++) {
      if (world.get(gx, 0, z)?.spec?.name === "黑色混凝土") black++;
    }
    return `${gx}:${black}`;
  });
  return {
    totalBlocks: total,
    distinctSurface: hist.size,
    histogram: [...hist.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}`),
    gridX,
    map,
    hud: document.querySelector(".hud-stats")?.textContent || "",
    title: document.title,
  };
});

console.log(`total blocks in world: ${stats.totalBlocks}`);
console.log(`distinct materials on the first 160x160 tile: ${stats.distinctSurface}`);
console.log(`histogram: ${stats.histogram.join(" | ")}`);
console.log(`black grid columns (x:count of black on surface): ${stats.gridX.join("  ")}`);
console.log(`hud: ${stats.hud}`);
console.log("\nsurface map of the first tile, 1 char per 5x5 blocks:");
stats.map.forEach((l, i) => console.log(String(i * 5).padStart(3), l));

await page.screenshot({ path: out });
console.log(`\nwrote ${out} (default view, first frame)`);
writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(stats, null, 2));
await browser.close();
