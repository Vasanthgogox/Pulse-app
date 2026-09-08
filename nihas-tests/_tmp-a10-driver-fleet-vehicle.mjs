#!/usr/bin/env node
// A10 Step 3 continuation: sign back in as the freshly created "A10 Pilot DCO"
// driver, enable Fleet Owner capability, and add one vehicle so the identity
// is bidding-ready (independent driver, no org membership, >=1 active vehicle).
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const PHONE = '9199990005';
const OTP = '4321'; // driver sign-in also uses mocked OTP, any digits work
const VEHICLE_NUMBER = 'TN 18 ZZ 9901';

const log = (m) => console.log(`[a10-fleet-vehicle] ${m}`);

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
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const results = {};

  try {
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
    results.urlAfterSignIn = page.url();
    log(`signed in, url=${page.url()}`);
    await page.screenshot({ path: `${OUT}/a10-10-dashboard.png`, fullPage: true });

    await page.goto(`${BASE}/become-fleet-owner`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1200);
    const setupBtn = page.getByLabel('Set up my fleet', { exact: true }).first();
    const openFleetBtn = page.getByLabel('Open My Fleet', { exact: true }).first();
    const found = await Promise.race([
      setupBtn.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'setup').catch(() => null),
      openFleetBtn.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'open').catch(() => null),
    ]);
    await page.screenshot({ path: `${OUT}/a10-11-become-fleet-owner.png`, fullPage: true });
    if (found === 'setup') {
      await setupBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/a10-12-after-enable.png`, fullPage: true });
    } else if (found === 'open') {
      log('Fleet Owner capability already enabled (Open My Fleet shown)');
    } else {
      log('WARNING: neither Set up my fleet nor Open My Fleet found');
    }
    results.fleetOwnerState = found;
    results.pageErrorsAfterEnable = [...pageErrors];

    await page.goto(`${BASE}/my-fleet/add`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-13-add-vehicle-form.png`, fullPage: true });

    const vehicleInput = page.getByPlaceholder('e.g. TN 18 D 2522').first();
    await vehicleInput.waitFor({ state: 'visible', timeout: 10_000 });
    await vehicleInput.fill(VEHICLE_NUMBER);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/a10-14-vehicle-filled.png`, fullPage: true });

    const addBtn = page.getByText('Add Vehicle', { exact: true }).last();
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/a10-15-after-add-vehicle.png`, fullPage: true });
    results.urlAfterAddVehicle = page.url();
    results.pageErrorsFinal = [...pageErrors];

    console.log('RESULTS_A10_FLEET_JSON_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('RESULTS_A10_FLEET_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[a10-fleet-vehicle] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/a10-fleet-ERROR.png` }).catch(() => {});
    console.log('RESULTS_A10_FLEET_JSON_START');
    console.log(JSON.stringify({ ...results, fatalError: err.message, pageErrorsTotal: pageErrors }, null, 2));
    console.log('RESULTS_A10_FLEET_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
