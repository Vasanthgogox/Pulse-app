import { chromium } from 'playwright';
const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/dco-shots';

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

const profileBtn = page.getByLabel(/^Profile/).first();
await profileBtn.click({ force: true });
await page.waitForTimeout(1500);

const dcoCta = page.getByLabel('DCO status', { exact: true }).first();
const box = await dcoCta.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(1500);
console.log('at', page.url());

const manageBtn = page.getByLabel('Manage my vehicle', { exact: true }).first();
const manageBox = await manageBtn.boundingBox();
if (manageBox) {
  await page.mouse.click(manageBox.x + manageBox.width / 2, manageBox.y + manageBox.height / 2);
} else {
  console.log('Manage my vehicle button not found');
}
await page.waitForTimeout(1500);
console.log('at', page.url(), 'after Manage my vehicle click');
await page.screenshot({ path: `${OUT}/03-my-fleet-as-dco.png`, fullPage: true });

await browser.close();
