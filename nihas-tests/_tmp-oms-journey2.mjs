#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 60000 });
  console.log(`[shot] ${name}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  await page.goto(`${APP}/oms/orders`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  const rows = page.locator('table tbody tr');
  await rows.first().waitFor({ state: 'visible', timeout: 15000 });

  // SO-2026-00009 and SO-2026-00008 are the two rows currently showing "Pending".
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i);
    const rowText = await row.innerText();
    console.log(`selecting row ${i}:`, rowText.replace(/\n/g, ' | '));
    const checkbox = row.locator('[role="checkbox"], input[type="checkbox"]').first();
    await checkbox.click({ force: true });
    await page.waitForTimeout(500);
  }
  await shot(page, 'journey2-01-selected');
  const summaryText = await page.locator('body').innerText();
  const selectedMatch = summaryText.match(/(\d+) selected · (\d+) ready to plan/);
  console.log('selection summary:', selectedMatch ? selectedMatch[0] : 'NOT FOUND');

  const buildPlanBtn = page.getByRole('button', { name: 'Build Plan' }).first();
  await buildPlanBtn.waitFor({ state: 'visible', timeout: 10000 });
  await buildPlanBtn.click();
  await page.waitForTimeout(2500);
  console.log('url after Build Plan:', page.url());
  await shot(page, 'journey2-02-plan-builder');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('plan builder body snippet:', bodyText.slice(0, 1500));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
