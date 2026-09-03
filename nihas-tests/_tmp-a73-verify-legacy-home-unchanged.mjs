#!/usr/bin/env node
// A7.3 regression check: DCO Available Fixture 02 (phone 9000000002) has a
// real active trip right now, so app/(driver)/index.tsx's new routing must
// still render the legacy DriverHomeScreen (DriverTripFlowCard), NOT the
// new DriverAvailableScreen. Read-only verification -- signs in and
// screenshots only, no writes, no bid submission, no trip mutation.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000002';
const OTP = '1234';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/a73_verification';

const log = (m) => console.log(`[a73-verify] ${m}`);

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
    log(`digit entry attempt ${attempt} did not stick, retrying`);
    const del = page.getByLabel('Delete last digit', { exact: true }).first();
    for (let i = 0; i < digits.length + 2; i++) {
      await del.click().catch(() => {});
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  try {
    log('goto driver-sign-in');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1200);

    log('phone');
    await tapDigits(page, PHONE, {
      verify: () => page.getByText('900 000 0002', { exact: false }).first().isVisible(),
    });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.waitForTimeout(1500);

    log('otp');
    await tapDigits(page, OTP, {
      verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled(),
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/otp-before-verify-click.png`, fullPage: true });
    await page.getByText('Verify OTP', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/after-verify-click.png`, fullPage: true });

    await page.waitForFunction(
      () => !window.location.pathname.includes('driver-sign-in'),
      { timeout: 30_000 },
    ).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`landed at ${page.url()}`);

    await page.screenshot({ path: `${OUT}/home-after-signin.png`, fullPage: true });

    const bodyText = await page.evaluate(() => document.body.innerText);
    const sawAvailableSurface = /You[''`]re available/i.test(bodyText) || /Find work that fits your fleet/i.test(bodyText);
    const sawLegacyTripUi = /Delivery|Trip|Pickup|Transit|Drop|Assignment|Online|Offline/i.test(bodyText);

    log(`sawAvailableSurface(should be FALSE): ${sawAvailableSurface}`);
    log(`sawLegacyTripUi(should be TRUE): ${sawLegacyTripUi}`);
    log(`RESULT: ${!sawAvailableSurface && sawLegacyTripUi ? 'PASS - legacy Home rendered as expected' : 'FAIL - check screenshot'}`);
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
