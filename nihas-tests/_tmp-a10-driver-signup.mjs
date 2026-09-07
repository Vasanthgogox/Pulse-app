#!/usr/bin/env node
// A10 Step 3: create a fresh DCO driver identity through the real driver
// signup flow (app/driver-signup.tsx). Phone-OTP is intentionally mocked in
// all environments (MockOtpNotice.tsx) -- any not-yet-registered phone +
// any 4-digit code completes signup, no real SMS involved.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

// Candidate fresh phone numbers to try in order, in case one is already
// registered. Clearly outside the known fixture range (9008008008 etc).
const CANDIDATE_PHONES = ['9199990005', '9199990006', '9199990007'];
const OTP = '4321';
const FULL_NAME = 'A10 Pilot DCO';
const PASSWORD = 'A10PilotDco#2026';

const log = (m) => console.log(`[a10-driver-signup] ${m}`);

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
    if (!verify) return true;
    if (await verify().catch(() => false)) return true;
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleMsgs = [];
  const failedResponses = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('response', (res) => { if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`); });
  page.on('dialog', async (d) => { console.log(`[dialog] ${d.message()}`); await d.accept().catch(() => {}); });
  const results = { candidatesRejected: [] };

  try {
    await page.goto(`${BASE}/driver-signup`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-01-driver-signup-phone.png`, fullPage: true });

    let chosenPhone = null;
    for (const candidate of CANDIDATE_PHONES) {
      log(`trying phone candidate ${candidate}`);
      await tapDigits(page, candidate, { verify: () => page.getByText('900 000 0001', { exact: false }).first().isVisible().then(() => true).catch(() => false) });
      // Wait for the existing-user check (debounced) to resolve one way or another.
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/a10-02-phone-${candidate}.png`, fullPage: true });
      const alreadyExists = await page.getByText(/already have an account|sign in instead|already registered/i).first().isVisible().catch(() => false);
      if (alreadyExists) {
        log(`candidate ${candidate} already registered, trying next`);
        results.candidatesRejected.push(candidate);
        // Clear the phone field fully before trying the next candidate.
        await clearDigits(page, 12);
        await page.waitForTimeout(300);
        continue;
      }
      const sendOtpBtn = page.getByRole('button', { name: 'Send OTP', exact: true }).first();
      const enabled = await sendOtpBtn.isEnabled().catch(() => false);
      if (!enabled) {
        log(`Send OTP not enabled for ${candidate}, trying next`);
        results.candidatesRejected.push(candidate);
        await clearDigits(page, 12);
        await page.waitForTimeout(300);
        continue;
      }
      chosenPhone = candidate;
      await sendOtpBtn.click();
      break;
    }

    if (!chosenPhone) throw new Error('No candidate phone number was accepted');
    results.chosenPhone = chosenPhone;
    log(`chosen phone: ${chosenPhone}, proceeding to OTP`);

    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-03-otp-step.png`, fullPage: true });

    await tapDigits(page, OTP, { verify: () => page.getByRole('button', { name: 'Verify OTP', exact: true }).first().isEnabled() });
    await page.getByRole('button', { name: 'Verify OTP', exact: true }).first().click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/a10-04-account-step.png`, fullPage: true });

    results.pageErrorsAfterOtp = [...pageErrors];

    // Account step: Full name, Email (optional, left blank), Password, Confirm.
    await page.getByPlaceholder('Your name').fill(FULL_NAME);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD);
    await page.getByPlaceholder('Re-enter your password').fill(PASSWORD);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/a10-05-account-filled.png`, fullPage: true });
    const nextBtn = page.getByRole('button', { name: 'Next', exact: true }).first();
    await nextBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await nextBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-06-license-step.png`, fullPage: true });

    // One "Skip & upload later" click skips license+aadhaar+pan and jumps to Photo step.
    const skipBtn = page.getByRole('button', { name: 'Skip & upload later', exact: true }).first();
    await skipBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await skipBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-07-photo-step.png`, fullPage: true });

    const createBtn = page.getByRole('button', { name: 'Create account', exact: true }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
    consoleMsgs.length = 0; failedResponses.length = 0; pageErrors.length = 0;
    await createBtn.click();
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: `${OUT}/a10-08-after-create.png`, fullPage: true });
    results.urlAfterCreate = page.url();
    results.pageErrorsAfterCreate = [...pageErrors];
    results.consoleAfterCreate = consoleMsgs;
    results.failedResponsesAfterCreate = failedResponses;

    console.log('RESULTS_A10_DRIVER_JSON_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('RESULTS_A10_DRIVER_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[a10-driver-signup] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/a10-ERROR.png` }).catch(() => {});
    console.log('RESULTS_A10_DRIVER_JSON_START');
    console.log(JSON.stringify({ ...results, fatalError: err.message, pageErrorsTotal: pageErrors }, null, 2));
    console.log('RESULTS_A10_DRIVER_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
