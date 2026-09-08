#!/usr/bin/env node
// A10.1 Step 3: DCO submits one real bid on IND021
// (ecf7a13d-7fc5-4e66-80bf-9b6551966f0b). Capture bid amount, any fee shown
// at submission, and the post-submit state.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const PHONE = '9199990005';
const OTP = '4321';
const INDENT_ID = 'ecf7a13d-7fc5-4e66-80bf-9b6551966f0b';
const BID_AMOUNT = '36500';

const log = (m) => console.log(`[dco-bid] ${m}`);

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const pageErrors = [];
  const consoleMsgs = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));

  await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(1500);
  await tapDigits(page, PHONE, { verify: () => page.getByText('919 999 0005', { exact: false }).first().isVisible() });
  await page.getByText('Send OTP', { exact: false }).first().click();
  await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
  await page.getByText('Verify OTP', { exact: false }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  log(`signed in as DCO, url=${page.url()}`);

  await page.goto(`${BASE}/available-loads/${INDENT_ID}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/a10-100-bid-detail.png`, fullPage: true });
  log(`detail url: ${page.url()}`);

  const bidNowBtn = page.getByText('Bid Now', { exact: false }).first();
  await bidNowBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await bidNowBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-101-bid-entry.png`, fullPage: true });

  // Clear the prefilled target (38250, 5 digits) and enter our chosen bid.
  await clearDigits(page, 8);
  await page.waitForTimeout(300);
  for (const d of BID_AMOUNT) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-102-bid-amount-entered.png`, fullPage: true });

  // Submit arrow -> review/confirm modal.
  const submitBtn = page.getByRole('button', { name: 'Submit bid', exact: true }).first();
  await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await submitBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-103-bid-confirm-modal.png`, fullPage: true });

  const confirmBidBtn = page.getByRole('button', { name: 'Confirm bid', exact: true }).first();
  await confirmBidBtn.waitFor({ state: 'visible', timeout: 10_000 });
  consoleMsgs.length = 0;
  await confirmBidBtn.click();
  for (let i = 0; i < 8; i++) await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/a10-104-bid-submitted.png`, fullPage: true });
  log(`url after submit: ${page.url()}`);
  log(`console after submit: ${JSON.stringify(consoleMsgs.slice(-15))}`);

  await browser.close();
  log(`page errors: ${JSON.stringify(pageErrors)}`);
}
main();
