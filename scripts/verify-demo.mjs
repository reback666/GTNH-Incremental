import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const input = process.argv[2] ?? 'http://127.0.0.1:5175/demo.html';
const url = /^(https?:|file:)/.test(input) ? input : pathToFileURL(resolve(input)).href;
const output = resolve('outputs/dev-system-preview');
mkdirSync(output, { recursive: true });
const scope = 'gtnh-dev-preview:';
const saveKey = `${scope}gtnh-incremental-save`;
const originalKeys = ['gtnh-incremental-save', 'gtnh-incremental-save-time', 'gtnh-incremental-theme', 'gtnh-incremental-ui', 'gtnh-incremental-log', 'gtnh-incremental-motion', 'gtnh-material-demo-v1', 'gtnh-single-coin-demo-v1'];
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'), 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
assert.ok(executablePath, 'Chrome or Edge is required');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling'] });
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const snapshot = page => page.evaluate(() => document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game').snap);
const coinBalance = snapshot => Number(snapshot.coins.find(row => row.tier === 1).value);
const oreBalance = snapshot => Number(snapshot.ores.find(row => row.tier === 0).value);
async function clickText(page, selector, text) {
  await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(element => element.textContent.trim().includes(text) && !element.disabled), { timeout: 10000 }, { selector, text });
  await page.$$eval(selector, (elements, text) => elements.find(element => element.textContent.trim().includes(text) && !element.disabled).click(), text);
}
async function elapse(page, seconds) {
  await page.evaluate(seconds => { window.__previewClockOffset += seconds * 1000; }, seconds);
  await pause(1200);
  await page.waitForFunction(() => !document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game').catchingUp, { timeout: 120000 });
}
async function tab(page, label) { await clickText(page, '.machine-tab', label); }
async function pay(page, label) { await clickText(page, '.pay-row button', label); }
async function buyFirst(page) {
  const selector = '.tier-bar .trade button:not(.sell-btn)';
  await page.waitForFunction(selector => { const button = document.querySelector(selector); return button && !button.disabled; }, { timeout: 10000 }, selector);
  await page.$eval(selector, button => button.click());
}
async function isolation(page) {
  for (const key of originalKeys) assert.equal(await page.evaluate(key => localStorage.getItem(key), key), `untouched:${key}`);
}
async function prepare(page, viewport) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(({ keys, scope }) => {
    for (const key of keys) if (!localStorage.getItem(key)) localStorage.setItem(key, `untouched:${key}`);
    localStorage.setItem(`${scope}gtnh-incremental-motion`, 'off');
    window.__previewClockOffset = 0;
    const now = Date.now.bind(Date); const performanceNow = performance.now.bind(performance);
    Date.now = () => now() + window.__previewClockOffset;
    Object.defineProperty(performance, 'now', { value: () => performanceNow() + window.__previewClockOffset });
    const requestFrame = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => requestFrame(stamp => callback(stamp + window.__previewClockOffset));
  }, { keys: originalKeys, scope });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });
  const empty = await snapshot(page);
  assert.equal(oreBalance(empty), 0); assert.equal(coinBalance(empty), 0); assert.equal(empty.maxTier, 1);
  assert.ok(await page.$('.resource-group'));
  assert.equal(await page.evaluate(() => /实时能力，不囤积|手动开采每次 \+1 GT 币/.test(document.body.innerText)), false);
}
async function starter(page) {
  await page.$eval('.vein-btn', button => { for (let index = 0; index < 16; index++) button.click(); });
  const mined = await snapshot(page);
  assert.equal(oreBalance(mined), 16, 'Manual mining must add ore stock');
  assert.equal(coinBalance(mined), 0, 'Manual mining must never award GT coins');
  await tab(page, '采矿机'); await pay(page, '同级矿石'); await buyFirst(page);
  await tab(page, '发电机'); await pay(page, '同级矿石'); await buyFirst(page);
  await tab(page, '制造机'); await pay(page, '同级矿石'); await buyFirst(page);
  const built = await snapshot(page);
  assert.equal(built.factory.machineCount, 3);
  assert.equal(coinBalance(built), 0);
  await elapse(page, 20);
  const automatic = await snapshot(page);
  assert.ok(coinBalance(automatic) > 0, 'Manufacturing must produce coins');
  assert.ok(oreBalance(automatic) > oreBalance(built), 'Mining must build an actual surplus stock');
  assert.equal(await page.$eval('.factory-goal', element => element.textContent.includes('推进本级机型研究')), false, 'ULV goals must not direct players to unavailable future research');
  await isolation(page);
}
try {
  const desktop = await browser.newPage();
  await prepare(desktop, { width: 1600, height: 1050, deviceScaleFactor: 1 });
  await starter(desktop);
  await desktop.screenshot({ path: join(output, 'desktop-factory.png') });
  await tab(desktop, '采矿机'); await desktop.$eval('.tier-bar .run-btn', button => button.click());
  await elapse(desktop, 2); const stored = await snapshot(desktop);
  await elapse(desktop, 4); const afterStored = await snapshot(desktop);
  assert.ok(coinBalance(afterStored) > coinBalance(stored), 'Stored ore must keep manufacturing alive without a running miner');
  assert.ok(oreBalance(afterStored) < oreBalance(stored), 'Fuel and manufacturing must consume stored ore');
  await tab(desktop, '发电机'); await desktop.$eval('.tier-bar .run-btn', button => button.click());
  await elapse(desktop, 2); const unpowered = coinBalance(await snapshot(desktop));
  await elapse(desktop, 3); assert.equal(coinBalance(await snapshot(desktop)), unpowered, 'Manufacturing must stop without power');
  await desktop.$eval('.tier-bar .run-btn', button => button.click());
  await tab(desktop, '采矿机'); await desktop.$eval('.tier-bar .run-btn', button => button.click());
  await elapse(desktop, 720);
  await pay(desktop, 'GT 币'); await buyFirst(desktop);
  assert.equal((await snapshot(desktop)).factory.machineCount, 4);
  await desktop.reload({ waitUntil: 'networkidle0' });
  await desktop.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });
  const restored = await snapshot(desktop);
  assert.equal(restored.factory.machineCount, 4); assert.ok(oreBalance(restored) > 0);
  const saved = await desktop.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
  assert.ok(Array.isArray(saved.ores) && Array.isArray(saved.coins));
  assert.equal(saved.kind, undefined, 'Preview must use the existing dev save schema');
  await elapse(desktop, 40000);
  const beforeBreakthrough = await snapshot(desktop);
  assert.equal(beforeBreakthrough.maxTier, 1, 'Time alone must never confirm a voltage breakthrough');
  assert.ok(beforeBreakthrough.canUnlock, 'The original starter must be able to earn the LV unlock cost');
  await clickText(desktop, '.expansion-card button', '解锁 LV');
  const lv = await snapshot(desktop);
  assert.equal(lv.maxTier, 2, 'LV must unlock through its actual UI action');
  assert.ok(lv.veins.includes(1), 'LV must open the real T1 vein');
  assert.ok(coinBalance(lv) < coinBalance(beforeBreakthrough), 'Breakthrough must spend earned ULV coins');
  await desktop.reload({ waitUntil: 'networkidle0' });
  await desktop.waitForSelector('canvas[data-scene-ready="true"]', { timeout: 90000 });
  assert.equal((await snapshot(desktop)).maxTier, 2, 'LV breakthrough must survive saving and reload');
  await clickText(desktop, '.rail-nav button', '科技');
  await desktop.screenshot({ path: join(output, 'desktop-technology.png') });
  await clickText(desktop, '.rail-nav button', '星图');
  await clickText(desktop, '.rail-nav button', '设置');
  await desktop.waitForSelector('.settings-workspace');
  await isolation(desktop);
  const context = await browser.createBrowserContext();
  const narrow = await context.newPage();
  await prepare(narrow, { width: 900, height: 1000, deviceScaleFactor: 1 });
  await starter(narrow);
  await narrow.screenshot({ path: join(output, 'narrow-factory.png') });
  await isolation(narrow);
  await context.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', entry: input, checks: ['shared dev application', 'manual mining only adds ore', 'ore-funded starter', 'automatic ore storage and manufacturing', 'manufacturing uses stored ore while mining is stopped', 'fuel and manufacturing consume ore', 'power loss stops manufacturing', 'coin-funded construction', 'existing save schema and reload', 'LV breakthrough through earned coins and real UI', 'LV vein and save reload', 'technology and rebirth pages', 'formal and discarded save isolation'], screenshotDirectory: output, errors }, null, 2));
} finally { await browser.close(); }
