import { chromium } from 'playwright';
const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';

async function clearDigits(page, maxTaps) {
  const del = page.getByLabel('Delete last digit', { exact: true }).first();
  for (let i = 0; i < maxTaps; i++) { await del.click().catch(() => {}); await page.waitForTimeout(60); }
}
async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split('')) { await page.getByLabel(`Key ${d}`, { exact: true }).first().click(); await page.waitForTimeout(delayMs); }
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
await page.goto(`${BASE}/become-fleet-owner`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);
console.log('URL after authed direct nav to become-fleet-owner:', page.url());
await browser.close();
