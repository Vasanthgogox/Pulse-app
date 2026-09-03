#!/usr/bin/env node
// Continuation for DCO Available Fixture 02 (phone 9000000002, already
// created via _tmp-create-dco-available-fixture-02.mjs's signup phase).
// Logs back in as this driver via the real /driver-sign-in flow (phone + OTP,
// no password needed per that screen's comments), then completes:
//   1) Become a Fleet Owner (real UI button on /become-fleet-owner)
//   2) Add one vehicle (real UI form on /my-fleet/add)
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000002';
const OTP = '1234';
const VEHICLE_NUMBER = 'TN22Z9902';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/dco_available_fixture_signup';

const log = (m) => console.log(`[dco-avail-continue] ${m}`);

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

// Vehicle number field reformats on every keystroke (inserts spaces via
// applyIndianVehicleKeystroke), so compare with whitespace stripped.
async function typeVehicleNumber(page, field, value) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await field.click();
    await field.type(value, { delay: 15 });
    await page.waitForTimeout(300);
    const current = (await field.inputValue()).replace(/\s+/g, '');
    if (current === value) return;
    await field.fill('');
    await page.waitForTimeout(400);
  }
  throw new Error(`vehicle number would not stick (wanted "${value}")`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  try {
    // ---------- SIGN IN ----------
    log('goto driver-sign-in');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1200);

    log('step 0: phone number');
    await tapDigits(page, PHONE, {
      verify: () => page.getByText('900 000 0002', { exact: false }).first().isVisible(),
    });
    await page.screenshot({ path: `${OUT}/20-signin-phone-entered.png`, fullPage: true });
    await page.getByText('Send OTP', { exact: false }).first().click();

    // checkExistingUserByPhone is a real network round trip; poll instead of a
    // fixed sleep so we don't race ahead of the step-1 transition.
    let reachedStep1 = false;
    let notFound = false;
    for (let i = 0; i < 30; i++) {
      notFound = await page.getByText('No account found for this number', { exact: false }).first().isVisible().catch(() => false);
      reachedStep1 = await page.getByText('Verify your number', { exact: false }).first().isVisible().catch(() => false);
      if (notFound || reachedStep1) break;
      await page.waitForTimeout(500);
    }
    if (notFound) throw new Error('driver-sign-in reports "No account found" for 9000000002 — signup phase did not complete.');
    if (!reachedStep1) throw new Error('driver-sign-in never advanced to the OTP step after Send OTP.');

    log('step 1: OTP');
    await page.screenshot({ path: `${OUT}/21-signin-otp-step.png`, fullPage: true });
    await tapDigits(page, OTP, {
      verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled(),
    });
    await page.getByText('Verify OTP', { exact: false }).first().click();

    // The auth transition briefly bounces through a signed-out / session_expired
    // state before landing signed-in at "/" — poll for the final driver home
    // URL rather than racing ahead on the first URL change, and give the
    // session extra time to persist to localStorage before any hard navigation.
    let landedHome = false;
    for (let i = 0; i < 30; i++) {
      if (page.url().replace(/\/$/, '') === BASE) {
        landedHome = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    if (!landedHome) throw new Error(`driver-sign-in never landed at driver home; stuck at ${page.url()}`);
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000); // let session persist to localStorage before a hard reload
    log(`post-signin url: ${page.url()}`);
    await page.screenshot({ path: `${OUT}/22-after-signin.png`, fullPage: true });

    // ---------- BECOME FLEET OWNER ----------
    log('goto become-fleet-owner');
    await page.goto(`${BASE}/become-fleet-owner`, { waitUntil: 'load', timeout: 60_000 });
    // Lazy-loaded screen + a query round trip — poll for real content instead
    // of a fixed sleep (a fixed 1500ms caught only the loading spinner before).
    for (let i = 0; i < 30; i++) {
      const ready =
        (await page.getByText('Set up my fleet', { exact: true }).first().isVisible().catch(() => false)) ||
        (await page.getByText('Fleet Owner enabled', { exact: false }).first().isVisible().catch(() => false));
      if (ready) break;
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `${OUT}/23-become-fleet-owner-screen.png`, fullPage: true });

    const alreadyEnabled = await page.getByText('Fleet Owner enabled', { exact: false }).first().isVisible().catch(() => false);
    if (alreadyEnabled) {
      log('Fleet Owner already enabled');
    } else {
      const setupBtn = page.getByRole('button', { name: 'Set up my fleet', exact: true }).first();
      await setupBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await setupBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: `${OUT}/24-after-enable-fleet-owner.png`, fullPage: true });
    const fleetOwnerEnabled = await page.getByText('Fleet Owner enabled', { exact: false }).first().isVisible().catch(() => false);
    log(`fleet owner enabled visible on screen: ${fleetOwnerEnabled}`);
    if (!fleetOwnerEnabled) throw new Error('Fleet Owner enablement did not confirm on screen.');

    // ---------- ADD VEHICLE ----------
    log('goto my-fleet/add');
    await page.goto(`${BASE}/my-fleet/add`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/25-add-vehicle-screen.png`, fullPage: true });

    const vehicleNumberField = page.getByPlaceholder('e.g. TN 18 D 2522').first();
    await vehicleNumberField.waitFor({ state: 'visible', timeout: 15_000 });
    await typeVehicleNumber(page, vehicleNumberField, VEHICLE_NUMBER);
    await page.waitForTimeout(300);

    log('select vehicle type: Open Body Truck');
    await page.getByText('Open Body Truck', { exact: true }).first().click();
    await page.waitForTimeout(200);

    await typeInto(page, page.getByPlaceholder('e.g. 4T / 16T').first(), '9T');
    await typeInto(page, page.getByPlaceholder('e.g. Tata').first(), 'Tata');
    await typeInto(page, page.getByPlaceholder('e.g. 407').first(), '709');

    log('select fuel type: Diesel');
    await page.getByText('Diesel', { exact: true }).first().click();
    await page.waitForTimeout(200);

    await page.screenshot({ path: `${OUT}/26-add-vehicle-filled.png`, fullPage: true });

    // "Add Vehicle" text appears twice: once as the header title, once as the
    // submit button below the form — the header is first in DOM order, so the
    // submit button is .last(), not .first().
    const addVehicleBtn = page.getByText('Add Vehicle', { exact: true }).last();
    await addVehicleBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addVehicleBtn.click();
    await page.waitForTimeout(2500);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    log(`post-add-vehicle url: ${page.url()}`);
    await page.screenshot({ path: `${OUT}/27-after-add-vehicle.png`, fullPage: true });

    const errorVisible = await page.getByText(/could not add vehicle|required/i).first().isVisible().catch(() => false);
    log(`error text visible after add-vehicle submit: ${errorVisible}`);

    log('DONE');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-continue-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
