#!/usr/bin/env node
// Round 2: focused, better-paced re-test of History -> Trip Detail -> Back,
// and the History-tab re-tap behavior, after round 1's timing was too tight.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[smoke2] ${m}`);

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
    if (!verify) return;
    if (await verify().catch(() => false)) return;
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
}
function tabBarLabel(page, label) {
  return page.getByText(new RegExp(`^${label.toUpperCase()}$`)).first();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();
  const results = {};

  try {
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);
    await tapDigits(page, PHONE, { verify: () => page.getByText('900 800 8008', { exact: false }).first().isVisible() });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`signed in`);

    log('opening History tab and waiting for real load (not the spinner)');
    await tabBarLabel(page, 'history').click();
    await page.getByText(/^TRIPS\.$/).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => log('WARNING: TRIPS. header never appeared'));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/50-history-loaded.png`, fullPage: true });

    log('clicking the HISTORY (completed) toggle');
    await page.getByText(/^HISTORY$/).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/51-history-completed-tab.png`, fullPage: true });

    // Click the first completed trip card by its trip-number text (e.g. "TRP001")
    // rather than a bare "₹" match, to land on the actual pressable card.
    const tripCard = page.locator('text=/^TRP\\d+/').first();
    const hasCard = await tripCard.isVisible().catch(() => false);
    results.history_completed_card_visible = hasCard;
    if (hasCard) {
      const cardText = await tripCard.textContent();
      log(`clicking completed trip card: ${cardText}`);
      await tripCard.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/52-tripdetail-from-history-completed.png`, fullPage: true });
      results.url_after_open = page.url();
      results.url_is_driver_trip = page.url().includes('/driver-trip/');
      const tabBarVisible = await page.getByText(/^HISTORY$/).first().isVisible().catch(() => false)
        && await page.getByText(/^MARKET$/).first().isVisible().catch(() => false);
      results.tabbar_visible_on_detail = tabBarVisible;
      log(`URL: ${page.url()} | tab bar visible: ${tabBarVisible}`);

      await page.goBack();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/53-back-to-history.png`, fullPage: true });
      results.url_after_back = page.url();
      results.back_returned_to_history = page.url().includes('trip-history') || page.url().endsWith('/(driver)');
    } else {
      log('WARNING: no TRP### card found under History (completed) tab');
    }

    // Flow 3: navigate away to Market, then re-tap History, then re-tap History AGAIN while already on it.
    log('Flow 3: go to Market, then tap History twice in a row');
    await tabBarLabel(page, 'market').click();
    await page.waitForTimeout(1200);
    await tabBarLabel(page, 'history').click();
    await page.waitForTimeout(1200);
    const urlFirstTap = page.url();
    await page.screenshot({ path: `${OUT}/54-history-first-tap.png`, fullPage: true });

    await tabBarLabel(page, 'history').click();
    await page.waitForTimeout(1200);
    const urlSecondTap = page.url();
    await page.screenshot({ path: `${OUT}/55-history-second-tap.png`, fullPage: true });
    results.retap_url_first = urlFirstTap;
    results.retap_url_second = urlSecondTap;
    log(`First tap URL: ${urlFirstTap} | Second (re-)tap URL: ${urlSecondTap}`);

    console.log('RESULTS2_JSON_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('RESULTS2_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[smoke2] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR2.png` }).catch(() => {});
    console.log('RESULTS2_JSON_START');
    console.log(JSON.stringify({ ...results, fatalError: err.message }, null, 2));
    console.log('RESULTS2_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
