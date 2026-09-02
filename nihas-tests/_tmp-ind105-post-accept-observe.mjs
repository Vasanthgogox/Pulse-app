#!/usr/bin/env node
// Read-only observation: what does the driver app actually show DCO Idle
// Fixture 01 immediately after their IND105 bid was accepted and a trip was
// created? Does not start/complete the trip, does not change any state --
// just signs in and looks around (Dashboard, Market/Find Work, History).
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000001';
const OTP = '1234';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/ind105_post_accept_shots';

const log = (m) => console.log(`[post-accept-observe] ${m}`);

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
    log('signing in as DCO Idle Fixture 01 (post-acceptance)');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);
    await tapDigits(page, PHONE, { verify: () => page.getByText('900 000 0001', { exact: false }).first().isVisible() });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    log(`landed at: ${page.url()}`);
    await page.screenshot({ path: `${OUT}/00-landing-after-signin.png`, fullPage: true });

    // Whatever tab we landed on IS the observation -- log its identity plainly.
    const bodyTextLanding = await page.locator('body').innerText().catch(() => '');
    log(`landing screen text (first 300 chars): ${bodyTextLanding.slice(0, 300).replace(/\n/g, ' | ')}`);

    log('checking Dashboard tab');
    const dashTab = page.getByText('Dashboard', { exact: true }).first();
    if (await dashTab.count()) {
      await dashTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });
      const dashText = await page.locator('body').innerText().catch(() => '');
      log(`Dashboard text (first 400 chars): ${dashText.slice(0, 400).replace(/\n/g, ' | ')}`);
    }

    log('checking Market / Find Work tab');
    const marketTab = page.getByText('Market', { exact: true }).first();
    if (await marketTab.count()) {
      await marketTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/02-market-tab.png`, fullPage: true });
      const marketText = await page.locator('body').innerText().catch(() => '');
      log(`Market tab text (first 500 chars): ${marketText.slice(0, 500).replace(/\n/g, ' | ')}`);
    }

    log('re-checking IND105 load detail directly — does it show Accepted?');
    await page.goto(`${BASE}/available-loads/da221cbb-e2ec-42fa-9f13-a43010ed95f0`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/03-ind105-detail-after-accept.png`, fullPage: true });
    const detailText = await page.locator('body').innerText().catch(() => '');
    log(`IND105 detail text after accept: ${detailText.slice(0, 500).replace(/\n/g, ' | ')}`);

    log('checking History tab');
    const historyTab = page.getByText('History', { exact: true }).first();
    if (await historyTab.count()) {
      await historyTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/04-history-tab.png`, fullPage: true });
    }

    log('DONE — read-only observation complete, no trip state changed');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
