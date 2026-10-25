import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const html = resolve(process.argv[2] ?? join(root, 'dist/GTNH增量.html'));
const output = join(root, 'outputs/factory3d');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(output, 'ground-test-'));
const fixture = await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
  import { GameCore } from './src/game/core';
  import { serialize } from './src/game/save';
  import { dec } from './src/numeric/decimal';
  const core = new GameCore();
  core.maxTier = core.peakTier = 15;
  core.riftOffered = true;
  core.ores = core.ores.map(() => dec('1e100'));
  core.coins = core.coins.map(() => dec('1e100'));
  core.counts['m-2'] = 1000;
  core.counts['g-hv-mb-steam'] = 2;
  core.counts['g-max-mb-blackhole'] = 1;
  core.autosaveSeconds = 600;
  export const seed = serialize(core);
` }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { seed } = await import(`data:text/javascript;base64,${Buffer.from(fixture.outputFiles[0].contents).toString('base64')}`);
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe')].find(path => path && existsSync(path));
assert.ok(executablePath, 'Chrome is required');
const browser = await puppeteer.launch({ executablePath, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], external = [];
const canvasSelector = '.factory-stage-3d canvas';
const groundsKey = 'gtnh-incremental-grounds';
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.evaluateOnNewDocument(data => {
    if (!localStorage.getItem('gtnh-incremental-save')) localStorage.setItem('gtnh-incremental-save', JSON.stringify(data));
    localStorage.setItem('gtnh-incremental-motion', 'off');
    localStorage.setItem('gtnh-incremental-time', String(Date.now()));
    window.__groundContexts = 0; window.__groundDraws = 0;
    const seen = new WeakSet(), original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const context = original.call(this, type, ...args);
      if (context && type.startsWith('webgl') && !seen.has(context)) {
        seen.add(context); window.__groundContexts++;
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          if (typeof context[name] !== 'function') continue;
          const draw = context[name];
          context[name] = function(...values) { window.__groundDraws++; return draw.apply(this, values); };
        }
      }
      return context;
    };
  }, seed);
  const click = async (selector, label) => {
    const found = await page.$$eval(selector, (elements, label) => {
      const button = elements.find(element => element.textContent.trim() === label);
      if (!button) return false;
      button.click(); return true;
    }, label);
    assert.ok(found, `Control not found: ${label}`);
  };
  const input = async (selector, value) => page.$eval(selector, (element, value) => {
    element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  const metrics = () => page.$eval(canvasSelector, canvas => ({ ...canvas.dataset }));
  const library = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), groundsKey);
  const waitCount = count => page.waitForFunction(count => document.querySelector('.factory-stage-3d canvas')?.dataset.groundEdits === String(count), {}, count);
  const openSettings = async () => {
    await page.click('.ground-settings-edit-button');
    await page.waitForSelector('#ground-settings-dialog[open]');
  };
  const closeSettings = async () => {
    await click('.ground-settings-close', '完成设置');
    await page.waitForSelector('#ground-settings-dialog:not([open])');
  };
  const openScene = async () => {
    await page.waitForSelector('.factory-preview');
    await page.$eval('.factory-preview', element => { element.open = true; });
    await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center' }));
    await page.waitForSelector(`${canvasSelector}[data-scene-ready="true"][data-machine-count="1000"]`, { timeout: 60000 });
  };
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html, .page-body { scroll-behavior: auto !important; }' });
  await openScene();
  await page.click('[data-model-id="m-2"]');
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas')?.dataset.sceneModelId === 'm-2');
  assert.match(await page.$eval('.factory-view-toolbar', element => element.textContent), /已建造 1003 台.*当前场地 1000 台/);
  assert.equal((await metrics()).groundPreset, 'grid');
  await page.evaluate(() => { window.__groundCanvas = document.querySelector('.factory-stage-3d canvas'); });
  assert.equal(await page.$('.factory-instance-navigation'), null);
  assert.equal(await page.$('[aria-label="定位第几台设备"]'), null);
  assert.equal((await metrics()).machineCount, '1000');
  await page.$eval('.factory-scene-3d', element => element.scrollIntoView({ block: 'start' }));
  await (await page.$('.factory-scene-3d')).screenshot({ path: join(output, 'independent-ground.png') });

  await openSettings();
  assert.equal(await page.$eval('.page-body', element => element.style.overflow), 'hidden');
  assert.equal(await page.evaluate(() => window.__groundCanvas === document.querySelector('#ground-settings-dialog canvas')), true);
  await page.focus('[data-settings-tab="edit"]'); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-settings-tab="import"]').getAttribute('aria-selected') === 'true');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[data-settings-tab="edit"]').getAttribute('aria-selected') === 'true');
  for (let index = 0; index < 8; index++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.querySelector('#ground-settings-dialog').contains(document.activeElement)), true); }
  await click('.ground-settings-view-actions button', '复位视角');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const beforeTravel = await metrics();
  await page.focus(canvasSelector); await page.keyboard.down('Control'); await page.keyboard.down('w');
  await new Promise(resolve => setTimeout(resolve, 1400));
  await page.keyboard.up('w'); await page.keyboard.up('Control');
  const afterTravel = await metrics();
  assert.ok(Math.abs(Number(afterTravel.cameraZ) - Number(beforeTravel.cameraZ)) > 16, 'Settings preview must support keyboard flight across chunk boundaries');
  assert.equal(afterTravel.geometryCount, beforeTravel.geometryCount, 'Walking across the base ground must not allocate new geometry');
  assert.equal(afterTravel.textureCount, beforeTravel.textureCount, 'Walking across the base ground must not allocate new textures');
  await click('.ground-settings-view-actions button', '复位视角');
  await page.select('[aria-label="选择场地材质"]', 'pink-concrete');
  await input('[aria-label="编辑方块 X 坐标"]', 4); await input('[aria-label="编辑方块 Z 坐标"]', 4);
  await click('.ground-coordinates button', '铺设地面'); await waitCount(1);
  await click('.ground-tools button', '放方块');
  await page.select('[aria-label="选择场地材质"]', 'bricks');
  await input('[aria-label="编辑方块 X 坐标"]', 8); await input('[aria-label="编辑方块 Z 坐标"]', 8);
  await click('.ground-coordinates button', '放置方块');
  await page.waitForFunction(() => document.querySelector('.ground-message')?.textContent.includes('设备重叠'));
  assert.equal((await metrics()).groundEdits, '1', 'Decoration must not overwrite the selected machine');
  await input('[aria-label="编辑方块 X 坐标"]', 4); await input('[aria-label="编辑方块 Z 坐标"]', 4);
  await click('.ground-coordinates button', '放置方块'); await waitCount(2);
  assert.equal((await library()).sites['m-2:0'].cells['4,0,4'], 'bricks');
  await click('.ground-tools button', '撤销'); await waitCount(1);
  await click('.ground-tools button', '重做'); await waitCount(2);
  await input('[aria-label="场地预设名称"]', '独立测试场地');
  await click('.ground-save-preset button', '保存预设');
  const savedPreset = (await library()).presets[0];
  assert.equal(savedPreset.name, '独立测试场地');

  await closeSettings(); await openSettings(); await waitCount(2);
  assert.equal(await page.evaluate(() => window.__groundCanvas === document.querySelector('.factory-stage-3d canvas')), true);
  assert.equal(await page.evaluate(() => window.__groundContexts), 1);
  await page.select('[aria-label="选择场地预设"]', 'preset-1');
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas').dataset.groundPreset === 'preset-1', { timeout: 60000 });
  await waitCount(0);
  await page.select('[aria-label="选择场地预设"]', savedPreset.id); await waitCount(2);
  assert.equal((await metrics()).groundPreset, 'grid');

  await click('.ground-tools button', '还原 / 拆除');
  await input('[aria-label="方块高度"]', 0);
  await click('.ground-coordinates button', '还原 / 拆除此格'); await waitCount(1);
  await input('[aria-label="方块高度"]', -1);
  await click('.ground-coordinates button', '还原 / 拆除此格'); await waitCount(0);
  assert.deepEqual((await library()).presets[0].design.cells, savedPreset.design.cells, 'Editing a site must not mutate its saved preset');
  await click('.ground-tools button', '撤销'); await waitCount(1);
  await click('.ground-tools button', '撤销'); await waitCount(2);

  await click('.ground-tools button', '铺地');
  await page.select('[aria-label="选择场地材质"]', 'gray-concrete');
  await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rectangle = await (await page.$(canvasSelector)).boundingBox();
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName,
    { x: rectangle.x + rectangle.width * 0.25, y: rectangle.y + rectangle.height * 0.72 }), 'CANVAS');
  await page.mouse.move(rectangle.x + rectangle.width * 0.25, rectangle.y + rectangle.height * 0.72);
  await page.waitForSelector('.ground-coordinate');
  const beforeClick = Number((await metrics()).groundEdits);
  await page.mouse.click(rectangle.x + rectangle.width * 0.25, rectangle.y + rectangle.height * 0.72);
  await waitCount(beforeClick + 1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await click('.ground-settings-view-actions button', '复位视角');
  await page.focus(canvasSelector); await page.keyboard.press('Escape');
  await page.waitForSelector('#ground-settings-dialog:not([open])');
  assert.equal(await page.evaluate(() => window.__groundCanvas === document.querySelector('.factory-main-scene-host canvas')), true);
  assert.equal(await page.$eval('.page-body', element => element.style.overflow), '');
  assert.equal((await metrics()).groundTool, 'view', 'Closing settings must stop terrain editing on the main scene');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ground-settings-edit-button')), true);

  await openSettings();
  await page.evaluate(() => {
    window.__originalGroundObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(blob) { blob.text().then(text => { window.__groundExport = text; }); return window.__originalGroundObjectURL.call(this, blob); };
    const click = HTMLAnchorElement.prototype.click;
    window.__originalGroundAnchorClick = click;
    HTMLAnchorElement.prototype.click = function() { if (this.download === 'GTNH场地.json') return; return click.call(this); };
  });
  await click('.ground-backup button', '导出全部场地');
  await page.waitForFunction(() => !!window.__groundExport);
  const exported = await page.evaluate(() => window.__groundExport);
  await page.evaluate(() => { URL.createObjectURL = window.__originalGroundObjectURL; HTMLAnchorElement.prototype.click = window.__originalGroundAnchorClick; });
  const importPath = join(temporary, '场地备份.json');
  await writeFile(importPath, exported, 'utf8');
  await page.select('[aria-label="选择场地预设"]', 'grid'); await waitCount(0);
  await (await page.$('[aria-label="导入场地 JSON 文件"]')).uploadFile(importPath);
  await waitCount(beforeClick + 1);
  assert.equal((await library()).presets[0].name, savedPreset.name);

  await page.reload({ waitUntil: 'load' }); await openScene();
  await page.click('[data-model-id="m-2"]');
  await waitCount(beforeClick + 1);
  await openSettings();
  assert.equal((await library()).sites['m-2:0'].cells['4,0,4'], 'bricks');
  await page.select('[aria-label="选择场地预设"]', savedPreset.id); await waitCount(2);
  await closeSettings();

  for (const id of ['g-hv-mb-steam', 'g-max-mb-blackhole', 'm-2', 'g-hv-mb-steam', 'm-2']) {
    await page.click(`[data-model-id="${id}"]`);
    await page.waitForFunction(id => document.querySelector('.factory-stage-3d canvas').dataset.sceneModelId === id, {}, id);
    assert.equal((await metrics()).machineCount, id === 'm-2' ? '1000' : id === 'g-hv-mb-steam' ? '2' : '1');
  }
  assert.equal(await page.evaluate(() => window.__groundContexts), 1);
  await click('.factory-view-actions button', '复位视角');
  await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center' }));
  await (await page.$('.factory-scene-3d')).screenshot({ path: join(output, 'custom-ground.png') });
  const desktop = await metrics();

  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await openSettings();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile editor must not overflow horizontally');
  await (await page.$('#ground-settings-dialog')).screenshot({ path: join(output, 'ground-editor-mobile.png') });
  await page.setViewport({ width: 812, height: 375, deviceScaleFactor: 1 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Landscape editor must not overflow horizontally');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({ owned: 1003, shown: desktop.machineCount, draws: desktop.drawCalls,
    contexts: await page.evaluate(() => window.__groundContexts), edits: desktop.groundEdits,
    chunkTravelAllocations: { geometries: Number(afterTravel.geometryCount) - Number(beforeTravel.geometryCount),
      textures: Number(afterTravel.textureCount) - Number(beforeTravel.textureCount) }, errors, external }, null, 2));
} catch (error) {
  console.error(await page?.evaluate(() => ({ metrics: { ...document.querySelector('.factory-stage-3d canvas')?.dataset },
    message: document.querySelector('.ground-message')?.textContent, hover: document.querySelector('.ground-coordinate')?.textContent,
    errors: window.__groundContexts, inputs: [...document.querySelectorAll('.ground-editor input')].map(input => ({ label: input.getAttribute('aria-label'), value: input.value })) })));
  await page?.screenshot({ path: join(output, 'ground-failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
  await rm(temporary, { recursive: true, force: true });
}
