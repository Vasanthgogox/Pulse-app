#!/usr/bin/env node
// Round 5: finish the remaining checklist items on the completed Trip Detail
// (TRP002) after the provider-boundary fix — Settlement tab with a proper
// wait (round 4's screenshot caught it mid-spinner), and the chat/
// communication icon in the header, if reachable without side effects.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[smoke5] ${m}`);

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

    await tabBarLabel(page, 'history').click();
    await page.getByText(/^TRIPS\.$/).first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1200);
    await page.getByText('History', { exact: true }).first().click();
    await page.waitForTimeout(1500);

    const tripCard = page.locator('text=/^TRP\\d+/').first();
    await tripCard.waitFor({ state: 'visible', timeout: 10_000 });
    const label = await tripCard.textContent();
    log(`opening: ${label}`);
    await tripCard.click();
    await page.waitForTimeout(1500);
    results.url = page.url();

    // Settlement tab, with a real wait for the spinner to resolve.
    const settlementTab = page.getByText(/^Settlement$/i).first();
    await settlementTab.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/80-settlement-loaded.png`, fullPage: true });
    results.settlement_pageErrors = [...pageErrors];

    // Journey tab again to re-confirm Proof of Delivery section (document/gallery).
    await page.getByText(/^Journey$/i).first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/81-journey-pod-recheck.png`, fullPage: true });

    // Chat / communication icon in the header (message-bubble icon next to share).
    const chatIcon = page.locator('button, [role="button"]').filter({ has: page.locator('svg') });
    const iconCount = await chatIcon.count().catch(() => 0);
    log(`header icon-buttons found: ${iconCount}`);
    let chatOpened = false;
    // Header icons in this screen are: back (left), chat + share (right). Try each
    // right-side icon button and see if a chat/communication surface appears.
    for (let i = 0; i < iconCount; i++) {
      const btn = chatIcon.nth(i);
      const box = await btn.boundingBox().catch(() => null);
      if (!box || box.y > 60) continue; // header row only
      if (box.x < 200) continue; // skip the left back button
      await btn.click().catch(() => {});
      await page.waitForTimeout(1200);
      const url = page.url();
      const hasModalText = await page.getByText(/message|chat|send/i).first().isVisible().catch(() => false);
      if (url !== results.url || hasModalText) {
        chatOpened = true;
        results.chat_trigger_index = i;
        results.chat_url_or_modal = url;
        await page.screenshot({ path: `${OUT}/82-chat-opened.png`, fullPage: true });
        // close / go back if it navigated
        if (url !== results.url) await page.goBack().catch(() => {});
        else await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(800);
        break;
      }
    }
    results.chat_opened = chatOpened;
    if (!chatOpened) await page.screenshot({ path: `${OUT}/82-chat-not-found.png`, fullPage: true });

    results.pageErrorsTotal = pageErrors;
    console.log('RESULTS5_JSON_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('RESULTS5_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[smoke5] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR5.png` }).catch(() => {});
    console.log('RESULTS5_JSON_START');
    console.log(JSON.stringify({ ...results, fatalError: err.message, pageErrorsTotal: pageErrors }, null, 2));
    console.log('RESULTS5_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
