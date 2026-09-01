#!/usr/bin/env node
// Read-only visual QA capture for the Market/Find-Work merge.
// Reuses the same driver test login as _tmp-diag-driver-chat-hang.mjs
// (phone 9008008008, unverified-OTP dev flow) against the already-running dev server.
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[shots] ${m}`);

// The phone/OTP keypad (components/mobile-input/DecimalKeypad.tsx) renders real
// on-screen buttons with accessibilityLabel="Key N" — no usable hidden text input
// on this build, so tap the keys directly instead of typing into an <input>.
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
      verify: () => page.getByText('900 800 8008', { exact: false }).first().isVisible(),
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

    // --- Market -> Find Work ---
    log('opening Market tab');
    await page.getByText(/^market$/i).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/10-market-findwork-top.png` });
    // Reach's own loading gate (storiesQ.isLoading) can outlast a short wait on a
    // cold query cache — give it real time before deciding it's actually stuck.
    for (let i = 1; i <= 6; i++) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/10b-market-findwork-wait-${i}.png` });
      const stillLoading = await page
        .getByText(/loading boosted stories/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!stillLoading) {
        log(`Find Work content resolved after ~${1.5 + i * 1.5}s`);
        break;
      }
      if (i === 6) log('WARNING: Find Work still on loading spinner after ~10.5s');
    }

    // Scroll the feed down in steps, screenshotting the transition into Open Market.
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(207, 500);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/11-market-findwork-scroll-${i}.png` });
    }

    // --- Source filter isolation check ---
    // The bottom tab bar forces its label to literal "MARKET" (all caps, via
    // .toUpperCase() in DriverTabBar.tsx) while the new source chip renders
    // "Market" as authored (mixed case) — a case-SENSITIVE regex (no `i` flag)
    // is the only reliable way to tell them apart on this screen.
    log('clicking Reach source chip');
    await page.getByText(/^Reach$/).first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/12-source-reach.png` });

    log('clicking Market source chip');
    // The screen's own header title is also the literal text "Market" (DriverSubScreenHeader
    // title="Market"), so the chip — not the header — is the LAST exact-case match.
    await page.getByText(/^Market$/).last().click().catch(() => log('FAILED to click Market source chip'));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/13-source-market.png` });

    await page.getByText(/^All Work$/).first().click();
    await page.waitForTimeout(800);

    // --- Market -> My Bids ---
    log('opening My Bids segment');
    await page.getByText(/^find work$/i).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    await page.getByText(/^my bids$/i).first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/20-market-mybids.png` });

    // --- History -> Market ---
    log('opening History tab');
    await page.getByText(/^history$/i).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/30-history-default.png` });

    // The bottom tab bar's own label is forced to literal "HISTORY"/"MARKET"
    // (tab.label.toUpperCase() in DriverTabBar.tsx), while the in-page
    // Active/History toggle and the Market sub-tab chip render their labels
    // as authored ("History", "Market") — exact case-sensitive text tells
    // them apart from the tab bar's all-caps versions.
    await page.getByText('History', { exact: false }).nth(1).click().catch(() => {
      log('WARNING: could not find in-page History toggle by index, trying coordinates');
      return page.mouse.click(340, 177);
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/30b-history-toggled.png` });

    const marketChip = page.getByText(/^Market$/).last();
    await marketChip.click({ force: true }).catch(() => log('FAILED to click Market sub-tab chip'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/31-history-market.png` });

    log('DONE');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[shots] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR.png` }).catch(() => {});
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
