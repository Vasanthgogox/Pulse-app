#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  await page.goto(`${APP}/oms/orders`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  const rowsBefore = await page.locator('table tbody tr').count();
  console.log('rows before selecting:', rowsBefore);

  const cb0 = page.locator('table tbody tr').nth(0).getByRole('checkbox', { name: 'Select row' });
  await cb0.check({ force: true });
  await page.waitForTimeout(1000);

  const rowsAfter = await page.locator('table tbody tr').count();
  console.log('rows after selecting row 0:', rowsAfter);
  await page.screenshot({ path: `${OUT}/dom-probe2-after-row0.png`, fullPage: true });

  for (let i = 0; i < rowsAfter; i++) {
    const txt = await page.locator('table tbody tr').nth(i).innerText().catch((e) => `ERR: ${e.message}`);
    console.log(`row ${i}:`, txt.replace(/\n/g, ' | ').slice(0, 100));
  }

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
