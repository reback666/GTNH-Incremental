import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const html = resolve(process.argv[2] ?? join(root, 'dist/GTNH-Incremental.html'));
const seedBuild = await build({
  stdin: {
    contents: `
      import { GameCore } from './src/game/core';
      import { serialize } from './src/game/save';
      import { dec } from './src/numeric/decimal';
      const core = new GameCore();
      core.maxTier = core.peakTier = 2;
      core.ores[0] = core.ores[1] = core.coins[0] = core.coins[1] = dec('1e9');
      core.counts = { 'g-lv-steam': 10, 'm-2': 1 };
      core.cables = dec('5');
      core.devMode = true;
      core.soundEnabled = false;
      export const seed = serialize(core);
    `,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const { seed } = await import(`data:text/javascript;base64,${Buffer.from(seedBuild.outputFiles[0].contents).toString('base64')}`);
const executablePath = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));
assert.ok(executablePath, 'Chrome or Edge is required');
const browser = await puppeteer.launch({ executablePath, headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1150, deviceScaleFactor: 1 });
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.evaluateOnNewDocument(seed => {
    localStorage.setItem('gtnh-incremental-save', JSON.stringify(seed));
    localStorage.setItem('gtnh-incremental-motion', 'off');
    const at = new Date().toISOString();
    localStorage.setItem('gtnh-incremental-log', JSON.stringify(Array.from({ length: 150 }, (_, index) => ({
      seq: index + 1, at, timestamp: at, level: 'info', code: 'app.history', message: `缓存记录 ${index}`,
      gameSeconds: index, sessionId: 'cache-fixture', version: 'fixture', build: 'fixture',
    }))));
    window.__cachedPages = {};
  }, seed);
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });

  const selectors = { '工厂总览': '.factory-workspace', '工程科技': '.technology-workspace', '时空星图': '.starmap', '设置与存档': '.settings-workspace' };
  async function visit(name) {
    const start = await page.evaluate(name => {
      const start = performance.now();
      [...document.querySelectorAll('.rail-nav button')].find(button => button.getAttribute('aria-label') === name).click();
      return start;
    }, name);
    await page.waitForSelector(selectors[name]);
    const result = await page.evaluate(({ name, selector, start }) => {
      const element = document.querySelector(selector);
      const cached = window.__cachedPages[name];
      window.__cachedPages[name] = element;
      return { retained: !cached || cached === element, elapsed: Math.round(performance.now() - start) };
    }, { name, selector: selectors[name], start });
    assert.ok(result.retained, `${name} must retain its existing DOM`);
    return result.elapsed;
  }
  async function clickText(selector, text) {
    for (const button of await page.$$(selector)) {
      if ((await button.evaluate(element => element.textContent.trim())) === text) { await button.click(); return; }
    }
    throw new Error(`Button not found: ${text}`);
  }
  async function amount(value) {
    await page.$eval('.dev-amount', (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  }
  const timings = [];
  await page.focus('.machine-tab');
  await page.waitForSelector('.model-tip');
  for (let round = 0; round < 3; round++) {
    for (const name of Object.keys(selectors)) {
      const elapsed = await visit(name);
      if (round > 0) timings.push(`${name} ${elapsed}ms`);
    }
  }
  assert.equal(await page.$('.model-tip'), null, 'Leaving the factory must close its teleported tooltip');

  await visit('时空星图');
  const speed = '.quest-node[aria-label^="全机器速度，"]';
  const minerSpeed = '.quest-node[aria-label^="采矿机速度，"]';
  await page.$eval('.starmap-viewport', element => element.scrollTo(260, 420));
  await page.waitForFunction(() => document.querySelector('.starmap-viewport').scrollTop === 420);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.click(speed);
  await page.waitForSelector(`${speed}.is-owned`);
  assert.equal(await page.$eval(minerSpeed, button => button.getAttribute('aria-disabled')), 'false');
  const pan = await page.$eval('.starmap-viewport', element => ({ left: element.scrollLeft, top: element.scrollTop }));
  await visit('设置与存档');
  assert.ok(await page.evaluate(() => window.__cachedPages['时空星图'].classList.contains('starmap-inactive')));
  await amount('12345');
  await page.select('.resource-row select', 'cables');
  await page.type('.log-search input', '缓存记录');
  await page.waitForFunction(() => document.querySelectorAll('.log-item').length === 60);
  await clickText('.log-more button', '加载更早记录');
  await page.click('.log-detail summary');
  await visit('工程科技');
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: '缓存验证错误', error: new Error('缓存验证错误') })));
  await page.waitForSelector('.nav-badge');
  await visit('时空星图');
  await page.waitForFunction(pan => {
    const element = document.querySelector('.starmap-viewport');
    return element.scrollLeft === pan.left && element.scrollTop === pan.top;
  }, {}, pan);
  assert.equal(await page.$('.quest-tip'), null, 'Hover tips must close when leaving the starmap');
  assert.ok(await page.$(`${speed}.is-owned`));
  assert.ok(await page.$('.nav-badge'), 'A hidden log panel must not acknowledge new errors');
  await visit('设置与存档');
  assert.equal(await page.$eval('.dev-amount', input => input.value), '12345');
  assert.equal(await page.$eval('.resource-row select', input => input.value), 'cables');
  assert.equal(await page.$eval('.log-search input', input => input.value), '缓存记录');
  assert.equal(await page.$$eval('.log-item', elements => elements.length), 120);
  assert.ok(await page.$('.log-detail[open]'));
  assert.equal(await page.$('.nav-badge'), null);
  await page.$eval('.log-search input', input => { input.value = '缓存验证错误'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForSelector('.log-item.error');

  await amount('3');
  await clickText('.resource-row button', '减少');
  await visit('时空星图');
  assert.equal(await page.$eval('.hud-cables', element => element.textContent.trim()), '1');
  assert.equal(await page.$eval(minerSpeed, button => button.getAttribute('aria-disabled')), 'true', 'Cached nodes must reflect a changed balance');
  await visit('设置与存档');
  await page.select('.dev-tools > .row:first-child select', '3');
  await clickText('.dev-tools > .row:first-child button', '解锁');
  await visit('工程科技');
  assert.equal(await page.$eval('.tags .tag:nth-child(3) b', element => element.textContent), '已解锁');

  await visit('设置与存档');
  page.once('dialog', dialog => dialog.accept());
  await clickText('.settings-workspace button', '重置');
  await visit('时空星图');
  assert.equal(await page.$eval('.hud-cables', element => element.textContent.trim()), '0');
  assert.equal(await page.$('.quest-node.is-owned'), null, 'A reset must clear old ownership in cached pages');
  await visit('工程科技');
  assert.equal(await page.$eval('.tags .tag:nth-child(3) b', element => element.textContent), '未解锁');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('Verified: all four pages retain DOM, starmap position and purchased nodes, settings inputs, log filters/paging/details, hidden error badge, live balances/unlocks and reset.');
  console.log(`Cached navigation (motion off): ${timings.join('; ')}.`);
} finally { await browser.close(); }
