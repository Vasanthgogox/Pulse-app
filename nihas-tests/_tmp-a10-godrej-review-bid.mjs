#!/usr/bin/env node
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[godrej-review] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log(`signed in as Godrej India, url=${page.url()}`);

  await page.goto(`${BASE}/pulse-loads`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/a10-110-godrej-myloads.png`, fullPage: true });

  const receivingBidsTab = page.getByText('Receiving Bids', { exact: false }).first();
  await receivingBidsTab.waitFor({ state: 'visible', timeout: 15_000 });
  await receivingBidsTab.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/a10-111-godrej-receiving-bids.png`, fullPage: true });

  // Receiving Bids is supplier-scoped (empty, as expected). Marketplace bids
  // show on the load's own Review Hub instead -- go back to My loads and
  // open our specific IND021 / SpaceXLogistics card.
  await page.getByText('My loads', { exact: false }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/a10-112-godrej-myloads-tab.png`, fullPage: true });

  // Anchor on the amount/route to find the right card among many, then click its Review.
  const spaceXAnchor = page.getByText('SpaceXLogistics', { exact: true }).first();
  const found = await spaceXAnchor.isVisible().catch(() => false);
  log(`SpaceXLogistics card visible in My loads: ${found}`);
  if (found) {
    await spaceXAnchor.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    // Document-order-based: the first "Review" that comes AFTER SpaceXLogistics
    // in the DOM is this card's own Review button (list is vertically ordered).
    const nextReview = page.locator(
      'xpath=//*[text()="SpaceXLogistics"]/following::*[contains(text(),"Review")][1]'
    ).first();
    const bestBtn = (await nextReview.isVisible().catch(() => false)) ? nextReview : null;
    log(`document-order Review found: ${!!bestBtn}`);
    if (bestBtn) {
      await bestBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${OUT}/a10-113-godrej-review-hub.png`, fullPage: true });
      log(`review hub url: ${page.url()}`);
    }
  }

  await browser.close();
}
main();
