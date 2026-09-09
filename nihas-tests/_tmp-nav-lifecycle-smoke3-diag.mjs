#!/usr/bin/env node
// Diagnostic: reproduce the "Something went wrong" error seen when opening a
// completed trip from History's completed list, and capture the real cause
// (console errors, page errors, failed network responses, and the app's own
// "Technical Details" expander text).
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[diag] ${m}`);

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

  const consoleMsgs = [];
  const pageErrors = [];
  const failedResponses = [];
  page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (e) => pageErrors.push(e.message + '\n' + (e.stack || '')));
  page.on('response', (res) => { if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`); });

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

    await tabBarLabel(page, 'history').click();
    await page.waitForTimeout(3000);
    await page.getByText(/^HISTORY$/).first().click();
    await page.waitForTimeout(1500);

    const tripCard = page.locator('text=/^TRP\\d+/').first();
    await tripCard.waitFor({ state: 'visible', timeout: 10_000 });
    const cardText = await tripCard.textContent();
    log(`About to click: ${cardText}`);

    // Clear logs right before the click so we only capture what this
    // specific navigation produces.
    consoleMsgs.length = 0;
    pageErrors.length = 0;
    failedResponses.length = 0;

    await tripCard.click();
    await page.waitForTimeout(2000);
    log(`URL after click: ${page.url()}`);
    await page.screenshot({ path: `${OUT}/60-error-state.png`, fullPage: true });

    const detailsToggle = page.getByText(/Technical Details/i).first();
    if (await detailsToggle.isVisible().catch(() => false)) {
      await detailsToggle.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/61-error-details-expanded.png`, fullPage: true });
      const bodyText = await page.locator('body').innerText();
      log('--- Full page text after expanding Technical Details ---');
      console.log(bodyText);
    }

    log('--- console messages since click ---');
    console.log(consoleMsgs.join('\n'));
    log('--- page errors since click ---');
    console.log(pageErrors.join('\n---\n'));
    log('--- failed HTTP responses since click ---');
    console.log(failedResponses.join('\n'));

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[diag] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR3.png` }).catch(() => {});
    log('--- console messages ---'); console.log(consoleMsgs.join('\n'));
    log('--- page errors ---'); console.log(pageErrors.join('\n---\n'));
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
