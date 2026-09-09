#!/usr/bin/env node
// Read-only smoke test for the driver navigation/lifecycle fix (c1545c8b).
// Reuses the same driver test login as _tmp-market-ux-screenshots.mjs
// (phone 9008008008, unverified-OTP dev flow) against the already-running dev server.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[smoke] ${m}`);

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

// Bottom tab bar labels are forced to literal UPPERCASE
// (tab.label.toUpperCase() in DriverTabBar.tsx); in-page titles/chips render
// as authored (mixed case). Use this to reliably target the TAB, not a
// same-named in-page element.
function tabBarLabel(page, label) {
  return page.getByText(new RegExp(`^${label.toUpperCase()}$`)).first();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => { consoleErrors.push(e.message); log(`PAGE ERROR: ${e.message}`); });

  const results = {};

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
    await page.screenshot({ path: `${OUT}/00-post-login.png` });

    // ================= FLOW 6: Market -> Find Work =================
    log('FLOW 6: Market -> Find Work (freshness, ordering)');
    await tabBarLabel(page, 'market').click();
    await page.waitForTimeout(1500);
    for (let i = 1; i <= 6; i++) {
      const stillLoading = await page.getByText(/loading boosted stories/i).first().isVisible().catch(() => false);
      if (!stillLoading) break;
      await page.waitForTimeout(1500);
    }
    await page.getByText(/^find work$/i).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/10-findwork.png`, fullPage: true });
    const postedLabels = await page.getByText(/^Posted /).allTextContents();
    results.flow6_posted_labels = postedLabels;
    log(`Find Work "Posted" labels seen: ${JSON.stringify(postedLabels)}`);

    // ================= FLOW 5: Market -> My Bids -> Completed =================
    log('FLOW 5: Market -> My Bids -> Completed section');
    await page.getByText(/^my bids$/i).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/20-mybids.png`, fullPage: true });
    const completedHeader = await page.getByText(/^COMPLETED/).first().isVisible().catch(() => false);
    results.flow5_completed_section_visible = completedHeader;
    log(`My Bids "COMPLETED" section visible: ${completedHeader}`);

    const viewTripBtn = page.getByText(/^View Trip$/i).first();
    const hasViewTrip = await viewTripBtn.isVisible().catch(() => false);
    if (hasViewTrip) {
      log('FLOW 1+2: opening Trip Detail from My Bids Completed card');
      await viewTripBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/21-tripdetail-from-mybids.png`, fullPage: true });
      results.flow1_url_is_driver_trip = page.url().includes('/driver-trip/');
      const tabBarVisible = await page.getByText(/^MARKET$/).first().isVisible().catch(() => false);
      results.flow1_tabbar_hidden = !tabBarVisible;
      log(`Trip Detail URL: ${page.url()} | tab bar visible: ${tabBarVisible}`);

      await page.goBack();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/22-back-from-tripdetail.png`, fullPage: true });
      results.flow2_back_returned_to_mybids =
        (await page.getByText(/^my bids$/i).first().isVisible().catch(() => false)) ||
        (await page.getByText(/^COMPLETED/).first().isVisible().catch(() => false));
    } else {
      log('WARNING: no "View Trip" button found on any My Bids card -- cannot verify flows 1/2 from this entry point');
      results.flow1_url_is_driver_trip = 'NO_VIEW_TRIP_BUTTON_FOUND';
    }

    // ================= FLOW 4: History Active/History sections =================
    log('FLOW 4: History tab -> Active/History sections');
    await tabBarLabel(page, 'history').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/30-history-default.png`, fullPage: true });
    const activeToggle = await page.getByText(/^Active$/).first().isVisible().catch(() => false);
    const historyToggle = await page.getByText(/^History$/).first().isVisible().catch(() => false);
    results.flow4_active_toggle_visible = activeToggle;
    results.flow4_history_toggle_visible = historyToggle;
    log(`History screen: Active toggle=${activeToggle}, History toggle=${historyToggle}`);

    if (historyToggle) {
      await page.getByText(/^History$/).first().click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/31-history-completed-list.png`, fullPage: true });
    }

    const historyRows = page.locator('text=/₹/').first();
    const hasHistoryRow = await historyRows.isVisible().catch(() => false);
    if (hasHistoryRow) {
      log('FLOW 1+2 (from History): opening a trip from History list');
      await historyRows.click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/32-tripdetail-from-history.png`, fullPage: true });
      const urlFromHistory = page.url();
      const tabBarVisibleFromHistory = await page.getByText(/^HISTORY$/).first().isVisible().catch(() => false);
      results.flow1_from_history_url = urlFromHistory;
      results.flow1_from_history_tabbar_hidden = !tabBarVisibleFromHistory;
      log(`From History -> Trip Detail URL: ${urlFromHistory} | tab bar visible: ${tabBarVisibleFromHistory}`);

      await page.goBack();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/33-back-from-tripdetail-to-history.png`, fullPage: true });
    } else {
      log('WARNING: no trip row found in History list to open');
    }

    // ================= FLOW 3: tap History tab while already on History =================
    log('FLOW 3: re-tap History tab while already showing History');
    const beforeUrl = page.url();
    await tabBarLabel(page, 'history').click();
    await page.waitForTimeout(1000);
    const afterUrl = page.url();
    await page.screenshot({ path: `${OUT}/40-retap-history.png`, fullPage: true });
    results.flow3_url_before = beforeUrl;
    results.flow3_url_after = afterUrl;
    log(`Re-tap History: before=${beforeUrl} after=${afterUrl}`);

    log('DONE');
    console.log('RESULTS_JSON_START');
    console.log(JSON.stringify({ results, consoleErrors }, null, 2));
    console.log('RESULTS_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[smoke] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR.png` }).catch(() => {});
    console.log('RESULTS_JSON_START');
    console.log(JSON.stringify({ results, consoleErrors, fatalError: err.message }, null, 2));
    console.log('RESULTS_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
