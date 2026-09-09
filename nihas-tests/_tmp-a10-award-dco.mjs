#!/usr/bin/env node
// A10.1 Step 5: Godrej India accepts the A10 Pilot DCO bid (Rs 36,500) on
// IND021's Review Hub. Does NOT touch the competing A10 Pilot Fleet Org bid.
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[award-dco] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const pageErrors = [];
  const consoleMsgs = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  page.on('dialog', async (d) => { log(`DIALOG: ${d.message()}`); await d.accept().catch(() => {}); });

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

  const spaceXAnchor = page.getByText('SpaceXLogistics', { exact: true }).first();
  await spaceXAnchor.waitFor({ state: 'visible', timeout: 15_000 });
  await spaceXAnchor.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  const reviewBtn = page.locator(
    'xpath=//*[text()="SpaceXLogistics"]/following::*[contains(text(),"Review")][1]'
  ).first();
  await reviewBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await reviewBtn.click();
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const reviewHubHeader = page.getByText('REVIEW HUB', { exact: true }).first();
  for (let i = 0; i < 15; i++) {
    if (await reviewHubHeader.isVisible().catch(() => false)) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/a10-130-review-hub-pre-award.png`, fullPage: true });

  // Confirm both offers are still present before touching anything.
  const dcoRow = page.getByText('Fleet owner (A10 Pilot DCO)', { exact: true }).first();
  const orgRow = page.getByText('A10 Pilot Fleet Org', { exact: true }).first();
  log(`DCO offer visible: ${await dcoRow.isVisible().catch(() => false)}`);
  log(`Org offer visible: ${await orgRow.isVisible().catch(() => false)}`);

  // Click the "Accept" button nearest to the DCO row specifically.
  const dcoAccept = page.locator(
    'xpath=//*[text()="Fleet owner (A10 Pilot DCO)"]/following::*[text()="Accept"][1]'
  ).first();
  await dcoAccept.waitFor({ state: 'visible', timeout: 10_000 });
  consoleMsgs.length = 0;
  await dcoAccept.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-131-award-confirm-prompt.png`, fullPage: true });

  // STOP: back out via Cancel, do not actually accept, pending an unexpected
  // finding (a non-zero fee shown here contradicts the fee-inactive premise).
  const cancelBtn = page.getByText('Cancel', { exact: true }).first();
  if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(1000);
    log('cancelled the accept prompt -- no award performed');
  }
  await page.screenshot({ path: `${OUT}/a10-132-after-cancel.png`, fullPage: true });

  await browser.close();
  log(`console: ${JSON.stringify(consoleMsgs.slice(-10))}`);
  log(`page errors: ${JSON.stringify(pageErrors)}`);
}
main();
