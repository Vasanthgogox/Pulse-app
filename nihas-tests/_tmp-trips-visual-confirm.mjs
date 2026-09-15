#!/usr/bin/env node
// Focused follow-up: confirm ALL renders indent+trip cards together, and
// UNASSIGNED/DELIVERED render trip-only. Fixes the earlier selector bug
// (the metric-rail "ALL" card collided with the "ALL/ASSET/AGGREGATE" supply
// filter pill, which is also literally "ALL" and always first in DOM order).
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';

async function dismissReminder(page) {
  const remindLater = page.getByText('Remind me later', { exact: true }).first();
  if (await remindLater.isVisible({ timeout: 1500 }).catch(() => false)) {
    await remindLater.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function waitReady(page) {
  await page.getByText('Active', { exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(600);
}

// The rail's ALL card is the one whose "Active" subtitle sits directly below it —
// unambiguous, unlike the bare word "All" which also matches the supply-filter pill.
async function clickRailCard(page, subtitleText) {
  const card = page.getByText(subtitleText, { exact: true }).first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.click({ force: true });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  if (!page.url().includes('/trips')) {
    await page.goto(`${BASE}/trips`, { waitUntil: 'load', timeout: 90000 });
  }
  await waitReady(page);
  await dismissReminder(page);
  console.log('ready at', page.url());

  console.log('clicking ALL rail card (via "Active" subtitle)...');
  await clickRailCard(page, 'Active');
  await page.waitForTimeout(2500);
  await dismissReminder(page);
  await page.screenshot({ path: `${OUT}/confirm-01-all.png`, fullPage: true, timeout: 60000 });
  const allText = await page.locator('body').innerText();
  console.log('ALL: "Your active indents" section present:', allText.includes('Your active indents'));
  console.log('ALL: "AWARDED" pill present (indent card):', /\bAWARDED\b/.test(allText));
  console.log('ALL: trip-table/card markers present (Route/GOD684):', /GOD684|Route/.test(allText));

  console.log('clicking UNASSIGNED rail card...');
  await clickRailCard(page, 'No driver on trip');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/confirm-02-unassigned.png`, fullPage: true, timeout: 60000 });
  const unassignedText = await page.locator('body').innerText();
  console.log('UNASSIGNED: "Your active indents" present (should be false):', unassignedText.includes('Your active indents'));

  console.log('clicking DELIVERED rail card...');
  await clickRailCard(page, 'Delivered · docs pending');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/confirm-03-delivered.png`, fullPage: true, timeout: 60000 });

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
