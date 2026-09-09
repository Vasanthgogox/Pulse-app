#!/usr/bin/env node
// A10.1 Step 4: A10 Pilot Fleet Org discovers IND021 and submits a
// Marketplace bid at a different amount than the DCO's ₹36,500.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const EMAIL = 'a10.pilot.org@example.com';
const PASSWORD = 'A10PilotOrg#2026';
const BID_AMOUNT = '37800';

const log = (m) => console.log(`[org-bid] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const pageErrors = [];
  const consoleMsgs = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log(`signed in as A10 Pilot Fleet Org, url=${page.url()}`);

  await page.goto(`${BASE}/find-loads`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/a10-120-org-find-loads.png`, fullPage: true });
  log(`find-loads url: ${page.url()}`);

  const ind021Anchor = page.getByText('IND021', { exact: true }).first();
  const found = await ind021Anchor.isVisible().catch(() => false);
  log(`IND021 visible: ${found}`);
  if (!found) { await browser.close(); return; }

  await ind021Anchor.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  const bidBtn = page.locator(
    'xpath=//*[text()="IND021"]/following::*[contains(text(),"Bid") and not(contains(text(),"Marketplace"))][1]'
  ).first();
  await bidBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await bidBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/a10-121-org-bid-entry.png`, fullPage: true });
  log(`after bid click url: ${page.url()}`);

  await page.getByPlaceholder('e.g. 45000').fill(BID_AMOUNT);
  await page.getByPlaceholder('Anything the shipper should know').fill('A10 Pilot Fleet Org controlled test bid');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-122-org-bid-filled.png`, fullPage: true });

  const submitBidBtn = page.getByText('Submit Bid', { exact: true }).first();
  await submitBidBtn.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < 6; i++) {
    if (await submitBidBtn.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  const enabled = await submitBidBtn.isEnabled().catch(() => false);
  log(`Submit Bid enabled: ${enabled}`);
  if (enabled) {
    consoleMsgs.length = 0;
    await submitBidBtn.click();
    for (let i = 0; i < 8; i++) await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/a10-123-org-bid-submitted.png`, fullPage: true });
    log(`console after submit: ${JSON.stringify(consoleMsgs.slice(-15))}`);
  }

  await browser.close();
  log(`page errors: ${JSON.stringify(pageErrors)}`);
}
main();
