#!/usr/bin/env node
// A10.1 Step 2 verification (discovery only, no bid): confirm the fresh
// "A10 Pilot Fleet Org" can discover the Godrej India Chennai->Bengaluru
// Marketplace load as an external opportunity.
import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const EMAIL = 'a10.pilot.org@example.com';
const PASSWORD = 'A10PilotOrg#2026';

const log = (m) => console.log(`[org-discovery] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('http://localhost:8081/sign-in', { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.waitForTimeout(500);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log(`signed in as A10 Pilot Fleet Org, url=${page.url()}`);

  await page.goto('http://localhost:8081/pulse-loads', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/a10-90-org-myloads.png`, fullPage: true });
  log(`pulse-loads url: ${page.url()}`);

  const findLoadsBtn = page.getByText('Find Loads', { exact: false }).first();
  await findLoadsBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await findLoadsBtn.click();
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/a10-91-org-find-loads.png`, fullPage: true });
  log(`find-loads url: ${page.url()}`);

  const chennaiVisible = await page.getByText('Chennai', { exact: false }).first().isVisible().catch(() => false);
  log(`Chennai load visible in org Find Loads: ${chennaiVisible}`);

  await page.getByText('Chennai', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.mouse.wheel(0, 250);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-92-org-chennai-scrolled.png`, fullPage: true });

  // Marketplace-only filter tab.
  await page.getByText('Marketplace', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-93-org-marketplace-filter.png`, fullPage: true });

  await browser.close();
  log(`page errors: ${JSON.stringify(pageErrors)}`);
}
main();
