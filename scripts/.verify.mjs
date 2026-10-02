const { chromium } = await import('file:///C:/Users/29797/AppData/Roaming/npm/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem('gtnh-incremental-save', JSON.stringify({
    version: 22, counts: { 'g-ulv': 6, 'm-1': 4, 'c-1': 3 },
    maxTier: 2, unlockedVeins: [0, 1],
    ores: ['1e6', '1e6'], coins: ['1e6'],
    playSeconds: 60, totalOre: '0', totalCoins: '0', totalOreSpent: '0',
  }));
});
const page = await context.newPage();
await page.goto('file:///C:/Users/29797/Documents/ChatGPT/gtnh%E5%A2%9E%E9%87%8F/dist/GTNH%E5%A2%9E%E9%87%8F.html');
await page.waitForTimeout(1500);
await page.locator('.page-nav .page-dot').nth(0).click();
await page.waitForTimeout(400);

for (const label of ['原始采矿机', 'ULV 制造机', '原始发电机']) {
  const bar = page.locator('.tier-bar', { hasText: label }).first();
  await bar.scrollIntoViewIfNeeded();
  const iconsLeft = await bar.locator('.tier-icons').evaluate((el) => el.getBoundingClientRect().left);
  const btnLeft = await bar.locator('.run-btn').evaluate((el) => el.getBoundingClientRect().left);
  console.log(label, '| icons.left =', iconsLeft.toFixed(1), '| btn.left =', btnLeft.toFixed(1), '| delta =', (btnLeft - iconsLeft).toFixed(1));
}
await page.screenshot({ path: 'docs/run-button-second-line.png' });
await browser.close();
