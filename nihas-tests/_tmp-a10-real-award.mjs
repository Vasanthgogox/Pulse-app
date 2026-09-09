#!/usr/bin/env node
// A10.2 real walkthrough Step 1: Godrej India awards the DCO bid (₹36,500)
// on IND021. Confirms the fee-required prompt, accepts, and captures the
// resulting Review Hub state.
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[real-award] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
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

  // Filter the list down to just SpaceXLogistics via the search icon, so
  // exactly one "Review" button exists and there's no position ambiguity.
  const searchIcon = page.locator('[role="button"]').filter({ has: page.locator('svg') }).first();
  await searchIcon.click().catch(() => {});
  await page.waitForTimeout(600);
  const searchInput = page.getByPlaceholder(/search/i).first();
  await searchInput.waitFor({ state: 'visible', timeout: 10_000 });
  await searchInput.fill('SpaceXLogistics');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/a10-140-pre-award.png`, fullPage: true });

  const reviewBtn = page.getByText('Review', { exact: false }).first();
  await reviewBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await reviewBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/diag-immediate-after-click.png`, fullPage: true });
  const reviewHubHeader = page.getByText('REVIEW HUB', { exact: true }).first();
  await reviewHubHeader.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-140b-review-hub-open.png`, fullPage: true });

  const dcoRow = page.getByText('Fleet owner (A10 Pilot DCO)', { exact: true }).first();
  const orgRow = page.getByText('A10 Pilot Fleet Org', { exact: true }).first();
  log(`DCO offer visible: ${await dcoRow.isVisible().catch(() => false)}`);
  log(`Org offer visible: ${await orgRow.isVisible().catch(() => false)}`);

  const dcoAccept = page.locator(
    'xpath=//*[text()="Fleet owner (A10 Pilot DCO)"]/following::*[text()="Accept"][1]'
  ).first();
  await dcoAccept.waitFor({ state: 'visible', timeout: 10_000 });
  await dcoAccept.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-141-award-confirm-prompt.png`, fullPage: true });

  // Real acceptance this time.
  const confirmAcceptBtn = page.getByText('Accept', { exact: true }).last();
  await confirmAcceptBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await confirmAcceptBtn.click();
  for (let i = 0; i < 6; i++) await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/a10-142-after-award.png`, fullPage: true });
  log(`url after award: ${page.url()}`);

  await browser.close();
  log(`page errors: ${JSON.stringify(pageErrors)}`);
}
main();
