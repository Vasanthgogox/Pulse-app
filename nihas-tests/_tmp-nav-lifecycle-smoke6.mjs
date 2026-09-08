#!/usr/bin/env node
// Round 6: click the header "Trip chat" button (accessibilityLabel="Trip chat")
// from the completed Trip Detail screen and confirm it renders without error.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[smoke6] ${m}`);

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
    await tripCard.click();
    await page.waitForTimeout(1500);
    results.detail_url = page.url();

    const chatBtn = page.getByLabel('Trip chat', { exact: true }).first();
    const chatVisible = await chatBtn.isVisible().catch(() => false);
    results.chat_button_visible = chatVisible;
    if (chatVisible) {
      await chatBtn.click();
      await page.waitForTimeout(2000);
      results.chat_url = page.url();
      results.chat_pageErrors = [...pageErrors];
      await page.screenshot({ path: `${OUT}/90-chat-screen.png`, fullPage: true });

      // Back from chat.
      await page.goBack();
      await page.waitForTimeout(1200);
      results.url_after_chat_back = page.url();
      await page.screenshot({ path: `${OUT}/91-back-from-chat.png`, fullPage: true });
    }

    results.pageErrorsTotal = pageErrors;
    console.log('RESULTS6_JSON_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('RESULTS6_JSON_END');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[smoke6] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR6.png` }).catch(() => {});
    console.log('RESULTS6_JSON_START');
    console.log(JSON.stringify({ ...results, fatalError: err.message, pageErrorsTotal: pageErrors }, null, 2));
    console.log('RESULTS6_JSON_END');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
