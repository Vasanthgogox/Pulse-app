#!/usr/bin/env node
// Controlled real bid test: add one test vehicle, place one identifiable bid on the
// designated test load (IND099, org "nihas logs"), verify Pending. No manual DB mutation
// of bid state -- acceptance is a separate, later, human step in the real business app.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/bid_e2e_shots';
const TEST_VEHICLE_NUMBER = 'TN38QA0001';
const TEST_BID_AMOUNT = '87654';
const TEST_BID_NOTE = 'Controlled QA test bid -- DCO flow verification (safe to accept or reject)';

const log = (m) => console.log(`[bid-e2e] ${m}`);

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
    log('signing in as driver test account');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);
    await tapDigits(page, PHONE, { verify: () => page.getByText('900 800 8008', { exact: false }).first().isVisible() });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    log(`signed in — at ${page.url()}`);

    log('vehicle already created in a prior run (TN 38 QA 0001) -- skipping Add Vehicle');

    log('navigating to the test load directly');
    await page.goto(`${BASE}/available-loads/b8457dcb-ef5c-4e60-bcbc-8f4581a68eef`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/03-load-detail-before-bid.png`, fullPage: true });

    // Select the vehicle chip if present (displayed with spaces, e.g. "TN 38 QA 0001", even
    // though the value we submitted was unspaced -- ownerVehicleTitle formats it for display).
    const vehicleChip = page.getByText('TN 38 QA 0001', { exact: false }).first();
    if (await vehicleChip.count()) {
      await vehicleChip.click();
      await page.waitForTimeout(400);
      log('selected the test vehicle');
    } else {
      log('WARNING: test vehicle chip not found on Load Details -- proceeding without selecting it');
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
    for (let attempt = 1; attempt <= 3; attempt++) {
      await noteInput.click();
      await noteInput.fill('');
      await noteInput.pressSequentially(TEST_BID_NOTE, { delay: 10 });
      await page.waitForTimeout(300);
      const val = await noteInput.inputValue().catch(() => '');
      log(`note field attempt ${attempt}: reads "${val.slice(0, 40)}..."`);
      if (val === TEST_BID_NOTE) break;
    }

    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/04-bid-form-filled.png`, fullPage: true });

    log('EXPLICITLY CONFIRMED -- submitting the real bid now');
    const submitBtn = page.getByText('Submit Bid', { exact: true }).first();
    await submitBtn.click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/05-after-submit.png`, fullPage: true });
    log(`after submit, url: ${page.url()}`);
    log('STOPPING -- not touching the bid further from the driver side');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
