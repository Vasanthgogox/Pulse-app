#!/usr/bin/env node
// Create a brand-new, genuinely clean DCO test driver (A6.3 driver-availability
// enforcement testing) via the REAL signup + become-fleet-owner + add-vehicle
// flows (not a DB shortcut). Phone 9000000002, a brand-new number never used
// in any prior test. Adapted from _tmp-create-dco-idle-fixture.mjs.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000002';
const OTP = '1234';
const NAME = 'DCO Available Fixture 02';
const PASSWORD = 'DcoAvail!2026';
const VEHICLE_NUMBER = 'TN22Z9902';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/dco_available_fixture_signup';

const log = (m) => console.log(`[dco-avail-signup] ${m}`);

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

async function typeInto(page, field, value) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await field.click();
    await field.type(value, { delay: 15 });
    await page.waitForTimeout(300);
    if ((await field.inputValue()) === value) return;
    await field.fill('');
    await page.waitForTimeout(400);
  }
  throw new Error(`value would not stick in field (wanted "${value}")`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  try {
    // ---------- SIGNUP ----------
    log('goto driver-signup');
    await page.goto(`${BASE}/driver-signup`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);

    log('step 0: phone number');
    await tapDigits(page, PHONE, {
      verify: () => page.getByText('900 000 0002', { exact: false }).first().isVisible(),
    });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.waitForTimeout(1500);

    log('step 1: OTP');
    await tapDigits(page, OTP, {
      verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled(),
    });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/01-after-otp.png`, fullPage: true });

    log('step 2: name + password');
    const nameField = page.getByPlaceholder('Your name').first();
    await nameField.waitFor({ state: 'visible', timeout: 20_000 });
    await typeInto(page, nameField, NAME);
    const pwFields = page.locator('input[type="password"]');
    await typeInto(page, pwFields.nth(0), PASSWORD);
    await typeInto(page, pwFields.nth(1), PASSWORD);
    await page.screenshot({ path: `${OUT}/02-details-filled.png`, fullPage: true });
    await page.getByText('Next', { exact: true }).first().click();
    await page.waitForTimeout(2000);

    log('step 3: skip all documents');
    await page.getByText('Skip & upload later', { exact: false }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/03-after-skip-docs.png`, fullPage: true });

    log('step 4: profile photo (skip if possible, else just create)');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/04-photo-step.png`, fullPage: true });
    const createBtn = page.getByText('Create account', { exact: true }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await createBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/05-after-create.png`, fullPage: true });

    log('step 5: success -> open driver app');
    const enterBtn = page.getByText('Open driver app', { exact: false }).first();
    await enterBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await enterBtn.click();
    await page.waitForURL((u) => !u.pathname.includes('driver-signup'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    log(`post-signup url: ${page.url()}`);
    await page.screenshot({ path: `${OUT}/06-final-signup.png`, fullPage: true });

    // ---------- BECOME FLEET OWNER ----------
    log('goto become-fleet-owner');
    await page.goto(`${BASE}/become-fleet-owner`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/07-become-fleet-owner-screen.png`, fullPage: true });

    const setupBtn = page.getByRole('button', { name: 'Set up my fleet', exact: true }).first();
    if (await setupBtn.count()) {
      await setupBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await setupBtn.click();
      await page.waitForTimeout(2000);
    } else {
      log('WARNING: "Set up my fleet" button not found — maybe already enabled?');
    }
    await page.screenshot({ path: `${OUT}/08-after-enable-fleet-owner.png`, fullPage: true });

    const successText = page.getByText('Fleet Owner enabled', { exact: false }).first();
    const fleetOwnerEnabled = await successText.isVisible().catch(() => false);
    log(`fleet owner enabled visible on screen: ${fleetOwnerEnabled}`);

    // ---------- ADD VEHICLE ----------
    log('goto my-fleet/add');
    await page.goto(`${BASE}/my-fleet/add`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/09-add-vehicle-screen.png`, fullPage: true });

    const vehicleNumberField = page.getByPlaceholder('e.g. TN 18 D 2522').first();
    await vehicleNumberField.waitFor({ state: 'visible', timeout: 15_000 });
    await typeInto(page, vehicleNumberField, VEHICLE_NUMBER);
    await page.waitForTimeout(300);

    log('select vehicle type: Open Body Truck');
    const openBodyChip = page.getByText('Open Body Truck', { exact: true }).first();
    await openBodyChip.click();
    await page.waitForTimeout(200);

    const capacityField = page.getByPlaceholder('e.g. 4T / 16T').first();
    await typeInto(page, capacityField, '9T');

    const brandField = page.getByPlaceholder('e.g. Tata').first();
    await typeInto(page, brandField, 'Tata');

    const modelField = page.getByPlaceholder('e.g. 407').first();
    await typeInto(page, modelField, '709');

    log('select fuel type: Diesel (default, click to be explicit)');
    const dieselChip = page.getByText('Diesel', { exact: true }).first();
    await dieselChip.click();
    await page.waitForTimeout(200);

    await page.screenshot({ path: `${OUT}/10-add-vehicle-filled.png`, fullPage: true });

    const addVehicleBtn = page.getByText('Add Vehicle', { exact: true }).first();
    await addVehicleBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addVehicleBtn.click();
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    log(`post-add-vehicle url: ${page.url()}`);
    await page.screenshot({ path: `${OUT}/11-after-add-vehicle.png`, fullPage: true });

    log('DONE');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
