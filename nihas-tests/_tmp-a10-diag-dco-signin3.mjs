import { chromium } from 'playwright';
const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split('')) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(delayMs);
  }
}
async function clearDigits(page, maxTaps) {
  const del = page.getByLabel('Delete last digit', { exact: true }).first();
  for (let i = 0; i < maxTaps; i++) { await del.click().catch(() => {}); await page.waitForTimeout(60); }
}
async function tapDigits(page, digits, { verify } = {}) {
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    if (await verify().catch(() => false)) return;
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const failed = [];
  const allResp = [];
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('response', (r) => {
    allResp.push(`${r.status()} ${r.url()}`);
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await tapDigits(page, '9199990005', { verify: () => page.getByText('919 999 0005', { exact: false }).first().isVisible() });
  await page.waitForTimeout(500);
  logs.length = 0; allResp.length = 0; failed.length = 0;
  await page.getByText('Send OTP', { exact: false }).first().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/diag-dco-otp-fail-state2.png`, fullPage: true });
  console.log('--- failed responses ---');
  console.log(failed.join('\n') || '(none)');
  console.log('--- all responses since click ---');
  console.log(allResp.join('\n') || '(none)');
  console.log('--- console since click ---');
  console.log(logs.join('\n') || '(none)');
  await browser.close();
})();
