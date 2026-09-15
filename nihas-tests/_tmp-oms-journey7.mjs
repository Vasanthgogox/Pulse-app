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

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  await page.goto(`${APP}/oms/orders`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, 'journey7-01-orders-after-convert');

  const row9 = page.locator('table tbody tr').filter({ hasText: 'SO-2026-00009' });
  const row8 = page.locator('table tbody tr').filter({ hasText: 'SO-2026-00008' });
  console.log('SO-2026-00009 row text:', (await row9.innerText()).replace(/\n/g, ' | '));
  console.log('SO-2026-00008 row text:', (await row8.innerText()).replace(/\n/g, ' | '));

  const cb9 = row9.getByRole('checkbox', { name: 'Select row' });
  const cb9Disabled = await cb9.isDisabled().catch(() => 'ERR');
  console.log('SO-2026-00009 checkbox disabled:', cb9Disabled);

  // Try to select it anyway and see what the UI does.
  await cb9.click({ force: true }).catch((e) => console.log('click failed:', e.message.split('\n')[0]));
  await page.waitForTimeout(800);
  const summaryText = await page.locator('body').innerText();
  const selectedMatch = summaryText.match(/(\d+) selected · (\d+) ready to plan/);
  console.log('selection summary after trying to select a Planned order:', selectedMatch ? selectedMatch[0] : 'NOT FOUND (good, no selection UI or unaffected)');
  await shot(page, 'journey7-02-tried-select-planned');

  // Refresh and re-check persistence.
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot(page, 'journey7-03-after-refresh');
  console.log('SO-2026-00009 row text after refresh:', (await row9.innerText()).replace(/\n/g, ' | '));
  console.log('SO-2026-00008 row text after refresh:', (await row8.innerText()).replace(/\n/g, ' | '));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
