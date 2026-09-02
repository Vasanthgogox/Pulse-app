#!/usr/bin/env node
// Submit one clearly identifiable controlled bid on IND105 as the new,
// genuinely idle DCO Idle Fixture 01 driver (phone 9000000001, vehicle
// TN 01 DI 0001). Reuses the proven driver-login + bid-form mechanics from
// _tmp-controlled-bid-e2e.mjs. Does not touch Sadam's existing ₹35,000 bid
// on the same indent.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000001';
const OTP = '1234';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/ind105_idle_bid_shots';
const IND105_ID = 'da221cbb-e2ec-42fa-9f13-a43010ed95f0';
const TEST_BID_AMOUNT = '44444';
const TEST_BID_NOTE = 'DCO Idle Fixture 01 -- controlled QA bid for acceptance transaction test';

const log = (m) => console.log(`[ind105-idle-bid] ${m}`);

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
async function tapDigits(page, digits, { verify } = {}) {
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    const ok = await verify().catch(() => false);
    if (ok) return;
    log(`WARNING: digit entry attempt ${attempt} did not stick, retrying`);
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
  log(`WARNING: digit entry never verified after 3 attempts`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  try {
    log('signing in as DCO Idle Fixture 01');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);
    await tapDigits(page, PHONE, { verify: () => page.getByText('900 000 0001', { exact: false }).first().isVisible() });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    log(`signed in — at ${page.url()}`);

    log('navigating to IND105 load details');
    await page.goto(`${BASE}/available-loads/${IND105_ID}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/01-load-detail-before-bid.png`, fullPage: true });

    const vehicleChip = page.getByText('TN 01 DI 0001', { exact: false }).first();
    await vehicleChip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    if (await vehicleChip.count()) {
      await vehicleChip.click();
      await page.waitForTimeout(400);
      log('selected the idle-fixture vehicle');
    } else {
      log('WARNING: vehicle chip not found — proceeding without selecting it');
    }

    const amountInput = page.getByPlaceholder(/^e\.g\./).first();
    await amountInput.waitFor({ state: 'visible', timeout: 10_000 });
    for (let attempt = 1; attempt <= 3; attempt++) {
      await amountInput.click();
      await amountInput.fill('');
      await amountInput.pressSequentially(TEST_BID_AMOUNT, { delay: 60 });
      await page.waitForTimeout(300);
      const val = await amountInput.inputValue().catch(() => '');
      log(`amount field attempt ${attempt}: reads "${val}"`);
      if (val.replace(/[^0-9]/g, '') === TEST_BID_AMOUNT) break;
    }

    const noteInput = page.getByPlaceholder('Anything the business should know').first();
    if (await noteInput.count()) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await noteInput.click();
        await noteInput.fill('');
        await noteInput.pressSequentially(TEST_BID_NOTE, { delay: 8 });
        await page.waitForTimeout(300);
        const val = await noteInput.inputValue().catch(() => '');
        log(`note field attempt ${attempt}: reads "${val.slice(0, 40)}..."`);
        if (val === TEST_BID_NOTE) break;
      }
    }

    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/02-bid-form-filled.png`, fullPage: true });

    log('submitting the bid');
    const submitBtn = page.getByText('Submit Bid', { exact: true }).first();
    await submitBtn.click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/03-after-submit.png`, fullPage: true });
    log(`after submit, url: ${page.url()}`);
    log('DONE');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
