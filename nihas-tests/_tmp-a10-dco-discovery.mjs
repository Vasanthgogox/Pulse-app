#!/usr/bin/env node
// A10.1 Step 2 verification (discovery only, no bid): confirm the fresh
// "A10 Pilot DCO" driver can discover the SpaceXLogistics Chennai->Bengaluru
// Marketplace load created under Godrej India, with correct classification
// and fleet-fit for TN 18 ZZ 9901.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const PHONE = '9199990005';
const OTP = '4321';

const log = (m) => console.log(`[dco-discovery] ${m}`);

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
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    if (await verify().catch(() => false)) return;
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(1500);
  await tapDigits(page, PHONE, { verify: () => page.getByText('919 999 0005', { exact: false }).first().isVisible() });
  await page.getByText('Send OTP', { exact: false }).first().click();
  await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
  await page.getByText('Verify OTP', { exact: false }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  log(`signed in as DCO, url=${page.url()}`);

  await page.goto(`${BASE}/find-loads`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/a10-80-dco-find-work.png`, fullPage: true });
  log(`find-loads url: ${page.url()}`);

  const loadCard = page.getByText('SpaceXLogistics', { exact: true }).first();
  const found = await loadCard.isVisible().catch(() => false);
  log(`SpaceXLogistics load visible in DCO Find Work: ${found}`);

  if (found) {
    await loadCard.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/a10-81-dco-load-detail.png`, fullPage: true });
    log(`detail url: ${page.url()}`);
  }

  log(`page errors: ${JSON.stringify(pageErrors)}`);
  await browser.close();
}
main();
