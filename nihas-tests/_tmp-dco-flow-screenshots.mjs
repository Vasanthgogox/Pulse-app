#!/usr/bin/env node
// Live UI smoke test for the DCO (driver-cum-owner) status flow — real
// account (9008008008 / "Sadam"), real DB, real request_dco_status() call.
// Read-only browsing pattern reused from nihas-tests/_tmp-market-ux-screenshots.mjs;
// this one performs ONE real mutating action (request DCO status), pre-approved.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/dco-shots';

const log = (m) => console.log(`[dco-shots] ${m}`);

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
  await page
    .getByLabel(`Key ${digits[0]}`, { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });
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
    log('goto driver-sign-in');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);

    await tapDigits(page, PHONE, {
      verify: () => page.getByText('900 800 8008', { exact: false }).first().isVisible(),
    });
    await page.getByText('Send OTP', { exact: false }).first().click();

    await page
      .getByText('Verification Code', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => log('WARNING: no Verification Code label seen'));

    await tapDigits(page, OTP, {
      verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled(),
    });
    await page.getByText('Verify OTP', { exact: false }).first().click();

    await page
      .waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 })
      .catch(() => log('WARNING: still on driver-sign-in after verify'));
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    log(`signed in — at ${page.url()}`);

    log('opening profile via header avatar');
    const profileBtn = page.getByLabel(/^Profile/).first();
    const profileCount = await profileBtn.count();
    log(`profile button matches: ${profileCount}`);
    if (profileCount > 0) {
      await profileBtn.click({ force: true });
    } else {
      log('no profile avatar button found, trying goto');
      await page.goto(`${BASE}/profile`, { waitUntil: 'load', timeout: 30_000 });
    }
    await page.waitForTimeout(2000);
    log(`at ${page.url()}`);
    await page.screenshot({ path: `${OUT}/00-profile.png`, fullPage: true });

    log('locating DCO status CTA');
    let dcoCta = page.getByLabel('DCO status', { exact: true }).first();
    let dcoCount = await dcoCta.count();
    log(`DCO status CTA matches: ${dcoCount}`);
    if (dcoCount === 0) {
      log('WARNING: DCO status CTA not found, scrolling and rechecking');
      await page.mouse.move(207, 500);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/00b-profile-scrolled.png`, fullPage: true });
      dcoCta = page.getByLabel('DCO status', { exact: true }).first();
      dcoCount = await dcoCta.count();
      log(`DCO status CTA matches after scroll: ${dcoCount}`);
    }
    if (dcoCount === 0) {
      log('FATAL: DCO status CTA never found — dumping all button accessibility labels');
      const labels = await page.locator('[role="button"]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('aria-label')).filter(Boolean),
      );
      log(`button labels on screen: ${JSON.stringify(labels)}`);
      await browser.close();
      process.exit(1);
    }
    const box = await dcoCta.boundingBox();
    log(`DCO CTA bounding box: ${JSON.stringify(box)}`);
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await dcoCta.click({ force: true });
    }
    await page.waitForTimeout(500);
    log(`at ${page.url()} immediately after DCO CTA click`);
    await page.waitForTimeout(1500);
    log(`at ${page.url()} after settle`);
    await page.screenshot({ path: `${OUT}/01-dco-status-screen-initial.png`, fullPage: true });

    log('requesting DCO status (real mutation: request_dco_status RPC)');
    const requestBtn = page.getByLabel('Request DCO status', { exact: true }).first();
    const canRequest = await requestBtn.isVisible().catch(() => false);
    if (canRequest) {
      await requestBtn.click({ force: true });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/02-dco-status-after-request.png`, fullPage: true });
    } else {
      log('Request button not visible — DCO profile likely already exists, screenshotting current state only');
    }

    log('DONE');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[dco-shots] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR.png` }).catch(() => {});
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
