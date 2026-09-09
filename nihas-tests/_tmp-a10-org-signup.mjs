#!/usr/bin/env node
// A10 Step 3: create a fresh organisation identity through the real business
// signup flow (app/sign-up.tsx -> BusinessSignUpScreen). Phone-OTP is mocked
// (MockOtpNotice.tsx) in all environments; org name is only uniqueness-checked
// (no GST/PAN field exists in this flow); no document upload is mandatory.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const CANDIDATE_PHONES = ['9299990001', '9299990002', '9299990003'];
const OTP = '654321';
const ORG_NAME = 'A10 Pilot Fleet Org';
const OWNER_NAME = 'A10 Pilot Org Owner';
const OWNER_EMAIL = 'a10.pilot.org@example.com';
const PASSWORD = 'A10PilotOrg#2026';

const log = (m) => console.log(`[a10-org-signup] ${m}`);

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
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('dialog', async (d) => { log(`DIALOG: ${d.message()}`); await d.accept().catch(() => {}); });
  const results = { candidatesRejected: [] };

  try {
    await page.goto(`${BASE}/sign-up`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-20-org-intro-step.png`, fullPage: true });

    const createWorkspaceBtn = page.getByRole('button', { name: 'Create workspace', exact: true }).first();
    await createWorkspaceBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(800);
    for (let i = 0; i < 4; i++) {
      await createWorkspaceBtn.click({ force: false }).catch(() => {});
      await page.waitForTimeout(1000);
      const stillIntro = await page.getByRole('button', { name: 'Create workspace', exact: true }).first().isVisible().catch(() => false);
      if (!stillIntro) break;
      log(`still on intro after click attempt ${i + 1}, retrying`);
    }
    await page.screenshot({ path: `${OUT}/a10-20b-org-phone-step.png`, fullPage: true });

    let chosenPhone = null;
    for (const candidate of CANDIDATE_PHONES) {
      log(`trying phone candidate ${candidate}`);
      await tapDigits(page, candidate);
      await page.waitForTimeout(1500);
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
    log(`chosen phone: ${chosenPhone}`);

    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-21-org-otp-step.png`, fullPage: true });
    await tapDigits(page, OTP, { verify: () => page.getByRole('button', { name: 'Verify OTP', exact: true }).first().isEnabled() });
    await page.getByRole('button', { name: 'Verify OTP', exact: true }).first().click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/a10-22-org-name-step.png`, fullPage: true });

    // Org name step (uniqueness-debounced).
    await page.getByPlaceholder('e.g. Acme Logistics').fill(ORG_NAME);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-23-org-name-filled.png`, fullPage: true });
    const orgContinueBtn = page.getByRole('button', { name: 'Continue', exact: true }).first();
    await orgContinueBtn.waitFor({ state: 'visible', timeout: 10_000 });
    for (let i = 0; i < 10; i++) {
      if (await orgContinueBtn.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(500);
    }
    await orgContinueBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-24-company-details-step.png`, fullPage: true });

    // Company details: Asset (own trucks), Pvt. Limited, Fleet 1-5, Employees 1-10.
    await page.getByText('Asset', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByText('Pvt. Limited', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByText('1-5', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.getByText('1-10', { exact: true }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/a10-25-company-details-filled.png`, fullPage: true });

    const detailsContinueBtn = page.getByRole('button', { name: 'Continue', exact: true }).first();
    await detailsContinueBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await detailsContinueBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-26-location-step.png`, fullPage: true });

    // Office location: street, PIN, city (skip the map-search autofill field).
    await page.getByPlaceholder('e.g. 12A, Gogox Towers, Old Gingee Road').fill('12A, Pilot Test Road');
    await page.getByPlaceholder('e.g. 400001').fill('600040');
    await page.waitForTimeout(300);
    await page.getByText('Select city or district', { exact: true }).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder('Search city or district…').fill('Chennai');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/a10-27-city-search.png`, fullPage: true });
    await page.getByText('Chennai', { exact: true }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/a10-28-location-filled.png`, fullPage: true });

    const locationContinueBtn = page.getByRole('button', { name: 'Continue', exact: true }).first();
    await locationContinueBtn.waitFor({ state: 'visible', timeout: 10_000 });
    for (let i = 0; i < 6; i++) {
      if (await locationContinueBtn.isEnabled().catch(() => false)) break;
      await page.waitForTimeout(500);
    }
    await locationContinueBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-29-account-step.png`, fullPage: true });

    // Account: owner name/email/password, then Create account.
    await page.getByPlaceholder('Your name').fill(OWNER_NAME);
    await page.getByPlaceholder('you@example.com').fill(OWNER_EMAIL);
    await page.getByPlaceholder('At least 6 characters').fill(PASSWORD);
    await page.getByPlaceholder('Re-enter password').fill(PASSWORD);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/a10-30-account-filled.png`, fullPage: true });

    const createAccountBtn = page.getByRole('button', { name: 'Create account', exact: true }).first();
    await createAccountBtn.waitFor({ state: 'visible', timeout: 10_000 });
    consoleMsgs.length = 0;
    await createAccountBtn.click();
    for (let i = 0; i < 10; i++) await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/a10-31-after-create-account.png`, fullPage: true });
    results.urlAfterCreateAccount = page.url();
    results.consoleAfterCreateAccount = consoleMsgs;

    // Workspace logo + profile photo: both skippable.
    const skipLogoBtn = page.getByRole('button', { name: 'Skip for now', exact: true }).first();
    await skipLogoBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await skipLogoBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/a10-32-photo-step.png`, fullPage: true });

    const skipPhotoBtn = page.getByRole('button', { name: 'Skip for now', exact: true }).first();
    await skipPhotoBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await skipPhotoBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/a10-33-final.png`, fullPage: true });
    results.urlFinal = page.url();

    console.log('RESULTS_A10_ORG_JSON_START');
    console.log(JSON.stringify({ ...results, pageErrors }, null, 2));
    console.log('RESULTS_A10_ORG_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[a10-org-signup] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/a10-org-ERROR.png` }).catch(() => {});
    console.log('RESULTS_A10_ORG_JSON_START');
    console.log(JSON.stringify({ ...results, fatalError: err.message, pageErrors }, null, 2));
    console.log('RESULTS_A10_ORG_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
