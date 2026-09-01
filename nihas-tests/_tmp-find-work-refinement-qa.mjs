#!/usr/bin/env node
// Visual QA for the Find Work / Marketplace refinement (Phase A.1).
// Reuses the proven driver test login mechanics from _tmp-market-ux-screenshots.mjs.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/find_work_shots';

const log = (m) => console.log(`[find-work-qa] ${m}`);

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

    log('opening Market tab');
    await page.getByText(/^market$/i).first().click();
    await page.waitForTimeout(1500);

    for (let i = 1; i <= 5; i++) {
      await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: `${OUT}/10-find-work-all.png`, fullPage: true });
    log('captured All Work view');

    for (let i = 1; i <= 6; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/scroll-${i}.png` });
    }
    log('captured scroll-down sequence toward Marketplace');

    // Tap the "Reach" source chip
    const reachChip = page.getByText(/^Reach$/, { exact: true }).first();
    if (await reachChip.count()) {
      await reachChip.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/11-find-work-reach.png`, fullPage: true });
      log('captured Reach-only view');
    }

    // Tap the "Market" source chip
    const marketChip = page.getByText(/^Market$/, { exact: true }).first();
    if (await marketChip.count()) {
      await marketChip.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/12-find-work-market.png`, fullPage: true });
      log('captured Market-only view');
    }

    // Back to All Work for a final full-feed shot
    const allChip = page.getByText(/^All Work$/, { exact: true }).first();
    if (await allChip.count()) {
      await allChip.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/13-find-work-all-again.png`, fullPage: true });
    }

    log('DONE');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
