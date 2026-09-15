#!/usr/bin/env node
// Order duplicate/re-planning safety — real browser acceptance journey.
// Creates 2 real [Pending Consolidation] sales orders via the product's own
// "Create order" form (no synthetic DB rows), then drives Orders -> Build Plan
// -> Convert to Indent -> back to Orders -> Plan History.
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

  const createdOrderNumbers = [];
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Create order' }).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Create sales order' }).first().click();
    await page.waitForTimeout(2000);
    await shot(page, `journey-01-created-${i}`);
  }

  // Identify the two newest orders (top of the default-sorted list = most recent).
  await page.waitForTimeout(1000);
  const rows = page.locator('table tbody tr');
  const rowCount = await rows.count();
  console.log('order rows visible:', rowCount);
  const firstTwoOrderTexts = [];
  for (let i = 0; i < Math.min(2, rowCount); i++) {
    const t = await rows.nth(i).innerText();
    firstTwoOrderTexts.push(t.split('\n')[1] || t.split('\n')[0]);
    console.log(`row ${i}:`, t.replace(/\n/g, ' | '));
  }

  console.log('selecting the first two rows checkboxes...');
  for (let i = 0; i < 2; i++) {
    await rows.nth(i).locator('input[type="checkbox"], [role="checkbox"]').first().click({ force: true });
    await page.waitForTimeout(300);
  }
  await shot(page, 'journey-02-selected');

  await page.getByRole('button', { name: 'Build Plan' }).first().click();
  await page.waitForTimeout(2500);
  console.log('url after Build Plan:', page.url());
  await shot(page, 'journey-03-build-plan-page');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('build plan page body snippet:', bodyText.slice(0, 1200));

  await browser.close();
  console.log('CREATED_ORDERS:', JSON.stringify(firstTwoOrderTexts));
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
