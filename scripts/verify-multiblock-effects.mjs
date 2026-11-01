import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const html = resolve(process.argv[2] ?? join(root, 'dist/GTNH-Incremental.html'));
const output = join(root, 'outputs/verification/multiblock-effects');
const fixture = await build({
  stdin: { resolveDir: root, loader: 'ts', contents: `
    import { GameCore } from './src/game/core';
    import { serialize } from './src/game/save';
    import { dec } from './src/numeric/decimal';
    import { CONTENT } from './src/content';
    const ids = ['g-max-mb-blackhole', 'g-hv-mb-steam', 'g-ev-mb-gas', 'g-zpm-mb-plasma', 'g-uev-mb-decay'];
    const core = new GameCore();
    core.maxTier = core.peakTier = 15;
    core.riftOffered = true;
    core.ores = core.ores.map(() => dec('1e100'));
    core.coins = core.coins.map(() => dec('1e100'));
    for (const id of ids) core.counts[id] = 1;
    core.counts['c-15'] = 1;
    core.autosaveSeconds = 600;
    export const seed = serialize(core);
    export const profiles = ids.map(id => ({ id, tier: CONTENT.byModelId.get(id).tier }));
    for (const id of ids) delete core.counts[id];
    delete core.counts['c-15'];
    core.counts['c-3'] = 1000;
    core.counts['g-hv-mb-steam'] = 100;
    export const batchSeed = serialize(core);
  ` }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const { seed, profiles, batchSeed } = await import(`data:text/javascript;base64,${Buffer.from(fixture.outputFiles[0].contents).toString('base64')}`);
const executablePath = [process.env.CHROME_PATH, join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => path && existsSync(path));
assert.ok(executablePath, 'Chrome is required');
const browser = await puppeteer.launch({ executablePath, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [], external = [];
let page;
try {
  const context = await browser.createBrowserContext();
  page = await context.newPage();
  await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.evaluateOnNewDocument(data => {
    localStorage.setItem('gtnh-incremental-save', JSON.stringify(data));
    localStorage.setItem('gtnh-incremental-motion', 'on');
    window.__effectDraws = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    const contexts = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const gl = getContext.call(this, type, ...args);
      if (gl && type.startsWith('webgl') && !contexts.has(gl)) {
        contexts.add(gl);
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const draw = gl[name];
          if (draw) gl[name] = function(...args) { window.__effectDraws++; return draw.apply(this, args); };
        }
      }
      return gl;
    };
  }, seed);
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html, .page-body { scroll-behavior: auto !important; }' });
  await page.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('[data-model-id="g-max-mb-blackhole"] .factory-machine-state')?.textContent.trim() === '运行中');
  await page.evaluate(() => {
    window.__effectGame = document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game');
    window.__effectGame.stop();
  });
  async function clickText(selector, text) {
    for (const button of await page.$$(selector)) {
      if (await button.evaluate(button => button.getAttribute('aria-label') ?? button.textContent.trim()) === text) {
        await button.click();
        return;
      }
    }
    throw new Error(`Button not found: ${text}`);
  }
  async function settled() {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function centerStage() {
    if (!await page.evaluate(() => !!document.fullscreenElement)) {
      await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    }
    await settled();
  }
  async function focus(profile) {
    await page.select('[aria-label="筛选设备类别"]', 'generator');
    await page.select('[aria-label="筛选设备电压"]', String(profile.tier));
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.machineCount === '1');
    await settled();
    await clickText('.factory-view-actions button', '复位视角');
    await centerStage();
    const metric = profile.id === 'g-max-mb-blackhole' ? 'effectEyes' : 'effectTurbines';
    await page.waitForFunction(metric => document.querySelector('canvas')?.dataset[metric] === '1', {}, metric);
  }
  async function capture(name) {
    return page.screenshot(name ? { path: join(output, name) } : {});
  }
  await mkdir(output, { recursive: true });
  await clickText('.factory-view-actions button', '全屏');
  await page.waitForFunction(() => !!document.fullscreenElement);
  await centerStage();
  const readings = [];
  for (const profile of profiles) {
    await focus(profile);
    const eye = profile.id === 'g-max-mb-blackhole';
    if (eye) assert.ok(Number(await page.$eval('canvas', canvas => canvas.dataset.effectOrbits)) > 0, 'Near Eye must include orbiting bodies');
    const first = await capture(eye ? 'eye-running.png' : `${profile.id}.png`);
    let changed = false;
    for (let sample = 0; sample < 4 && !changed; sample++) {
      const before = await page.$eval('canvas', canvas => Number(canvas.dataset.effectTime));
      await page.waitForFunction(before => Number(document.querySelector('canvas').dataset.effectTime) > before + 0.07, {}, before);
      changed = !Buffer.from(await capture()).equals(Buffer.from(first));
    }
    assert.ok(changed, `${profile.id} must visibly animate across its texture cycle`);
    const data = await page.$eval('canvas', canvas => ({ ...canvas.dataset }));
    readings.push({ id: profile.id, draws: Number(data.drawCalls), eyes: data.effectEyes, orbits: data.effectOrbits, turbines: data.effectTurbines });
    assert.ok(Number(data.drawCalls) < 40, 'Effects must keep bounded draw calls');
    await clickText('.factory-view-actions button', '动态：开');
    await settled();
    const stopped = await page.evaluate(() => ({ draws: window.__effectDraws, time: document.querySelector('canvas').dataset.effectTime }));
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.deepEqual(await page.evaluate(() => ({ draws: window.__effectDraws, time: document.querySelector('canvas').dataset.effectTime })), stopped, 'Dynamic off must stop continuous redraws');
    await clickText('.factory-view-actions button', '动态：关');
    await page.waitForFunction(time => Number(document.querySelector('canvas').dataset.effectTime) > Number(time), {}, stopped.time);
    await page.evaluate(id => window.__effectGame.toggleStopped(id), profile.id);
    const metric = eye ? 'effectEyes' : 'effectAnimated';
    await page.waitForFunction(({ metric, eye }) => document.querySelector('canvas').dataset[metric] === (eye ? '0' : 'false'), {}, { metric, eye });
    await page.evaluate(id => window.__effectGame.toggleStopped(id), profile.id);
    await page.waitForFunction(() => document.querySelector('canvas').dataset.effectAnimated === 'true');
  }
  await page.select('[aria-label="筛选设备电压"]', String(profiles[1].tier));
  const imported = await page.evaluate(data => {
    const result = window.__effectGame.importSave(JSON.stringify(data));
    window.__effectGame.step(1);
    return result;
  }, batchSeed);
  assert.ok(imported.ok, imported.message);
  await page.waitForFunction(() => document.querySelector('canvas').dataset.machineCount === '100'
    && document.querySelector('[data-model-id="g-hv-mb-steam"] .factory-machine-state')?.textContent.trim() === '运行中');
  await page.evaluate(() => window.__effectGame.stop());
  await clickText('.factory-view-actions button', '复位视角');
  await page.waitForFunction(() => document.querySelector('canvas').dataset.effectTurbines === '100'
    && document.querySelector('canvas').dataset.effectAnimated === 'true');
  const batch = await page.$eval('canvas', canvas => ({ count: Number(canvas.dataset.machineCount),
    visibleTurbines: Number(canvas.dataset.effectTurbines), draws: Number(canvas.dataset.drawCalls) }));
  assert.equal(batch.draws, readings[1].draws, 'One hundred same-model turbines must share the same draw batches as one');
  await capture('turbines-100.png');
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await clickText('.rail-nav button', '工程科技');
  await page.waitForFunction(() => !document.querySelector('.factory-stage-3d canvas'));
  const cachedDraws = await page.evaluate(() => window.__effectDraws);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(await page.evaluate(() => window.__effectDraws), cachedDraws, 'Cached scene must stop rendering');
  await clickText('.rail-nav button', '工厂总览');
  await page.waitForSelector('canvas[data-scene-ready="true"]');
  await centerStage();
  await page.waitForFunction(draws => window.__effectDraws > draws, {}, cachedDraws);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({ result: 'passed', profiles: readings, batch, errors, external }));
} catch (error) {
  await mkdir(output, { recursive: true });
  console.error(await page?.evaluate(() => ({ state: document.querySelector('.factory-loading')?.textContent,
    canvas: { ...document.querySelector('.factory-stage-3d canvas')?.dataset }, machines: document.querySelector('.factory-machine-list')?.textContent })));
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
