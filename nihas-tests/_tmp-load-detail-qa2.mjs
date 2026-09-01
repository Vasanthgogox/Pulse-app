#!/usr/bin/env node
// Visual QA for AvailableLoadDetailScreen.tsx — observation only, no bid submission.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/load_detail_shots_v2';

const log = (m) => console.log(`[load-detail-qa-v2] ${m}`);

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
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/00-find-work.png`, fullPage: true });

    // Scroll to find a Marketplace row and remember its filter state for the back-nav check
    let marketRowFound = false;
    for (let i = 1; i <= 8 && !marketRowFound; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(500);
      marketRowFound = (await page.getByText(/MARKETPLACE/, { exact: true }).count()) > 0;
    }
    await page.screenshot({ path: `${OUT}/01-scrolled-to-marketplace.png`, fullPage: true });
    log(`marketplace section visible: ${marketRowFound}`);

    // Scroll back down and tap the first Marketplace row (no filter applied yet -- filter
    // persistence is checked separately, after confirming plain navigation works)
    for (let i = 1; i <= 8; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(400);
      const label = page.getByText(/MARKETPLACE/, { exact: true }).first();
      if (await label.count()) break;
    }
    await page.waitForTimeout(500);

    // Apply a Status filter (Reach-only concept, doesn't remove the Marketplace load from view
    // the way Pickup/Drop would) so we can check whether it survives a Load Details round trip.
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(500);
    const statusChip = page.getByText('Available', { exact: true }).first();
    if (await statusChip.count()) {
      await statusChip.click();
      await page.waitForTimeout(600);
      log('applied Status=Available filter before navigating to Load Details');
    }
    await page.screenshot({ path: `${OUT}/02-filter-applied.png`, fullPage: true });

    for (let i = 1; i <= 8; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(400);
      if (await page.getByText(/MARKETPLACE/, { exact: true }).count()) break;
    }
    await page.screenshot({ path: `${OUT}/03-before-tap-load.png`, fullPage: true });

    // Find the arrow route text ("City -> City") that appears AFTER the MARKETPLACE label in
    // document order, so we don't accidentally hit a Reach story's own "->" route text above it.
    const marketplaceY = await page
      .getByText(/MARKETPLACE/, { exact: true })
      .first()
      .boundingBox()
      .then((b) => b?.y ?? 0)
      .catch(() => 0);
    const routeCandidates = await page.getByText(/→/).all();
    let targetRow = null;
    for (const cand of routeCandidates) {
      const box = await cand.boundingBox().catch(() => null);
      if (box && box.y > marketplaceY) {
        targetRow = cand;
        break;
      }
    }
    log(`marketplace row candidate found: ${!!targetRow}`);
    if (targetRow) {
      await targetRow.click({ timeout: 5000 }).catch((e) => log(`tap failed: ${e.message}`));
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/04-after-tap.png`, fullPage: true });
    log(`current url: ${page.url()}`);

    if (/available-loads\/[^/?]+/.test(page.url())) {
      log('reached Load Details screen');
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/05-load-details-top.png`, fullPage: true });

      // Try typing a bid amount to check formatting/validation, without submitting
      const amountInput = page.locator('input[placeholder*="18500"], input[placeholder]').first();
      if (await amountInput.count()) {
        await amountInput.fill('abc');
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/06-amount-invalid-text.png`, fullPage: true });
        await amountInput.fill('');
        await amountInput.fill('25000');
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/07-amount-valid.png`, fullPage: true });
      } else {
        log('amount input not found (maybe already has an existing bid / different state)');
      }

      // Go back and check filter persistence
      await page.goBack();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/08-after-back.png`, fullPage: true });
    } else {
      log('WARNING: did not navigate to Load Details — capturing DOM text for diagnosis');
      const bodyText = await page.locator('body').innerText();
      log(bodyText.slice(0, 2000));
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
