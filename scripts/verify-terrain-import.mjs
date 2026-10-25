import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const html = resolve(process.argv[2] ?? join(root, 'dist/GTNH增量.html'));
const scope = /data-storage-scope="([^"]+)"/.exec(readFileSync(html, 'utf8').slice(0, 2048))?.[1];
const prefix = scope ? `${scope}:` : '';
const output = join(root, 'outputs/factory3d');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(output, 'terrain-test-'));
const bundle = await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
  import { GameCore } from './src/game/core'; import { serialize } from './src/game/save'; import { dec } from './src/numeric/decimal';
  import { spongeFixture, legacyFixture, litematicFixture, regionFixture } from './test/fixtures/ground-files';
  const core = new GameCore(); core.maxTier = core.peakTier = 15; core.riftOffered = true;
  core.ores = core.ores.map(() => dec('1e100')); core.coins = core.coins.map(() => dec('1e100'));
  core.counts['m-2'] = 1000; core.counts['c-2'] = 300; core.counts['g-lv-steam'] = 3; core.autosaveSeconds = 600;
  export const seed = serialize(core);
  const cells = Array.from({length: 256}, (_, index) => { const x = index % 16, z = Math.floor(index / 16); return x === 0 || x === 15 || z === 0 || z === 15 ? 2 : 1; });
  const palette = ['minecraft:air', 'minecraft:white_concrete', 'minecraft:pink_concrete'];
  export const files = {
    '粉白场地.schem': await spongeFixture(3, palette, cells, [16, 1, 16]),
    '旧版场地.schematic': await legacyFixture(),
    '多区域投影.litematic': await litematicFixture({ left: regionFixture([8, 1, 16]), right: regionFixture([8, 1, 16], [8, 0, 0], ['minecraft:air', 'minecraft:pink_concrete']) }),
    '未知方块.schem': await spongeFixture(3, ['minecraft:air', 'test:custom'], [1], [1, 1, 1]),
  };
` }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { seed, files } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
for (const [name, data] of Object.entries(files)) await writeFile(join(temporary, name), data);
await writeFile(join(temporary, '损坏.schem'), new Uint8Array([1, 2, 3]));
await writeFile(join(temporary, '不支持.json'), '{}', 'utf8');
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe')].find(path => path && existsSync(path));
assert.ok(executablePath, 'Chrome is required');
const browser = await puppeteer.launch({ executablePath, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let page;
const errors = [], external = [];
const canvas = '.factory-stage-3d canvas';
const key = `${prefix}gtnh-incremental-grounds`;
try {
  page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.evaluateOnNewDocument(({ seed, prefix }) => {
    if (!localStorage.getItem(`${prefix}gtnh-incremental-save`)) localStorage.setItem(`${prefix}gtnh-incremental-save`, JSON.stringify(seed));
    localStorage.setItem(`${prefix}gtnh-incremental-motion`, 'off');
    window.__terrainContexts = 0; const original = HTMLCanvasElement.prototype.getContext, seen = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { const context = original.call(this, type, ...args);
      if (context && type.startsWith('webgl') && !seen.has(context)) { seen.add(context); window.__terrainContexts++; } return context; };
  }, { seed, prefix });
  const metrics = () => page.$eval(canvas, element => ({ ...element.dataset }));
  const library = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
  const click = async (selector, text) => assert.ok(await page.$$eval(selector, (elements, text) => {
    const button = elements.find(element => element.textContent.trim() === text && !element.disabled); button?.click(); return !!button;
  }, text), `Control unavailable: ${text}`);
  const openSettings = async () => {
    if (!await page.$eval('#ground-settings-dialog', element => element.open)) {
      await page.click('.ground-settings-edit-button');
      await page.waitForSelector('#ground-settings-dialog[open]');
    }
    await click('[data-settings-tab]', '导入场地');
  };
  const closeSettings = async () => {
    if (await page.$eval('#ground-settings-dialog', element => element.open)) {
      await click('.ground-settings-close', '完成设置');
      await page.waitForSelector('#ground-settings-dialog:not([open])');
    }
  };
  const upload = async name => { await openSettings(); await (await page.$('[aria-label="导入 Minecraft 场地文件"]')).uploadFile(join(temporary, name)); };
  const open = async () => {
    await page.waitForSelector('.factory-preview'); await page.$eval('.factory-preview', element => { element.open = true; });
    await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForSelector(`${canvas}[data-scene-ready="true"]`, { timeout: 60000 });
  };
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html, .page-body { scroll-behavior: auto !important; }' }); await open();
  await page.$eval('[data-model-id="m-2"]', element => element.click());
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas')?.dataset.machineCount === '1000');
  await page.evaluate(() => document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game').stop());
  assert.equal((await metrics()).ownedCount, '1303');
  assert.equal(await page.$('.factory-instance-navigation'), null, 'The instance navigation row must be removed');
  assert.equal(await page.$('.ground-settings-import-button'), null, 'The redundant main-page import button must be removed');
  assert.equal(await page.$('.factory-camera-buttons'), null, 'The six main-page camera buttons must be removed');
  assert.equal(await page.$('.factory-footer-3d button'), null, 'The workshop shortcut button must be removed');
  assert.equal(await page.evaluate(() => document.querySelector('.factory-scene-3d').textContent.includes('位于生产中的类别')), false);
  await page.evaluate(() => { window.__terrainCanvas = document.querySelector('.factory-stage-3d canvas'); });
  assert.equal(await page.$eval('[aria-label="导入 Minecraft 场地文件"]', element => element.accept.includes('json')), false);
  const readings = [];
  for (const [name, format, count] of [['粉白场地.schem', 'schem', 256], ['旧版场地.schematic', 'schematic', 4], ['多区域投影.litematic', 'litematic', 256]]) {
    const before = JSON.stringify(await library());
    await upload(name);
    await page.waitForSelector('.ground-import-actions .primary:not([disabled])', { timeout: 60000 });
    assert.equal(JSON.stringify(await library()), before, 'Preview must not overwrite a saved field');
    assert.equal((await metrics()).terrainFormat, format); assert.equal((await metrics()).terrainBlockCount, String(count));
    assert.equal((await metrics()).machineCount, '1000', 'All same-model machines must stay on the field during preview');
    assert.equal(await page.evaluate(() => window.__terrainCanvas === document.querySelector('#ground-settings-dialog canvas')), true, 'Settings must reuse the live canvas');
    if (format === 'schem') await (await page.$('#ground-settings-dialog')).screenshot({ path: join(output, 'ground-settings-import.png') });
    await click('.ground-import-actions button', '应用到当前机型');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.sites['m-2:0']?.preset === 'imported', {}, key);
    await page.waitForSelector('.ground-import-preview', { hidden: true });
    readings.push({ format, blocks: count, machines: (await metrics()).machineCount });
  }
  assert.equal(Object.keys((await library()).structures).length, 3);
  await closeSettings();
  assert.equal(await page.evaluate(() => window.__terrainCanvas === document.querySelector('.factory-main-scene-host canvas')), true);
  await page.$eval('[data-model-id="c-2"]', element => element.click());
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas').dataset.machineCount === '300');
  assert.equal((await metrics()).groundPreset, 'grid', 'Different models must have independent fields');
  await page.$eval('[data-model-id="m-2"]', element => element.click());
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas').dataset.machineCount === '1000' && document.querySelector('.factory-stage-3d canvas').dataset.terrainFormat === 'litematic');
  await upload('未知方块.schem'); await page.waitForSelector('.ground-import-missing select');
  assert.equal(await page.$eval('.ground-import-actions .primary', element => element.disabled), true);
  await page.select('.ground-import-missing select', 'pink-concrete');
  await page.waitForSelector('.ground-import-actions .primary:not([disabled])');
  await click('.ground-import-actions button', '保存为预设');
  const saved = await library(); assert.equal(saved.presets.length, 4);
  assert.equal(saved.sites['m-2:0'].structureId, Object.keys(saved.structures)[2], 'Saving a preset alone must not replace the active field');
  const beforeFailure = JSON.stringify(saved);
  await upload('粉白场地.schem');
  await page.waitForSelector('.ground-import-actions .primary:not([disabled])');
  await closeSettings();
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas').dataset.terrainFormat === 'litematic');
  assert.equal(JSON.stringify(await library()), beforeFailure, 'Closing settings must discard an unapplied import preview');
  await upload('损坏.schem'); await page.waitForSelector('.ground-import-error');
  assert.match(await page.$eval('.ground-import-error', element => element.textContent), /损坏|有效/);
  assert.equal(JSON.stringify(await library()), beforeFailure);
  await upload('不支持.json');
  assert.match(await page.$eval('.ground-import-error', element => element.textContent), /schem/);
  assert.equal(JSON.stringify(await library()), beforeFailure);
  await upload('粉白场地.schem');
  await page.$$eval('.ground-import-heading button', buttons => buttons.find(button => button.textContent.includes('取消'))?.click());
  await page.waitForSelector('.ground-import-preview', { hidden: true });
  assert.equal(JSON.stringify(await library()), beforeFailure);
  await page.reload({ waitUntil: 'load' }); await open();
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas').dataset.terrainFormat === 'litematic');
  assert.equal((await metrics()).machineCount, '1000');
  assert.equal(Object.keys((await library()).structures).length, 4);
  assert.equal(await page.evaluate(() => window.__terrainContexts), 1);
  await page.$eval('.factory-scene-3d', element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await (await page.$('.factory-scene-3d')).screenshot({ path: join(output, 'model-field-imported.png') });
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await upload('粉白场地.schem'); await page.waitForSelector('.ground-import-actions .primary:not([disabled])');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await (await page.$('#ground-settings-dialog')).screenshot({ path: join(output, 'terrain-import-mobile.png') });
  await closeSettings();
  const empty = await page.evaluate(data => document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game').importSave(JSON.stringify({ ...data, counts: {} })), seed);
  assert.equal(empty.ok, true, empty.message);
  await page.waitForFunction(() => document.querySelector('.factory-stage-3d canvas').dataset.machineCount === '0');
  await upload('粉白场地.schem');
  await page.waitForSelector('.ground-import-actions button:not([disabled])');
  assert.equal(await page.$eval('.ground-import-actions .primary', element => element.disabled), true, 'An empty factory may import presets without applying them to a nonexistent machine');
  await click('.ground-import-actions button', '保存为预设');
  assert.equal((await library()).presets.length, 5, 'Import must remain available before any machine is built');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log(JSON.stringify({ result: 'passed', readings, groupedModels: { 'm-2': 1000, 'c-2': 300 }, contexts: 1, errors, external }, null, 2));
} catch (error) {
  console.error(await page?.evaluate(() => ({ metrics: { ...document.querySelector('.factory-stage-3d canvas')?.dataset },
    errors: [...document.querySelectorAll('.ground-import-error,.factory-loading')].map(element => element.textContent) })));
  await page?.screenshot({ path: join(output, 'terrain-import-failure.png'), fullPage: true }); throw error;
} finally { await browser.close(); await rm(temporary, { recursive: true, force: true }); }
