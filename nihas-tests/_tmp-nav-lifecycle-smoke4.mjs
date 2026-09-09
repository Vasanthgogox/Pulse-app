#!/usr/bin/env node
// Round 4: precisely identify what's under History's "HISTORY" (completed)
// toggle vs "ACTIVE", then drive the full requested smoke matrix.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[smoke4] ${m}`);

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
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
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
    log('signed in');

    // ---------- History: identify Active vs History content precisely ----------
    await tabBarLabel(page, 'history').click();
    await page.getByText(/^TRIPS\.$/).first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1500);
    const activeBodyText = await page.locator('body').innerText();
    log('--- ACTIVE tab body text ---');
    console.log(activeBodyText);
    await page.screenshot({ path: `${OUT}/70-history-active-full.png`, fullPage: true });

    await page.getByText('History', { exact: true }).first().click();
    await page.waitForTimeout(1800);
    const historyBodyText = await page.locator('body').innerText();
    log('--- HISTORY (completed) tab body text ---');
    console.log(historyBodyText);
    await page.screenshot({ path: `${OUT}/71-history-completed-full.png`, fullPage: true });

    // Find a card whose nearby text does NOT include "IN TRANSIT"/"ASSIGNED"/"PICKUP".
    const cards = await page.locator('text=/^TRP\\d+/').all();
    let completedCard = null;
    for (const c of cards) {
      const container = c.locator('xpath=ancestor::*[position()<=6]').last();
      const text = await container.innerText().catch(() => '');
      if (!/IN TRANSIT|ASSIGNED|PICKUP/i.test(text)) {
        completedCard = c;
        results.completed_card_context = text;
        break;
      }
    }
    if (!completedCard && cards.length > 0) {
      completedCard = cards[0];
      results.completed_card_context = 'FALLBACK_FIRST_CARD';
    }
    results.num_trp_cards_under_history_tab = cards.length;
    log(`TRP cards under HISTORY tab: ${cards.length}`);

    if (completedCard) {
      const label = await completedCard.textContent();
      log(`Opening card: ${label}`);
      await completedCard.click();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/72-tripdetail-completed.png`, fullPage: true });
      results.url_completed_detail = page.url();
      results.tabbar_visible_completed_detail = await page.getByText('History', { exact: true }).first().isVisible().catch(() => false)
        && await page.getByText(/^DASHBOARD$/).first().isVisible().catch(() => false);

      // Tabs: Journey / Operations / Settlement
      for (const tab of ['Journey', 'Operations', 'Settlement']) {
        const tabEl = page.getByText(new RegExp(`^${tab}$`, 'i')).first();
        const visible = await tabEl.isVisible().catch(() => false);
        results[`tab_${tab.toLowerCase()}_visible`] = visible;
        if (visible) {
          await tabEl.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: `${OUT}/73-tab-${tab.toLowerCase()}.png`, fullPage: true });
          results[`tab_${tab.toLowerCase()}_pageErrors_after`] = [...pageErrors];
        }
      }

      // Chat icon (communication) if reachable.
      const chatIcon = page.locator('svg').filter({ hasText: '' }).first();
      const chatButton = page.locator('[role="button"]').filter({ has: page.locator('svg') });
      log(`chat-capable buttons found: ${await chatButton.count().catch(() => 0)}`);

      // Back navigation.
      await page.goBack();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/74-back-from-completed-detail.png`, fullPage: true });
      results.url_after_back = page.url();

      // Re-tap History while already on History.
      await tabBarLabel(page, 'history').click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/75-retap-history-final.png`, fullPage: true });
      results.url_after_retap = page.url();
    }

    results.pageErrorsTotal = pageErrors;
    console.log('RESULTS4_JSON_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('RESULTS4_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[smoke4] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR4.png` }).catch(() => {});
    console.log('RESULTS4_JSON_START');
    console.log(JSON.stringify({ ...results, fatalError: err.message, pageErrorsTotal: pageErrors }, null, 2));
    console.log('RESULTS4_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
