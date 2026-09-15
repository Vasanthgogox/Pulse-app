import { chromium } from 'playwright';
const APP = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill('godrej@gmail.com');
  await page.getByPlaceholder('Your password').first().fill('godrej123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.goto(`${APP}/oms/execution-plans`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);
  const btn = page.locator('button, a, div[role="button"]').filter({ hasText: '2026' }).first();
  const html = await btn.evaluate(n => n.outerHTML.slice(0, 400));
  console.log('date control HTML:', html);
  await btn.click({ force: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/date-probe-2.png`, fullPage: true });
  // dump any popover/portal content appended to body
  const bodyChildren = await page.evaluate(() => document.body.children.length);
  console.log('body children:', bodyChildren);
  await browser.close();
})();
