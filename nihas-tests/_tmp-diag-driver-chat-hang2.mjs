#!/usr/bin/env node
// Diagnostic-only run: open a trip chat thread, go back, open the SAME trip's
// chat thread again. Captures the full [DIAG] instrumentation log for both
// opens so they can be diffed to find the first divergence point.

import { chromium } from 'playwright';
import fs from 'fs';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PAGE_TIMEOUT = 120_000;
const PHONE = '9008008008';
const OTP = '2204';

const log = (m) => console.log(`[runner] ${m}`);
const allDiag = [];

async function fillDigits(page, digits) {
  const anyInput = page.locator('input[type="text"], input:not([type])').first();
  await anyInput.fill(digits);
}

async function openFirstTripChat(page, label) {
  await page.getByLabel('History', { exact: false }).first().click().catch(async () => {
    await page.getByText('HISTORY', { exact: false }).first().click();
  });
  await page.waitForTimeout(1500);
  // Trip list opens on the ACTIVE pill; our seeded trip is in HISTORY.
  // Both the filter pill (near the top) and the bottom tab bar render the text
  // "HISTORY" — disambiguate by vertical position (topmost = the filter pill).
  const historyMatches = await page.getByText('HISTORY', { exact: false }).all();
  log(`found ${historyMatches.length} "HISTORY" text matches`);
  let topMost = null;
  let topMostY = Infinity;
  for (const loc of historyMatches) {
    const box = await loc.boundingBox().catch(() => null);
    log(`  candidate box: ${box ? JSON.stringify(box) : 'null'}`);
    // Exclude the "TRIP HISTORY & ROUTE ARCHIVE" subtitle (very wide) and the
    // "VIEW HISTORY" empty-state button (further down) — the pill is small and near the top.
    if (box && box.width < 150 && box.y < topMostY) {
      topMostY = box.y;
      topMost = loc;
    }
  }
  if (topMost) {
    await topMost.click();
  } else {
    log('WARNING: could not locate HISTORY pill by bounding box');
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `nihas-tests/screenshots/diag2-${label}-list.png` }).catch(() => {});

  const card = page.getByText(/TRP\d+/).first();
  await card.waitFor({ state: 'visible', timeout: 15_000 });
  await card.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `nihas-tests/screenshots/diag2-${label}-detail.png` }).catch(() => {});
  log(`at ${page.url()} (trip detail) [${label}]`);

  const chatBtn = page.getByLabel('Trip chat', { exact: true }).first();
  await chatBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await chatBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `nihas-tests/screenshots/diag2-${label}-chat.png` }).catch(() => {});
  log(`at ${page.url()} (chat open) [${label}]`);
}

async function main() {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[DIAG')) {
      allDiag.push(`[${Date.now()}] ${t}`);
    }
  });

  try {
    log('signing in as driver...');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: PAGE_TIMEOUT });
    await page.waitForSelector('#root *, body div', { timeout: PAGE_TIMEOUT });
    await page.waitForTimeout(1500);
    await fillDigits(page, PHONE);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'nihas-tests/screenshots/diag2-login-phone.png' }).catch(() => {});
    await page.getByText('Send OTP', { exact: false }).first().click();

    const otpVisible = await page
      .getByText('Verification Code', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!otpVisible) {
      log('WARNING: did not see Verification Code label, retrying Send OTP once');
      await page.waitForTimeout(1000);
      await page.getByText('Send OTP', { exact: false }).first().click();
      await page
        .getByText('Verification Code', { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .catch(() => log('WARNING: still no Verification Code label, proceeding anyway'));
    }
    await page.screenshot({ path: 'nihas-tests/screenshots/diag2-login-otpstep.png' }).catch(() => {});
    await fillDigits(page, OTP);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'nihas-tests/screenshots/diag2-login-otpfilled.png' }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByText('Verify OTP', { exact: false }).first().click();
    let navigated = await page
      .waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!navigated) {
      log('WARNING: still on driver-sign-in after Verify OTP, retrying click');
      await page.getByText('Verify OTP', { exact: false }).first().click().catch(() => {});
      navigated = await page
        .waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
    }
    await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(2000);
    log(`signed in (navigated=${navigated}) — at ${page.url()}`);

    log('=== FIRST OPEN ===');
    const markerFirst = allDiag.length;
    await openFirstTripChat(page, 'first');
    log(`--- diag: first open (${allDiag.length - markerFirst} lines) ---`);

    log('=== GO BACK (tap in-app back arrow, not browser back) ===');
    const markerBack = allDiag.length;
    // The thread header's back arrow has no accessibilityLabel, but it's the
    // first <svg> on the page — clicking it (not page.goBack()) is what actually
    // exercises DriverChatScreen's onBack handler, which clears selectedId. A
    // browser-history back skips that handler entirely and would under-test the fix.
    await page.getByRole('button').first().click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'nihas-tests/screenshots/diag2-after-back.png' }).catch(() => {});
    log(`at ${page.url()} (after back)`);
    log(`--- diag: back (${allDiag.length - markerBack} lines) ---`);

    log('=== SECOND OPEN (same trip) ===');
    const markerSecond = allDiag.length;
    const chatBtn2 = page.getByLabel('Trip chat', { exact: true }).first();
    await chatBtn2.waitFor({ state: 'visible', timeout: 15_000 });
    await chatBtn2.click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: 'nihas-tests/screenshots/diag2-second-chat.png' }).catch(() => {});
    log(`at ${page.url()} (second chat open)`);
    log(`--- diag: second open (${allDiag.length - markerSecond} lines) ---`);

    fs.writeFileSync(
      'nihas-tests/_tmp-diag-driver-chat-hang2.log.json',
      JSON.stringify(
        {
          first: allDiag.slice(markerFirst, markerBack),
          back: allDiag.slice(markerBack, markerSecond),
          second: allDiag.slice(markerSecond),
        },
        null,
        2,
      ),
    );
    log('wrote nihas-tests/_tmp-diag-driver-chat-hang2.log.json');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[runner] FAIL: ${err.message}`);
    await page.screenshot({ path: 'nihas-tests/screenshots/diag2-ERROR.png' }).catch(() => {});
    fs.writeFileSync(
      'nihas-tests/_tmp-diag-driver-chat-hang2.log.json',
      JSON.stringify({ allDiag, error: err.message }, null, 2),
    );
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
