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
    window.__factoryMetrics = { contexts: 0, draws: 0 };
    const seen = new WeakSet();
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const context = getContext.call(this, type, ...args);
      if (context && type.startsWith('webgl') && !seen.has(context)) {
        seen.add(context);
        window.__factoryMetrics.contexts++;
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          if (!context[name]) continue;
          const draw = context[name];
          context[name] = function(...args) { window.__factoryMetrics.draws++; return draw.apply(this, args); };
        }
      }
      return context;
    };
  }, seed);
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });
  await clickText('.factory-mode button', 'LV 演示');
  await page.waitForFunction(() => document.querySelectorAll('.factory-number').length === 6);
  assert.equal(await page.$$eval('.factory-machine-list > button', elements => elements.length), names.length);
  for (const name of names) assert.ok(await page.$eval('.factory-machine-list', (element, name) => element.textContent.includes(name), name));

  async function clickText(selector, text) {
    const handle = (await page.$$(selector));
    for (const item of handle) if ((await item.evaluate(element => element.getAttribute('aria-label') ?? element.textContent.trim())) === text) { await item.click(); return; }
    throw new Error(`Button not found: ${text}`);
  }
  assert.ok(await page.evaluate(() => document.body.classList.contains('motion-off')));
  await page.click('.vein-stage');
  await page.waitForSelector('.mining-effects .spark');
  assert.equal(await page.$eval('.mining-effects .spark', element => getComputedStyle(element).animationName), 'spark-up', 'Mining feedback must animate with continuous motion disabled');
  assert.equal(await page.$eval('.crack-strip', element => getComputedStyle(element).animationName), 'vein-frames');
  await page.waitForFunction(() => document.querySelector('.vein-sprite.shake')?.getAnimations().some(animation => animation.playState === 'running'));
  assert.equal(await page.$eval('.vein-clip > .vein-frames', element => getComputedStyle(element).animationName), 'none', 'The idle vein animation must remain disabled');
  await page.waitForFunction(() => !document.querySelector('.mining-effects .spark'));
  await page.focus('.vein-btn');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.mining-effects .spark');
  assert.deepEqual(await page.$eval('.mining-effects .spark', element => ({ x: element.style.left, y: element.style.top })), { x: '84px', y: '84px' }, 'Keyboard mining feedback must use the stone center');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => !document.querySelector('.mining-effects .spark'));
  await page.click('.vein-stage');
  assert.equal(await page.$('.mining-effects .spark'), null, 'System reduced motion must suppress mining effects');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.waitForFunction(() => !document.querySelector('.factory-view-actions button[disabled][aria-pressed]'));
  await page.click('.vein-stage');
  await page.waitForSelector('.mining-effects .spark');
  await page.waitForFunction(() => !document.querySelector('.mining-effects .spark'));
  await page.$eval('.factory-scene-3d', element => element.scrollIntoView({ block: 'start' }));
  await new Promise(resolve => setTimeout(resolve, 400));
  const stageBox = await (await page.$('.factory-stage-3d')).boundingBox();
  const pageScrollBeforeWheel = await page.$eval('.page-body', element => element.scrollTop);
  await page.mouse.move(stageBox.x + stageBox.width * 0.5, stageBox.y + stageBox.height * 0.75);
  await page.mouse.wheel({ deltaY: 240 });
  await page.waitForFunction(before => document.querySelector('.page-body')?.scrollTop > before, {}, pageScrollBeforeWheel);
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
  await clickText('.factory-view-actions button', '复位全景');
  const canvas = await page.$('.factory-stage-3d canvas');
  const rect = await canvas.boundingBox();
  const before = await canvas.screenshot();
  await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await new Promise(resolve => setTimeout(resolve, 400));
  const afterLook = await canvas.screenshot();
  assert.notDeepEqual(afterLook, before, 'Left drag must change the free-flight view direction');
  await page.focus('.factory-stage-3d canvas');
  await page.keyboard.down('w');
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.keyboard.up('w');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.notDeepEqual(await canvas.screenshot(), afterLook, 'Holding W must move the free-flight camera');
  await clickText('.factory-view-actions button', '全屏');
  await page.waitForFunction(() => !!document.fullscreenElement);
  await clickText('.factory-view-actions button', '地板全景');
  await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center' }));
  await new Promise(resolve => setTimeout(resolve, 300));
  await (await page.$('.factory-stage-3d')).screenshot({ path: join(output, 'blueprint-floor.png') });
  assert.notDeepEqual(await canvas.screenshot(), before, 'Floor overview must show a different view from the device overview');
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await clickText('.factory-view-actions button', '复位全景');
  await clickText('.factory-mode button', '实际厂区');
  await page.waitForFunction(() => document.querySelector('.factory-view-toolbar')?.textContent.includes('已建造 6 台'));
  await page.click('[data-model-id="m-2"]');
  await clickText('.factory-footer-3d button', '管理设备 · 打开工作台');
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
  await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center' }));
  await new Promise(resolve => setTimeout(resolve, 200));
  const projectedLabels = () => page.$$eval('.factory-number', elements => elements.map(element => ({ name: element.getAttribute('aria-label'), left: element.style.left, top: element.style.top })));
  const cameraBeforeNavigation = await projectedLabels();
  assert.ok(cameraBeforeNavigation.length > 0, 'Camera retention needs visible projected anchors');
  await page.evaluate(() => { window.__factoryCanvas = document.querySelector('.factory-stage-3d canvas'); });
  const returns = [];
  for (const destination of ['工程科技', '时空星图', '设置与存档']) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await clickText('.rail-nav button', destination);
    await page.waitForFunction(() => !document.querySelector('.factory-stage-3d canvas'));
    const draws = await page.evaluate(() => window.__factoryMetrics.draws);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(await page.evaluate(() => window.__factoryMetrics.draws), draws, 'Cached factory must not draw while another page is open');
    const start = await page.evaluate(() => {
      const start = performance.now();
      [...document.querySelectorAll('.rail-nav button')].find(button => button.getAttribute('aria-label') === '工厂总览').click();
      return start;
    });
    await page.waitForSelector('canvas[data-scene-ready="true"]');
    returns.push(Math.round(await page.evaluate(start => performance.now() - start, start)));
    assert.ok(await page.evaluate(() => window.__factoryCanvas === document.querySelector('.factory-stage-3d canvas')), 'Navigation must retain the original canvas');
    assert.equal(await page.evaluate(() => window.__factoryMetrics.contexts), 1, 'Navigation must not create another WebGL context');
    assert.equal(await page.$eval('.factory-mode button:last-child', button => button.getAttribute('aria-pressed')), 'true', 'Actual factory mode must be retained');
    assert.equal(await page.$eval('[data-model-id="m-2"]', button => button.getAttribute('aria-pressed')), 'true', 'Machine selection must be retained');
    await page.$eval('.factory-stage-3d', element => element.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(draws => window.__factoryMetrics.draws > draws, {}, draws);
    assert.deepEqual(await projectedLabels(), cameraBeforeNavigation, 'Projected camera anchors must survive navigation');
  }
  await clickText('.factory-mode button', 'LV 演示');
  assert.ok(await page.$$eval('.factory-machine-state', elements => elements.every(element => element.textContent.trim() === '待机')), 'Paused demo must remain paused after navigation');
  // 文案表示当前状态：初始为“动态：关”，点击后才开启动画。
  await clickText('.factory-view-actions button', '动态：关');
  await clickText('.factory-view-actions button', '运行演示');
  const animatedDraws = await page.evaluate(() => window.__factoryMetrics.draws);
  await page.waitForFunction(draws => window.__factoryMetrics.draws > draws, {}, animatedDraws);
  await clickText('.factory-view-actions button', '动态：开');
  const stoppedDraws = await page.evaluate(() => window.__factoryMetrics.draws);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await page.evaluate(() => window.__factoryMetrics.draws), stoppedDraws, 'Dynamic off must stop machine animation and particles');
  await clickText('.factory-view-actions button', '动态：关');
  const resumedDraws = await page.evaluate(() => window.__factoryMetrics.draws);
  await page.waitForFunction(draws => window.__factoryMetrics.draws > draws, {}, resumedDraws);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickText('.rail-nav button', '工程科技');
  await page.waitForFunction(() => !document.querySelector('.factory-stage-3d canvas'));
  const pausedDraws = await page.evaluate(() => window.__factoryMetrics.draws);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(await page.evaluate(() => window.__factoryMetrics.draws), pausedDraws, 'Animated scene must stop drawing while cached');
  await clickText('.rail-nav button', '工厂总览');
  await page.waitForSelector('canvas[data-scene-ready="true"]');
  await page.waitForFunction(draws => window.__factoryMetrics.draws > draws, {}, pausedDraws);
  assert.equal(await page.evaluate(() => window.__factoryMetrics.contexts), 1);
  const background = await browser.newPage();
  await background.bringToFront();
  await page.waitForFunction(() => document.hidden, { polling: 50 });
  const backgroundDraws = await page.evaluate(() => window.__factoryMetrics.draws);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await page.evaluate(() => window.__factoryMetrics.draws), backgroundDraws, 'Background tab must stop drawing');
  await page.bringToFront();
  await page.waitForFunction(draws => window.__factoryMetrics.draws > draws, {}, backgroundDraws);
  await background.close();
  await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 1 });
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(await page.$eval('.factory-stage-3d canvas', canvas => canvas.width > 0 && canvas.clientWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('Verified: mining feedback with continuous motion off, keyboard mining, system reduced motion, 6 Modernity machines, pause, focus, camera, floor, actual counts, purchase, stop/resume, cached navigation, hidden rendering pause, resize, offline file.');
  console.log(`Return to factory (motion off): ${returns.join(', ')} ms; WebGL contexts: 1.`);
  console.log(`Screenshots: ${output}`);
} catch (error) {
  console.error(await page?.evaluate(() => ({ toolbar: document.querySelector('.factory-view-toolbar')?.textContent,
    machines: document.querySelector('.factory-machine-list')?.textContent,
    workshop: document.querySelector('.machine-panel')?.textContent, errors: document.querySelector('.factory-loading')?.textContent })));
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true });
  throw error;
} finally { await browser.close(); }
