// Debug: photograph the plaza from a high angle so the in-engine floor can be
// compared with tools/floor-map.mjs's texture map, and so any height difference
// on the platform is visible at a glance.
//
// Usage: node tools/shot-topdown.mjs [out.png]
import puppeteer from "puppeteer-core";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = join(ROOT, "dist", "GTNH-3D-ULV-LV.html");
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, "dist", "topdown.png");

const CHROME = "C:\\Users\\29797\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(HTML).href, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction("window.__gtnh3dReady === true", { timeout: 60000 });

const info = await page.evaluate(async () => {
  const g = window.__gtnh3d;
  const center = g.world3d.center;
  const THREE = g.THREE;
  // stop the rAF camera work, then render our own camera in its place
  g.camera3d.update = () => {};
  const cam = new THREE.PerspectiveCamera(30, 1, 0.5, 900);
  cam.position.set(center.x, 250, center.z + 78);
  cam.lookAt(center.x, 0, center.z);
  cam.updateProjectionMatrix();
  g.scene.fog = null;
  g.renderer.setSize(1024, 1024, false);
  g.renderer.render(g.scene, cam);
  window.__topdownCam = cam;
  // keep re-rendering this view in place of the loop's own render
  g.renderer.render = ((orig) => (scene, camera) => orig.call(g.renderer, scene, window.__topdownCam))(g.renderer.render);
  return { center: { x: center.x, z: center.z } };
});
console.log("high-angle render at", JSON.stringify(info));
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: OUT });
console.log("written:", OUT);
await browser.close();
