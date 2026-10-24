import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';

const input = process.argv[2] ?? 'http://127.0.0.1:5175/demo.html';
const url = /^(https?:|file:)/.test(input) ? input : pathToFileURL(resolve(input)).href;
const output = resolve('outputs/redesign-verification');
mkdirSync(output, { recursive: true });
// 隔离测试存档只用于操作、规模和往返验证，不作为正常推进或经济平衡的证据。
const bundled = await build({ stdin: { contents: `
  import { GameCore } from './src/game/core';
  import { serialize } from './src/game/save';
  import { dec } from './src/numeric/decimal';
  import { baseModelOf, MACHINE_MODELS } from './src/game/models';
  const core = new GameCore(); core.maxTier = core.peakTier = 5; core.universes = ['arcane'];
  core.ores = core.ores.map(() => dec('1e12')); core.coins = core.coins.map(() => dec('1e12'));
  for (let tier = 1; tier <= 5; tier++) core.counts[baseModelOf('generator', tier).id] = 8;
  core.counts[baseModelOf('machine', 2).id] = 2;
  export const start = serialize(core);
  export const legacy = { ...serialize(core), version: 26, maxTier: 8, researchTargetModel: baseModelOf('machine', 8).id,
    researchProgressByModel: { [baseModelOf('machine', 8).id]: '12' }, researchInvestments: undefined,
    arcaneExpedition: undefined, enchantments: undefined, visPriorities: undefined };
  core.arcaneExpedition.act({ type: 'research', id: 'A0' }, core.arcaneContext());
  core.arcaneExpedition.state.research = 3;
  export const enchant = serialize(core);
  core.counts = {};
  core.counts[baseModelOf('machine', 2).id] = 1200;
  core.counts[baseModelOf('miner', 3).id] = 1200;
  export const scale = serialize(core);
  const reactor = MACHINE_MODELS.find(model => model.id === 'g-uhv-mb-naquadah');
  core.maxTier = core.peakTier = reactor.tier; core.counts = { [reactor.id]: 1 }; core.researchedModels = [reactor.id];
  export const risk = serialize(core);
  const node = core.arcaneExpedition.state.nodes[0];
  core.arcaneExpedition.state.nodes = Array.from({ length: 1000 }, (_, i) => ({ ...node, id: 'node-' + (i + 1), standId: 'stand-' + (i + 1001) }));
  core.arcaneExpedition.state.stands = Array.from({ length: 1000 }, (_, i) => ({ id: 'stand-' + (i + 1001), tier: 2, enclosed: false }));
  core.arcaneExpedition.state.nextId = 2001;
  export const nodes = serialize(core);
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const fixtures = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'), 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
assert.ok(executablePath, 'Chrome or Edge is required');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling'] });
const errors = [];
const store = page => page.evaluate(() => document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game').snap);
async function click(page, selector, label) {
  await page.waitForFunction(({ selector, label }) => [...document.querySelectorAll(selector)].some(el => el.textContent.trim().includes(label) && !el.disabled), { timeout: 15000 }, { selector, label });
  await page.$$eval(selector, (elements, label) => elements.find(el => el.textContent.trim().includes(label) && !el.disabled).click(), label);
}
async function seed(page, data) {
  const result = await page.evaluate(data => document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game').importSave(JSON.stringify(data)), data);
  assert.equal(result.ok, true, result.message);
}
async function save(page) { return page.evaluate(() => JSON.parse(document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game').exportSave())); }
try {
  for (const viewport of [{ width: 1600, height: 1050 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
    const page = await browser.newPage(); await page.setViewport(viewport);
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => { localStorage.setItem('gtnh-dev-preview:gtnh-incremental-motion', 'off'); localStorage.setItem('gtnh-incremental-motion', 'off'); });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await seed(page, fixtures.start);
    await click(page, '.rail-nav button', '科技');
    await page.waitForSelector('.arcane-panel');
    await click(page, '.arcane-panel .tabs button', '魔导研究');
    await page.$eval('.arcane-panel .research-row button:not(:disabled)', button => button.click());
    assert.equal((await store(page)).arcaneExpedition.nodes.length, 1, 'A0 must grant exactly one node');
    await click(page, '.arcane-panel .tabs button', '节点与安装');
    await page.select('.arcane-panel .build-row select', '1');
    await click(page, '.arcane-panel .build-row button', '确认购买');
    assert.equal((await store(page)).arcaneExpedition.surveys.length, 1);
    await page.select('.arcane-panel .build-row select', '2');
    await click(page, '.arcane-panel .build-row button', '确认购买');
    assert.equal((await store(page)).arcaneExpedition.benches.length, 1);
    await click(page, '.node-card .button-row button', '收藏保护');
    assert.equal((await store(page)).arcaneExpedition.nodes[0].protected, true);
    await page.$eval('.node-detail-button', button => button.click());
    await page.waitForSelector('[aria-label="节点详情与比较"]');
    await click(page, '[aria-label="节点详情与比较"] button', '关闭详情');
    await page.screenshot({ path: join(output, `arcane-${viewport.width}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must not overflow horizontally');
    const saved = await save(page);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal((await store(page)).arcaneExpedition.nodes.length, 1);
    assert.equal((await store(page)).arcaneExpedition.surveys.length, 1);
    assert.equal((await store(page)).arcaneExpedition.nodes[0].protected, true);
    assert.equal((await save(page)).arcaneExpedition.firstNodeGranted, saved.arcaneExpedition.firstNodeGranted);

    await seed(page, fixtures.enchant);
    await click(page, '.rail-nav button', '工厂');
    await click(page, '.machine-tab', '制造机');
    await click(page, '.tier-bar .trade button', 'I级附魔');
    assert.equal(Object.values((await save(page)).enchantments).flat().reduce((sum, count) => sum + count, 0), 2);
    await page.$eval('.tier-bar .trade select', select => { select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.ok(Object.values((await save(page)).visPriorities).includes(0));

    if (viewport.width === 1600) {
      await seed(page, fixtures.scale);
      const details = await page.$('details.factory-preview');
      if (details) await details.evaluate(element => { element.open = true; });
      await page.waitForSelector('canvas[data-scene-ready="true"][data-machine-count="2400"]', { timeout: 90000 });
      const metrics = await page.$eval('canvas[data-scene-ready="true"]', canvas => ({ ...canvas.dataset }));
      assert.equal(metrics.ownedCount, '2400'); assert.equal(metrics.blockCount, '2400'); assert.equal(metrics.iconCount, '0');
      assert.ok(Number(metrics.drawCalls) < 100, `Too many draw calls: ${metrics.drawCalls}`);
      await page.select('[aria-label="筛选设备类别"]', 'miner');
      await page.waitForFunction(() => document.querySelector('canvas[data-machine-count="1200"]'));
      await click(page, '.factory-filters button', '清除筛选');
      await page.waitForFunction(() => document.querySelector('canvas[data-machine-count="2400"]'));
      await page.$eval('.factory-machine-list > button', button => button.click());
      await page.waitForFunction(() => document.querySelector('.factory-footer-3d')?.textContent.includes('第 1 /'));
      await page.screenshot({ path: join(output, 'factory-2400.png') });
      console.log(JSON.stringify({ viewport, metrics }));
      await seed(page, fixtures.risk);
      await click(page, '.machine-tab', '发电机');
      page.once('dialog', dialog => dialog.dismiss());
      await click(page, '.tier-bar button', '高风险模式');
      assert.equal((await save(page)).reactorRiskArmed, false, 'Risk must remain off when confirmation is declined');
      page.once('dialog', dialog => dialog.accept());
      await click(page, '.tier-bar button', '高风险模式');
      assert.equal((await save(page)).reactorRiskArmed, true);
      await click(page, '.tier-bar button', '关闭高风险模式');
      assert.equal((await save(page)).reactorRiskArmed, false);
      const legacy = await page.evaluate(data => {
        const game = document.getElementById('app').__vue_app__.config.globalProperties.$pinia._s.get('game');
        const result = game.importSave(JSON.stringify(data)); game.stop();
        return { result, save: JSON.parse(game.exportSave()) };
      }, fixtures.legacy);
      assert.equal(legacy.result.ok, true);
      assert.deepEqual(legacy.save.ores, fixtures.legacy.ores);
      assert.deepEqual(legacy.save.coins, fixtures.legacy.coins);
      assert.deepEqual(legacy.save.counts, fixtures.legacy.counts);
      assert.equal(legacy.save.researchProgressByModel[fixtures.legacy.researchTargetModel], '12');
      assert.ok(legacy.save.researchInvestments.includes(fixtures.legacy.researchTargetModel));
      assert.equal(legacy.save.arcaneExpedition.nodes.length, 0);
    } else if (viewport.width === 390) {
      const started = performance.now();
      await seed(page, fixtures.nodes);
      await click(page, '.rail-nav button', '科技');
      await click(page, '.arcane-panel .tabs button', '节点与安装');
      assert.equal((await store(page)).arcaneExpedition.nodes.length, 1000);
      assert.equal(await page.$$eval('.arcane-panel .node-card', cards => cards.length), 24);
      await click(page, '[aria-label="节点分页"] button', '下一页');
      assert.ok(await page.$eval('[aria-label="节点分页"]', nav => nav.textContent.includes('2 / 42')));
      assert.ok(await page.$eval('.node-detail-button', button => button.textContent.includes('node-25')));
      assert.ok(performance.now() - started < 15000, '1000-node query must remain usable');
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', entry: input, checks: ['A0 actual research click and one-time grant', 'survey and bench construction', 'node protection and query', '360/390/1600 layouts', 'save reload', 'paid enchantment and priority', '2400 real devices, mixed representations and filtering', 'explicit high-risk confirmation and cancellation', '1000-node pagination', 'v26 import preserves balances, machines and research without repeat payment'], screenshotDirectory: output }));
} finally { await browser.close(); }
