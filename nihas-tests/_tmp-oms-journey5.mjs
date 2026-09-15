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

// Selects by order-number text (re-queries fresh each time), not row index,
// since checking one row appears to trigger a re-render/reorder.
async function closeDrawerIfOpen(page) {
  const closeBtn = page.locator('button:has(svg)').filter({ hasText: '' });
  const drawerHeading = page.getByText('Order Details', { exact: true }).first();
  if (await drawerHeading.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('  (closed Order Details drawer)');
  }
}

async function selectOrderRow(page, orderNumber) {
  const row = page.locator('table tbody tr').filter({ hasText: orderNumber });
  await row.waitFor({ state: 'visible', timeout: 8000 });
  const cb = row.getByRole('checkbox', { name: 'Select row' });
  await cb.check({ timeout: 8000 });
  console.log(`checked ${orderNumber}`);
  await closeDrawerIfOpen(page);
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

  await selectOrderRow(page, 'SO-2026-00009');
  await page.waitForTimeout(600);
  await shot(page, 'journey5-00-after-first-check');
  console.log('table rows now:', await page.locator('table tbody tr').count());
  console.log('row texts:');
  const n = await page.locator('table tbody tr').count();
  for (let i = 0; i < n; i++) {
    console.log(' ', i, (await page.locator('table tbody tr').nth(i).innerText()).replace(/\n/g, '|').slice(0,80));
  }
  await selectOrderRow(page, 'SO-2026-00008');
  await page.waitForTimeout(600);

  await shot(page, 'journey5-01-selected');
  const summaryText = await page.locator('body').innerText();
  const selectedMatch = summaryText.match(/(\d+) selected · (\d+) ready to plan/);
  console.log('selection summary:', selectedMatch ? selectedMatch[0] : 'NOT FOUND');

  const links = page.getByRole('link', { name: 'Build Plan' });
  const count = await links.count();
  console.log('Build Plan link count:', count);
  await links.last().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  console.log('url after Build Plan:', page.url());
  await shot(page, 'journey5-02-plan-builder');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('plan builder body snippet:', bodyText.slice(0, 2000));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
