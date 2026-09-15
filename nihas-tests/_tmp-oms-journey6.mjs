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

async function closeDrawerIfOpen(page) {
  const drawerHeading = page.getByText('Order Details', { exact: true }).first();
  if (await drawerHeading.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

async function selectOrderRow(page, orderNumber) {
  const row = page.locator('table tbody tr').filter({ hasText: orderNumber });
  await row.waitFor({ state: 'visible', timeout: 8000 });
  await row.getByRole('checkbox', { name: 'Select row' }).check({ timeout: 8000 });
  await closeDrawerIfOpen(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

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
  await selectOrderRow(page, 'SO-2026-00008');
  await page.waitForTimeout(600);
  await page.getByRole('link', { name: 'Build Plan' }).last().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  console.log('at plan builder:', page.url());

  const convertBtn = page.getByRole('button', { name: 'Convert to Indent' }).first();
  await convertBtn.waitFor({ state: 'visible', timeout: 10000 });
  await convertBtn.click();
  await page.waitForTimeout(1500);
  await shot(page, 'journey6-00-confirm-dialog');

  // Modal confirm button — same accessible name as the page CTA; the modal's
  // own button renders last in DOM order (portal appended to body end).
  const allConvertBtns = page.getByRole('button', { name: 'Convert to Indent' });
  console.log('Convert to Indent button count with dialog open:', await allConvertBtns.count());
  const dialogConvertBtn = allConvertBtns.last();
  await dialogConvertBtn.waitFor({ state: 'visible', timeout: 8000 });
  await dialogConvertBtn.click();
  await page.waitForTimeout(3000);
  console.log('url after Convert to Indent:', page.url());
  await shot(page, 'journey6-01-after-convert');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('body after convert:', bodyText.slice(0, 2000));

  // Retry test: go back to the same plan (Plan History) and try converting again.
  await page.goto(`${APP}/oms/execution-plans`, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, 'journey6-02-plan-history');
  const historyText = await page.locator('body').innerText().catch(() => '');
  console.log('plan history body:', historyText.slice(0, 1500));

  console.log('\n=== CONSOLE ERRORS ===');
  console.log([...new Set(consoleErrors)].join('\n'));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
