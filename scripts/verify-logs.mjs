import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const html = resolve(process.argv[2] ?? join(root, 'dist/GTNH-Incremental.html'));
const logKey = 'gtnh-incremental-log';
const seedBuild = await build({
  stdin: {
    contents: `
      import { GameCore } from './src/game/core';
      import { serialize } from './src/game/save';
      import { dec } from './src/numeric/decimal';
      const core = new GameCore();
      core.maxTier = core.peakTier = 2;
      core.ores[0] = core.ores[1] = dec('1e9');
      core.coins[0] = core.coins[1] = dec('1e9');
      core.soundEnabled = false;
      core.counts = { 'g-lv-steam': 10, 'm-2': 1 };
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
const page = await browser.newPage();
const errors = [];
const external = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
try {
  await page.setViewport({ width: 1680, height: 1150, deviceScaleFactor: 1 });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
  await page.evaluateOnNewDocument(({ seed, logKey }) => {
    if (!sessionStorage.getItem('log-verification-seeded')) {
      const entries = Array.from({ length: 85 }, (_, index) => {
        const at = new Date(Date.now() - (index < 40 ? 3600000 : 60000)).toISOString();
        return { seq: index + 1, at, timestamp: at, level: index === 2 ? 'error' : index === 3 ? 'warn' : 'info',
          code: index === 2 ? 'save.read' : 'app.history', message: '历史验证记录 ' + index,
          gameSeconds: index, sessionId: 'verification-previous', version: 'fixture', build: 'fixture' };
      });
      localStorage.setItem('gtnh-incremental-save', JSON.stringify(seed));
      localStorage.setItem('gtnh-incremental-motion', 'off');
      localStorage.setItem(logKey, JSON.stringify(entries));
      sessionStorage.setItem('log-verification-seeded', 'true');
    }
    window.__logDownloads = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__logDownloads.push(blob); return create(blob); };
  }, { seed, logKey });

  const clickText = async (selector, text) => {
    for (const button of await page.$$(selector)) {
      if ((await button.evaluate(element => element.getAttribute('aria-label') ?? element.textContent.trim())) === text) { await button.click(); return; }
    }
    throw new Error('Button not found: ' + text);
  };
  const settings = async () => {
    await clickText('.rail-nav button', '设置与存档');
    await page.waitForSelector('.log-panel');
  };
  const logs = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), logKey);

  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.waitForSelector('[data-model-id="m-2"]');
  await page.click('[data-model-id="m-2"]');
  let minerRow;
  for (const row of await page.$$('.tier-bar')) {
    if ((await row.$eval('.model-label', element => element.textContent)) === '基础采矿机') minerRow = row;
  }
  assert.ok(minerRow, 'Purchase must use the actual workshop');
  await (await minerRow.$('.trade button')).click();
  await (await minerRow.$('.oc-btn:last-child')).click();
  await (await minerRow.$('.run-btn')).click();
  await (await minerRow.$('.run-btn')).click();
  await (await minerRow.$('.sell-btn')).click();
  await settings();
  await page.waitForFunction(() => document.querySelectorAll('.log-item').length === 60);
  await clickText('.log-more button', '加载更早记录');
  assert.ok(await page.$$eval('.log-item', entries => entries.length > 60));
  await page.select('.log-filters select', 'error');
  assert.ok(await page.$$eval('.log-item', entries => entries.length > 0 && entries.every(entry => entry.classList.contains('error'))));
  await clickText('.log-filters button', '重置筛选');
  const selects = await page.$$('.log-filters select');
  await selects[1].select('machine');
  await page.type('.log-search input', 'm-2');
  await page.waitForFunction(() => document.querySelectorAll('.log-item').length >= 5);
  assert.equal(await page.$$eval('.log-category', entries => entries.every(entry => entry.textContent === '设备')), true);
  await (await page.$('.log-detail summary')).click();
  assert.ok(await page.$eval('.log-detail[open] pre', element => element.textContent.includes('modelId')));
  const screenshotDir = join(root, 'outputs/verification/logs');
  mkdirSync(screenshotDir, { recursive: true });
  await (await page.$('.log-panel')).screenshot({ path: join(screenshotDir, 'log-panel.png') });

  await clickText('.log-filters button', '重置筛选');
  await page.type('.log-search input', '不存在的日志关键词');
  await page.waitForFunction(() => document.querySelector('.log-panel').textContent.includes('没有符合筛选条件'));
  await clickText('.log-filters button', '重置筛选');
  assert.equal(await page.$$eval('.log-item', entries => entries.some(entry => entry.textContent.includes('历史验证记录 39'))), true);
  await selects[2].select('5');
  assert.equal(await page.$$eval('.log-item', entries => entries.some(entry => entry.textContent.includes('历史验证记录 39'))), false);
  await clickText('.log-filters button', '重置筛选');
  await page.click('.log-filters input[type="checkbox"]');
  assert.equal(await page.$$eval('.log-item', entries => entries.some(entry => entry.textContent.includes('历史验证记录'))), false);
  await clickText('.log-filters button', '重置筛选');

  await clickText('.log-actions button', '下载 JSON');
  const exported = await page.evaluate(async () => JSON.parse(await window.__logDownloads.at(-1).text()));
  assert.ok(exported.entries.length > 60, 'Export includes older records beyond the visible page');
  assert.ok(exported.entries.some(entry => entry.code === 'machine.buy' && entry.context.actual === 1));
  assert.ok(exported.entries.some(entry => entry.code === 'machine.sell' && entry.context.actual === 1));
  assert.ok(exported.entries.some(entry => entry.code === 'machine.overclock'));
  await clickText('.log-actions button', '下载 TXT');
  assert.ok(await page.evaluate(async () => (await window.__logDownloads.at(-1).text()).includes('--- 导出时的游戏状态 ---')));

  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async text => { window.__copiedLog = text; } } }));
  await clickText('.log-actions button', '复制日志');
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('已复制完整日志'));
  assert.ok(await page.evaluate(() => window.__copiedLog.includes('GTNH-Incremental 诊断日志')));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
    document.execCommand = () => false;
  });
  await clickText('.log-actions button', '复制日志');
  await page.waitForSelector('.log-fallback');
  assert.ok(await page.$eval('.log-fallback', element => element.value.includes('GTNH-Incremental 诊断日志')));
  assert.equal(await page.$$eval('body > textarea', entries => entries.length), 0);

  await page.click('.log-options input[type="checkbox"]');
  await clickText('.rail-nav button', '工厂总览');
  await page.waitForSelector('.vein-btn');
  for (let index = 0; index < 3; index++) await page.click('.vein-btn');
  await settings();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).some(entry => entry.level === 'debug' && entry.repeat >= 3), {}, logKey);
  const beforeReload = await logs();
  const previousSession = beforeReload.at(-1).sessionId;
  await page.reload({ waitUntil: 'load' });
  await settings();
  assert.equal(await page.$eval('.log-options input', element => element.checked), false);
  await page.waitForFunction(({ key, session }) => JSON.parse(localStorage.getItem(key)).some(entry => entry.code === 'app.boot' && entry.sessionId !== session), {}, { key: logKey, session: previousSession });
  assert.ok((await logs()).some(entry => entry.code === 'machine.buy'));

  for (const name of ['原版亮灰', '经典深色', '暗钢造型']) {
    const menu = await page.$$('.settings-workspace .mode-menu-wrap');
    let opened = false;
    for (const wrapper of menu) {
      const button = await wrapper.$('button');
      if (button && /暗钢造型|原版亮灰|经典深色/.test(await button.evaluate(element => element.textContent))) {
        await button.click(); opened = true; break;
      }
    }
    if (!opened) {
      for (const button of await page.$$('.settings-workspace button')) {
        if (/^(暗钢造型|原版亮灰|经典深色) ▾$/.test(await button.evaluate(element => element.textContent.trim()))) { await button.click(); opened = true; break; }
      }
    }
    assert.ok(opened, 'Theme selector must be accessible');
    await clickText('.mode-menu button', name);
    assert.equal(await page.evaluate(() => document.body.classList.contains('skin-light')), name === '原版亮灰');
    assert.equal(await page.evaluate(() => document.body.classList.contains('theme-classic')), name === '经典深色');
    assert.ok(await page.$eval('.log-panel', element => element.offsetWidth > 0));
  }
  await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 1 });
  assert.equal(await page.$eval('.log-panel', element => element.scrollWidth <= element.clientWidth), true);

  page.once('dialog', dialog => dialog.accept());
  await clickText('.log-actions button', '清空');
  assert.deepEqual(await logs(), []);
  await clickText('.rail-nav button', '工厂总览');
  await page.waitForSelector('.vein-btn');
  // 在隔离页面中触发异常事件，验证真实捕获入口及未读提示，不产生未捕获执行异常。
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: '日志验证错误', error: new Error('日志验证错误') })));
  await page.waitForSelector('.nav-badge');
  await settings();
  await page.waitForSelector('.log-item.error');
  assert.equal(await page.$('.nav-badge'), null);
  assert.ok((await logs()).some(entry => entry.code === 'window.error' && entry.detail.includes('电压上限')));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('Verified: actual purchase/sale/overclock/stop, filters, paging, TXT/JSON payloads, clipboard fallback, debug aggregation, reload, themes, clear, crash capture and unread badge; no external requests.');
} finally {
  await browser.close();
}
