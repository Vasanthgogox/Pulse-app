#!/usr/bin/env node
// Verify Review Hub v1 for Market bids: sign in as the real business account,
// open IND099 (Bangalore -> Chennai) Review Hub, confirm both pending
// market_bids (Sadam ₹87,654 test bid + Vincent ₹87,634) render with
// bidder/vehicle/amount/note, MARKET badge, and Accept/Reject actions.
// Read-only: does not click Accept or Reject.
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/review_hub_market_qa';

const log = (m) => console.log(`[review-hub-market-qa] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  try {
    log('signing in as the business account');
    await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 120_000 });
    const email = page.locator('input[type="email"]').first();
    const password = page.locator('input[type="password"]').first();
    await email.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const typeInto = async (field, value) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await field.click();
        await field.type(value, { delay: 20 });
        await page.waitForTimeout(400);
        if ((await field.inputValue()) === value) return;
        await field.fill('');
        await page.waitForTimeout(800);
      }
      throw new Error('value would not stick in sign-in field');
    };
    await typeInto(email, E2E_EMAIL);
    await typeInto(password, E2E_PASSWORD);

    await page.locator('[data-testid="signin-submit-btn"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 180_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    log(`signed in — at ${page.url()}`);

    log('navigating to Load Center');
    await page.goto(`${BASE}/load-center`, { waitUntil: 'load', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/00-load-center.png`, fullPage: true });

    log('finding the Bangalore -> Chennai test load and clicking Review');
    const routeCard = page.getByText(/BANGALORE/i).first();
    await routeCard.waitFor({ state: 'visible', timeout: 20_000 });
    // Scope the Review click to the same card row as the route text.
    const cardBox = await routeCard.boundingBox();
    const reviewCandidates = await page.getByText(/^Review$/, { exact: true }).all();
    let reviewBtn = null;
    for (const cand of reviewCandidates) {
      const box = await cand.boundingBox().catch(() => null);
      if (box && cardBox && Math.abs(box.y - cardBox.y) < 220) {
        reviewBtn = cand;
        break;
      }
    }
    if (!reviewBtn) throw new Error('Review button not found near the Bangalore -> Chennai card');
    await reviewBtn.click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/01-review-hub-open.png`, fullPage: true });

    const offersHeader = page.getByText(/^Offers$/, { exact: true }).first();
    const marketBadges = await page.getByText('MARKET', { exact: true }).all();
    const acceptButtons = await page.getByText('Accept', { exact: true }).all();
    const rejectButtons = await page.getByText('Reject', { exact: true }).all();
    const amount87654 = await page.getByText(/87,654/).count();
    const amount87634 = await page.getByText(/87,634/).count();
    const vehicleText = await page.getByText(/TN 38 QA 0001/).count();

    log(`offers header visible: ${await offersHeader.isVisible().catch(() => false)}`);
    log(`MARKET badges found: ${marketBadges.length}`);
    log(`Accept buttons found: ${acceptButtons.length}`);
    log(`Reject buttons found: ${rejectButtons.length}`);
    log(`shows ₹87,654 (Sadam test bid): ${amount87654 > 0}`);
    log(`shows ₹87,634 (Vincent bid): ${amount87634 > 0}`);
    log(`shows vehicle TN 38 QA 0001: ${vehicleText > 0}`);

    await page.screenshot({ path: `${OUT}/02-review-hub-market-cards.png`, fullPage: true });
    log('DONE — no Accept/Reject clicked');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
