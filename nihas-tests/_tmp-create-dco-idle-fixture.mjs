#!/usr/bin/env node
// Create a dedicated, genuinely idle DCO test driver via the REAL signup flow
// (not a DB shortcut) -- phone 9000000001, a brand new number never used in
// any prior test. Purpose: a clean identity with zero active trips anywhere,
// for the IND105 transaction test, per the "don't reuse 9008008008 across
// unrelated scenarios" decision. Read/write on a brand-new profile only --
// touches no existing data.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000001';
const OTP = '1234';
const NAME = 'DCO Idle Fixture 01';
const PASSWORD = 'DcoIdle!2026';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/dco_idle_signup_shots';

const log = (m) => console.log(`[dco-idle-signup] ${m}`);

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
  throw new Error('value would not stick in signup field');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  try {
    log('goto driver-signup');
    await page.goto(`${BASE}/driver-signup`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);

    log('step 0: phone number');
    await tapDigits(page, PHONE, {
      verify: () => page.getByText('900 000 0001', { exact: false }).first().isVisible(),
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

    log('step 7: profile photo (pick a preset if visible, else just create)');
    const presetTiles = page.locator('[accessibilityRole="button"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/04-photo-step.png`, fullPage: true });
    const createBtn = page.getByText('Create account', { exact: true }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await createBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/05-after-create.png`, fullPage: true });

    log('step 8: success -> enter app');
    const enterBtn = page.getByText(/enter (the )?app/i).first();
    if (await enterBtn.count()) {
      await enterBtn.click();
    }
    await page.waitForURL((u) => !u.pathname.includes('driver-signup'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    log(`final url: ${page.url()}`);
    await page.screenshot({ path: `${OUT}/06-final.png`, fullPage: true });

    log('DONE');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
