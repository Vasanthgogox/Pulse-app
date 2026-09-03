#!/usr/bin/env node
// A6.4 visual QA: verify 'superseded' market_bids status renders correctly
// in Driver App My Bids, Find Work list badge, and the driver_unavailable
// bid-submission error message. Read-mostly; the ONE bid submission attempt
// (Check 4) is explicitly requested by the task to prove the error message.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000002';
const OTP = '1234';
const TARGET_INDENT = '1e822cca-bc4a-4fbc-8b63-519a7d723ca8';
const TARGET_BID_ID = 'dd7499c2-c921-450b-bf41-97e4795eac38';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/a64_ui_verification';

const log = (m) => console.log(`[a64-qa] ${m}`);

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
    await page.screenshot({ path: `${OUT}/00-signin-phone.png` });

    await tapDigits(page, PHONE, {
      verify: () => page.getByText('900 000 0002', { exact: false }).first().isVisible(),
    });
    await page.screenshot({ path: `${OUT}/01-signin-phone-filled.png` });
    await page.getByText('Send OTP', { exact: false }).first().click();

    await page
      .getByText('Verification Code', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => log('WARNING: no Verification Code label seen'));
    await page.screenshot({ path: `${OUT}/02-signin-otp-step.png` });

    await tapDigits(page, OTP, {
      verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled(),
    });
    await page.screenshot({ path: `${OUT}/03-signin-otp-filled.png` });
    await page.getByText('Verify OTP', { exact: false }).first().click();

    await page
      .waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 })
      .catch(() => log('WARNING: still on driver-sign-in after verify'));
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    log(`signed in — at ${page.url()}`);
    await page.screenshot({ path: `${OUT}/04-post-login.png` });

    // ============ CHECK 1/2: Market -> My Bids ============
    log('opening Market tab');
    await page.getByText(/^market$/i).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/10-market-findwork-top.png`, fullPage: true });

    log('opening My Bids segment');
    await page.getByText(/^my bids$/i).first().click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/20-market-mybids-full.png`, fullPage: true });

    // Find the ₹23,000 bid card specifically.
    const amountLocator = page.getByText(/23,000/).first();
    const amountVisible = await amountLocator.isVisible().catch(() => false);
    log(`23,000 amount text visible in My Bids: ${amountVisible}`);
    if (amountVisible) {
      const box = await amountLocator.boundingBox().catch(() => null);
      if (box) {
        // Screenshot a tight clip around the card for a close-up of the badge + explanation text.
        await page.screenshot({
          path: `${OUT}/21-market-mybids-superseded-card-closeup.png`,
          clip: {
            x: Math.max(0, box.x - 20),
            y: Math.max(0, box.y - 140),
            width: 414,
            height: 320,
          },
        }).catch((e) => log(`closeup screenshot failed: ${e.message}`));
      }
    }
    const bodyTextMyBids = await page.locator('body').innerText();
    log('---- My Bids page text dump ----');
    log(bodyTextMyBids);
    log('---- end dump ----');

    // ============ CHECK 3: Find Work list badge for same indent ============
    log('switching back to Find Work segment');
    await page.getByText(/^find work$/i).first().click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/30-findwork-top.png`, fullPage: true });

    // First, learn the route label for TARGET_INDENT by visiting its detail page directly
    // (read-only view; a bid already exists for this driver so no submission form renders).
    log('visiting target indent detail page directly to read its route label');
    await page.goto(`${BASE}/(driver)/available-loads/${TARGET_INDENT}`, {
      waitUntil: 'load',
      timeout: 30_000,
    }).catch((e) => log(`goto target indent failed: ${e.message}`));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/31-target-indent-detail.png`, fullPage: true });
    const targetDetailText = await page.locator('body').innerText().catch(() => '');
    log('---- target indent detail page text ----');
    log(targetDetailText);
    log('---- end ----');

    // Go back to Find Work and scroll to try to find the same indent's card in the open list.
    await page.goto(`${BASE}/(driver)/available-loads`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1800);
    await page.getByText(/^find work$/i).first().click().catch(() => {});
    await page.waitForTimeout(1200);

    let foundCard = false;
    for (let i = 1; i <= 12 && !foundCard; i++) {
      await page.mouse.wheel(0, 650);
      await page.waitForTimeout(450);
      const superText = page.getByText(/^Superseded$/).first();
      foundCard = await superText.isVisible().catch(() => false);
      await page.screenshot({ path: `${OUT}/32-findwork-scroll-${i}.png`, fullPage: true });
      if (foundCard) log(`found a 'Superseded' badge in Find Work list at scroll step ${i}`);
    }
    if (foundCard) {
      const superText = page.getByText(/^Superseded$/).first();
      const box = await superText.boundingBox().catch(() => null);
      if (box) {
        await page.screenshot({
          path: `${OUT}/33-findwork-superseded-badge-closeup.png`,
          clip: {
            x: Math.max(0, box.x - 250),
            y: Math.max(0, box.y - 100),
            width: 414,
            height: 200,
          },
        }).catch((e) => log(`closeup failed: ${e.message}`));
      }
    } else {
      log('WARNING: no Superseded badge found in Find Work open-loads list after scrolling — indent may not be in the open feed');
    }

    // ============ CHECK 4: attempt a new bid on a DIFFERENT open load, expect driver_unavailable ============
    log('scrolling Find Work from top looking for a load card with NO existing bid badge');
    await page.goto(`${BASE}/(driver)/available-loads`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.getByText(/^find work$/i).first().click().catch(() => {});
    await page.waitForTimeout(1200);

    // Collect chevron-right rows (LoadCard is a Pressable with a route + ChevronRight).
    // We identify candidate rows by their route text (contains an arrow "→" or "->") AND
    // absence of a status pill text near them ("Bid submitted"/"Superseded"/"Awarded"/"Not selected").
    let attempted = false;
    for (let pass = 1; pass <= 10 && !attempted; pass++) {
      await page.screenshot({ path: `${OUT}/40-findwork-search-pass-${pass}.png`, fullPage: true });
      const rows = await page.locator('text=/→/').all();
      for (const row of rows) {
        const box = await row.boundingBox().catch(() => null);
        if (!box) continue;
        // Look within a small vertical band below this route text for a status pill.
        const nearbyStatus = await page
          .locator('text=/^(Bid submitted|Superseded|Awarded|Not selected)$/')
          .filter({ hasNot: page.locator(':scope') }) // no-op filter placeholder
          .all();
        let hasStatusNearby = false;
        for (const s of nearbyStatus) {
          const sb = await s.boundingBox().catch(() => null);
          if (sb && Math.abs(sb.y - box.y) < 80) {
            hasStatusNearby = true;
            break;
          }
        }
        if (!hasStatusNearby) {
          log(`attempting tap on candidate row at y=${box.y}`);
          await row.click({ timeout: 5000 }).catch((e) => log(`tap failed: ${e.message}`));
          await page.waitForTimeout(1500);
          if (/available-loads\/[^/?]+/.test(page.url()) && !page.url().includes(TARGET_INDENT)) {
            attempted = true;
          } else {
            log(`did not land on a fresh load detail (url=${page.url()}); going back`);
            await page.goBack().catch(() => {});
            await page.waitForTimeout(1000);
          }
          break;
        }
      }
      if (!attempted) {
        await page.mouse.wheel(0, 650);
        await page.waitForTimeout(450);
      }
    }

    if (attempted) {
      log(`landed on candidate load detail: ${page.url()}`);
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/50-candidate-load-detail.png`, fullPage: true });

      const amountInput = page.locator('input[placeholder]').first();
      const hasForm = await amountInput.count();
      log(`bid form present on this load: ${hasForm > 0}`);
      if (hasForm) {
        await amountInput.fill('20000');
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/51-amount-filled.png`, fullPage: true });

        const submitBtn = page.getByText('Submit Bid', { exact: true }).first();
        await submitBtn.click({ timeout: 5000 }).catch((e) => log(`submit click failed: ${e.message}`));
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/52-after-submit-attempt.png`, fullPage: true });

        const bodyTextAfterSubmit = await page.locator('body').innerText();
        log('---- page text after submit attempt ----');
        log(bodyTextAfterSubmit);
        log('---- end ----');
      } else {
        log('No bid form on this candidate load (maybe already has a bid despite badge heuristic, or load unavailable) — dumping page text');
        const t = await page.locator('body').innerText();
        log(t);
      }
    } else {
      log('COULD NOT find a distinct open load without an existing bid badge to attempt Check 4 on.');
    }

    log('DONE');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[a64-qa] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR.png` }).catch(() => {});
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
