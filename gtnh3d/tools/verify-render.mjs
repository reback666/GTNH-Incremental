// Headless render check: opens the built single-file demo in Chrome, waits for
// the scene to boot, drives the camera through a few viewpoints, and writes
// screenshots to gtnh3d/dist/shots/.
//
//   node gtnh3d/tools/verify-render.mjs [path-to-html]

import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "dist", "GTNH-3D-ULV-LV.html");
const SHOTS = join(ROOT, "dist", "shots");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const { existsSync } = await import("node:fs");
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("✗ no Chrome/Edge found; set CHROME_PATH");
  process.exit(2);
}

await mkdir(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1600,900",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

const errors = [];
const warnings = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error") errors.push(m.text());
  else if (t === "warning") warnings.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const t0 = Date.now();
await page.goto(pathToFileURL(HTML).href, { waitUntil: "load", timeout: 60000 });

try {
  await page.waitForFunction("window.__gtnh3dReady === true", { timeout: 90000 });
} catch {
  const body = await page.evaluate(() => document.body.innerText.slice(0, 900));
  console.error("✗ scene never booted. page text:\n" + body);
  console.error("errors:\n" + errors.join("\n"));
  await browser.close();
  process.exit(1);
}
const bootMs = Date.now() - t0;

// let the render loop settle so FPS is meaningful
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(() => {
  const g = window.__gtnh3d;
  const gl = g.renderer.getContext();
  return {
    faces: g.built.faces + (g.built.dynFaces || 0),
    staticFaces: g.built.faces,
    dynamicFaces: g.built.dynFaces,
    groups: g.built.groups + (g.built.dynGroups || 0),
    cubes: g.world.blocks.size,
    machines: g.world3d.hallInstances.length,
    mbOk: g.world3d.multiblocks[0].validation.ok,
    mbChecked: g.world3d.multiblocks[0].validation.checked,
    atlasCells: g.atlas.cells,
    renderer: gl.getParameter(gl.RENDERER),
    stats: document.querySelector(".hud-stats")?.innerText.replace(/\n/g, " | "),
    drawCalls: g.renderer.info.render.calls,
    triangles: g.renderer.info.render.triangles,
  };
});

// Poses as plain data: puppeteer's evaluate argument is JSON-serialised, so
// functions cannot cross the boundary. `sel` picks the anchor in the page.
const POSES = {
  overview: { mode: "fly", anchor: "center", off: [-58, 72, 104], yaw: -0.55, pitch: -0.6 },
  hall: { mode: "fly", anchor: "hall", off: [-9, 5, 12], yaw: -0.5, pitch: -0.22 },
  ulv: { mode: "fly", anchor: "ulv", off: [-10, 9, 13], yaw: -0.62, pitch: -0.32 },
  panel: { mode: "fly", anchor: "hall", index: 4, off: [0.5, 3.5, 5.5], yaw: 0, pitch: -Math.atan2(3, 5) },
  furnace: { mode: "orbit", anchor: "mb", orbitDistance: 22, orbitPitch: 0.36, orbitYaw: Math.PI * 0.72 },
  closeup: { mode: "fly", anchor: "hall", off: [0.5, 1.8, 3.2], yaw: Math.PI, pitch: -0.3 },
};

function applyPose(pose) {
  return async (p) => {
    await p.evaluate((spec) => {
      const g = window.__gtnh3d;
      const w = g.world3d;
      const anchor =
        spec.anchor === "center"
          ? w.center
          : spec.anchor === "hall"
            ? w.hallInstances[spec.index || 0]
            : spec.anchor === "ulv"
              ? w.ulvShowcase[0]
              : w.multiblocks[0].center;
      const cam = g.camera3d;
      cam.setMode(spec.mode);
      if (spec.mode === "orbit") {
        cam.orbitTarget.set(anchor.x, spec.anchor === "mb" ? 2.4 : 1.5, anchor.z);
        cam.orbitDistance = spec.orbitDistance;
        cam.orbitPitch = spec.orbitPitch;
        cam.orbitYaw = spec.orbitYaw;
      } else {
        g.camera.position.set(anchor.x + spec.off[0], anchor.y != null ? anchor.y + spec.off[1] : spec.off[1], anchor.z + spec.off[2]);
        cam.yaw = spec.yaw;
        cam.pitch = spec.pitch;
      }
      cam.sync();
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, pose);
  };
}

for (const name of ["overview", "hall", "furnace", "ulv", "closeup"]) {
  await applyPose(POSES[name])(page);
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  console.log(`  · shot ${name}`);
}

// clicking a machine must open the info panel
await applyPose(POSES.panel)(page);
await new Promise((r) => setTimeout(r, 250));

const panelHiddenBefore = await page.evaluate(() => document.querySelector(".hud-panel").classList.contains("hidden"));
await page.mouse.click(800, 450);
const pickResult = await page.evaluate((before) => {
  const g = window.__gtnh3d;
  const machine = g.world3d.hallInstances[4];
  return {
    panelHiddenBefore: before,
    panelHiddenAfter: document.querySelector(".hud-panel").classList.contains("hidden"),
    title: document.querySelector(".hud-panel h3")?.innerText || "",
    rows: document.querySelector(".hud-panel")?.innerText.split("\n").slice(0, 5).join(" | ") || "",
    hint: document.querySelector(".hud-hint")?.innerText || "",
    pickedMachine: document.querySelector(".hud-panel").innerText.includes(`basicmachine.${machine.machine.id}`),
    machineRunning: machine.slot.spec === machine.machine.run,
  };
}, panelHiddenBefore);

await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: join(SHOTS, "panel.png") });

console.log(`\nboot: ${bootMs} ms`);
console.log(
  `faces: ${info.faces} (static ${info.staticFaces}, batch ${info.groups}) · cubes ${info.cubes} · draw calls ${info.drawCalls} · tris ${info.triangles}`
);
console.log(`atlas: ${info.atlasCells.cols}x${info.atlasCells.rows} cells (${info.atlasCells.count} keys)`);
console.log(`multiblock self-check: ${info.mbOk ? "PASS" : "FAIL"} (${info.mbChecked} cells)`);
console.log(`renderer: ${info.renderer}`);
console.log(`hud stats: ${info.stats}`);
console.log(`panel pick: ${JSON.stringify(pickResult)}`);
if (errors.length) console.log(`\nconsole errors (${errors.length}):\n` + errors.slice(0, 12).join("\n"));
if (warnings.length) console.log(`warnings (${warnings.length}): ${warnings.slice(0, 5).join(" / ")}`);

await browser.close();
const bad = errors.length > 0 || !info.mbOk || info.dynamicFaces !== info.machines * 6 || pickResult.panelHiddenAfter || !pickResult.pickedMachine || !pickResult.machineRunning;
console.log(bad ? "\n✗ render check failed\n" : "\n✓ render check passed\n");
process.exit(bad ? 1 : 0);
