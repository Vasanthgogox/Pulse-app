import { chromium } from 'playwright';
const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/dco-shots';

async function clearDigits(page, maxTaps) {
  const del = page.getByLabel('Delete last digit', { exact: true }).first();
  for (let i = 0; i < maxTaps; i++) {
    await del.click().catch(() => {});
    await page.waitForTimeout(60);
  }
}

async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split('')) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(delayMs);
  }
}

async function tapDigits(page, digits, verify) {
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    const ok = await verify().catch(() => false);
    if (ok) return;
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
page.on('response', (res) => { if (res.status() >= 400) console.log('HTTP', res.status(), res.url()); });

await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1000);
await tapDigits(page, PHONE, () => page.getByText('900 800 8008', { exact: false }).first().isVisible());
await page.getByText('Send OTP', { exact: false }).first().click();
await page.waitForTimeout(1500);
await tapDigits(page, OTP, () => page.getByText('Verify OTP', { exact: false }).first().isEnabled());
await page.getByText('Verify OTP', { exact: false }).first().click();
await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2000);
console.log('signed in at', page.url());

console.log('now directly navigating to /dco-status while authenticated...');
await page.goto(`${BASE}/dco-status`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);
console.log('URL after authed direct nav:', page.url());
await page.screenshot({ path: `${OUT}/authed-direct-nav.png`, fullPage: true });
await browser.close();

const browser2 = await chromium.launch({ headless: true });
const page2 = await browser2.newPage({ viewport: { width: 414, height: 896 } });
await page2.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60000 });
await page2.waitForTimeout(1000);
await tapDigits(page2, PHONE, () => page2.getByText('900 800 8008', { exact: false }).first().isVisible());
await page2.getByText('Send OTP', { exact: false }).first().click();
await page2.waitForTimeout(1500);
await tapDigits(page2, OTP, () => page2.getByText('Verify OTP', { exact: false }).first().isEnabled());
await page2.getByText('Verify OTP', { exact: false }).first().click();
await page2.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 20000 }).catch(() => {});
await page2.waitForTimeout(2000);
console.log('page2 signed in at', page2.url());
await page2.goto(`${BASE}/become-fleet-owner`, { waitUntil: 'load', timeout: 30000 });
await page2.waitForTimeout(2500);
console.log('URL after authed direct nav to become-fleet-owner:', page2.url());
await browser2.close();
