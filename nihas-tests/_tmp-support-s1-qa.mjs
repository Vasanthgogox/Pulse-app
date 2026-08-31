#!/usr/bin/env node
// Read-only-ish visual/runtime QA for Support S1 (creates exactly one real test
// ticket + one reply via the reviewed RPCs — no direct table/DB writes).
// Reuses the same driver test login as the Market QA script (phone 9008008008,
// unverified-OTP dev flow) against the already-running dev server.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/support_shots';

const log = (m) => console.log(`[qa] ${m}`);

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
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
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
  log('WARNING: digit entry never verified after 3 attempts');
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
    await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});

    await tapDigits(page, OTP, {
      verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled(),
    });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => log('WARNING: still on driver-sign-in'));
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`signed in as driver — at ${page.url()}`);

    // --- 1. Direct navigation test: can a driver-role session reach /support at all? ---
    log('navigating directly to /support');
    await page.goto(`${BASE}/support`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/01-support-entry.png` });
    log(`after goto /support, actual url: ${page.url()}`);

    if (!page.url().includes('/support')) {
      log('BLOCKED: navigation redirected away from /support — stopping this script, reporting as-is');
      await browser.close();
      process.exit(0);
    }

    // --- 2. Fill and submit the Create Ticket form ---
    await page.getByText('Other', { exact: true }).first().click().catch(() => log('WARNING: Other category chip not found'));
    await page.screenshot({ path: `${OUT}/02-category-selected.png` });

    // Try submitting empty first, to capture validation state.
    await page.getByText('Submit', { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/03-validation-empty.png` });

    const subjectInput = page.locator('input, textarea').first();
    await subjectInput.click();
    await subjectInput.fill('Phase S1 test');
    const descInput = page.locator('input, textarea').nth(1);
    await descInput.click();
    await descInput.fill('Testing Pulse Support ticket flow.');
    await page.screenshot({ path: `${OUT}/04-form-filled.png` });

    await page.getByText('Submit', { exact: true }).first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/05-after-submit.png` });
    log(`after submit, url: ${page.url()}`);

    // --- 3. My Tickets ---
    await page.goto(`${BASE}/support-tickets`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/06-my-tickets.png` });

    // --- 4. Open the ticket (first card) ---
    const firstCard = page.locator('text=/^SUP-/').first();
    await firstCard.click().catch(() => log('WARNING: could not click ticket card by SUP- text'));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/07-ticket-detail.png` });

    // --- 5. Reply ---
    const replyInput = page.locator('textarea, input').last();
    await replyInput.click();
    await replyInput.fill('Testing support reply.');
    await page.screenshot({ path: `${OUT}/08-reply-typed.png` });
    await page.getByText('Send', { exact: true }).first().click().catch(() => log('WARNING: Send button not found'));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/09-after-reply.png` });

    log('DONE');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[qa] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR.png` }).catch(() => {});
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
