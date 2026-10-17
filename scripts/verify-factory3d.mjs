import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const html = resolve(process.argv[2] ?? join(root, 'dist/GTNH增量.html'));
const output = join(root, 'outputs/factory3d-lv');
await mkdir(output, { recursive: true });
const seedBuild = await build({
  stdin: {
    contents: `
      import { GameCore } from './src/game/core';
      import { serialize } from './src/game/save';
      import { dec } from './src/numeric/decimal';
      import { SCENE_MODELS } from './src/scene/factory3d/state';
      const core = new GameCore();
      core.maxTier = core.peakTier = 2;
      core.ores[0] = core.ores[1] = dec('1e9');
      core.coins[0] = core.coins[1] = dec('1e9');
      core.autosaveSeconds = 10;
      for (const model of SCENE_MODELS) core.counts[model.modelId] = 1;
      export const seed = serialize(core);
      export const names = SCENE_MODELS.map(model => model.name);
    `,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const { seed, names } = await import(`data:text/javascript;base64,${Buffer.from(seedBuild.outputFiles[0].contents).toString('base64')}`);
const executablePath = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));
assert.ok(executablePath, 'Chrome or Edge is required');
const browser = await puppeteer.launch({ executablePath, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const external = [];
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1150, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.evaluateOnNewDocument(data => {
    localStorage.setItem('gtnh-incremental-save', JSON.stringify(data));
    localStorage.setItem('gtnh-incremental-motion', 'off');
  }, seed);
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll('.factory-number').length === 6);
  assert.equal(await page.$$eval('.factory-machine-list > button', elements => elements.length), names.length);
  for (const name of names) assert.ok(await page.$eval('.factory-machine-list', (element, name) => element.textContent.includes(name), name));

  async function clickText(selector, text) {
    const handle = (await page.$$(selector));
    for (const item of handle) if ((await item.evaluate(element => element.textContent.trim())) === text) { await item.click(); return; }
    throw new Error(`Button not found: ${text}`);
  }
  await page.$eval('.factory-scene-3d', element => element.scrollIntoView({ block: 'start' }));
  await new Promise(resolve => setTimeout(resolve, 400));
  await (await page.$('.factory-scene-3d')).screenshot({ path: join(output, 'lv-factory.png') });
  const firstLabel = await (await page.$('.factory-number')).boundingBox();
  await page.mouse.click(firstLabel.x + firstLabel.width / 2, firstLabel.y + firstLabel.height + 26);
  await page.waitForFunction(() => document.querySelector('[data-model-id="g-lv-steam"]')?.getAttribute('aria-pressed') === 'true');
  await clickText('.factory-view-actions button', '暂停演示');
  assert.ok(await page.$$eval('.factory-machine-state', elements => elements.every(element => element.textContent.trim() === '待机')));
  for (const id of ['g-lv-steam', 'g-lv-comb', 'g-lv-gas', 'm-2', 'c-2', 'p-2']) {
    await page.click(`[data-model-id="${id}"]`);
    await page.waitForFunction(id => document.querySelector(`[data-model-id="${id}"]`)?.getAttribute('aria-pressed') === 'true', {}, id);
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  await (await page.$('.factory-stage-3d')).screenshot({ path: join(output, 'lv-scrubber.png') });
  await clickText('.factory-view-actions button', '设备全景');
  const canvas = await page.$('.factory-stage-3d canvas');
  const rect = await canvas.boundingBox();
  const before = await canvas.screenshot();
  await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.notDeepEqual(await canvas.screenshot(), before, 'Dragging must rotate the camera');
  await page.mouse.wheel({ deltaY: -240 });
  await page.keyboard.press('w');
  await clickText('.factory-view-actions button', '地板全景');
  await page.waitForFunction(() => document.querySelectorAll('.factory-number').length === 0);
  await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center' }));
  await new Promise(resolve => setTimeout(resolve, 300));
  await (await page.$('.factory-stage-3d')).screenshot({ path: join(output, 'blueprint-floor.png') });
  await clickText('.factory-view-actions button', '设备全景');
  await clickText('.factory-mode button', '实际厂区');
  await page.waitForFunction(() => document.querySelector('.factory-view-toolbar')?.textContent.includes('已建造 6 台'));
  await page.click('[data-model-id="m-2"]');
  await clickText('.factory-footer-3d button', '打开工作台');
  const rows = await page.$$('.tier-bar');
  let minerRow;
  for (const row of rows) if ((await row.$eval('.model-label', element => element.textContent)) === '基础采矿机') minerRow = row;
  assert.ok(minerRow, 'The selected machine must open its actual workshop');
  assert.equal(await minerRow.$eval('.trade button', button => button.disabled), false, 'Seed must afford an LV purchase');
  await (await minerRow.$('.trade button')).click();
  await page.waitForFunction(() => document.querySelector('[data-model-id="m-2"]')?.textContent.includes('2 台'));
  await (await minerRow.$('.run-btn')).click();
  await page.waitForFunction(() => document.querySelector('[data-model-id="m-2"] .factory-machine-state')?.textContent.trim() === '待机');
  await (await minerRow.$('.run-btn')).click();
  await page.waitForFunction(() => document.querySelector('[data-model-id="m-2"] .factory-machine-state')?.textContent.trim() === '运行中');
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickText('.rail-nav button', '科技与电网');
  await page.waitForFunction(() => !document.querySelector('.factory-stage-3d canvas'));
  await clickText('.rail-nav button', '工厂总览');
  await page.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });
  assert.equal(await page.$$eval('.factory-stage-3d canvas', elements => elements.length), 1);
  await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 1 });
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(await page.$eval('.factory-stage-3d canvas', canvas => canvas.width > 0 && canvas.clientWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('Verified: 6 Modernity machines, pause, focus, camera, floor, actual counts, purchase, stop/resume, navigation, resize, offline file.');
  console.log(`Screenshots: ${output}`);
} catch (error) {
  console.error(await page?.evaluate(() => ({ toolbar: document.querySelector('.factory-view-toolbar')?.textContent,
    machines: document.querySelector('.factory-machine-list')?.textContent,
    workshop: document.querySelector('.machine-panel')?.textContent, errors: document.querySelector('.factory-loading')?.textContent })));
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true });
  throw error;
} finally { await browser.close(); }
