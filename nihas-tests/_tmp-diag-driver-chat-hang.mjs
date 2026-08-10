#!/usr/bin/env node
// Diagnostic-only run: proves whether DriverChatScreen remounts or is reused
// across open -> close -> open, and traces which branch the trip-resolution
// effect takes each time. Reads [DIAG] console logs added to DriverChatScreen.tsx.
// Entry point: History tab -> a past trip's detail screen -> "Trip chat" button
// (accessibilityLabel="Trip chat") -- all in-app client-side navigation, no
// page.goto/reload after the initial sign-in, so any bug that depends on the
// screen instance surviving navigation will actually reproduce.

import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PAGE_TIMEOUT = 120_000;
const PHONE = '9008008008';
const OTP = '2204';

const log = (m) => console.log(`[runner] ${m}`);
const diag = [];

async function fillDigits(page, digits) {
  const anyInput = page.locator('input[type="text"], input:not([type])').first();
  await anyInput.fill(digits);
}

async function openFirstTripChat(page, label) {
  await page.getByText('History', { exact: false }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `nihas-tests/screenshots/diag-${label}-history.png` }).catch(() => {});

  // First trip card -> detail screen
  const card = page.locator('[role="button"], div').filter({ hasText: /TRIP/i }).first();
  await card.click().catch(async () => {
    // fallback: click first pressable-looking element in the list area
    await page.locator('div').filter({ hasText: /→/ }).first().click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `nihas-tests/screenshots/diag-${label}-detail.png` }).catch(() => {});
  log(`at ${page.url()} (trip detail)`);

  await page.getByLabel('Trip chat', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `nihas-tests/screenshots/diag-${label}-chat.png` }).catch(() => {});
  log(`at ${page.url()} (chat open)`);
}

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[DIAG]')) {
      diag.push(t);
      log(`DIAG: ${t}`);
    }
  });

  try {
    log('signing in as driver...');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: PAGE_TIMEOUT });
    await page.waitForSelector('#root *, body div', { timeout: PAGE_TIMEOUT });
    await fillDigits(page, PHONE);
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page
      .getByText('Verification Code', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => log('WARNING: did not see Verification Code label, proceeding anyway'));
    await fillDigits(page, OTP);
    await page.screenshot({ path: 'nihas-tests/screenshots/diag-login-otpfilled.png' }).catch(() => {});
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page
      .waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 20_000 })
      .catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(2000);
    log(`signed in — at ${page.url()}`);

    log('=== FIRST OPEN ===');
    diag.length = 0;
    await openFirstTripChat(page, 'A');
    log('--- diag: first open ---');
    diag.forEach((d) => log(d));

    log('=== CLOSE (screenshot only — inspect for back button coordinates) ===');
    // Not clicking yet — first confirm the thread actually opened.
    log('DONE (phase 1)');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[runner] FAIL: ${err.message}`);
    await page.screenshot({ path: 'nihas-tests/screenshots/diag-ERROR.png' }).catch(() => {});
    log('--- all diag captured before failure ---');
    diag.forEach((d) => log(d));
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
