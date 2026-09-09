import { chromium } from 'playwright';
const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split('')) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(delayMs);
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const failed = [];
  const allResp = [];
  page.on('response', (r) => {
    allResp.push(`${r.status()} ${r.url()}`);
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByLabel('Key 9', { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
  await tapDigitsOnce(page, '9199990005', 150);
  await page.waitForTimeout(1200);
  allResp.length = 0; failed.length = 0;
  await page.getByText('Send OTP', { exact: false }).first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/diag-dco-otp-fail-state.png`, fullPage: true });
  console.log('--- failed responses ---');
  console.log(failed.join('\n'));
  console.log('--- all responses since click ---');
  console.log(allResp.join('\n'));
  await browser.close();
})();
