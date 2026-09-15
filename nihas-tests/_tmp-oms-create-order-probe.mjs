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
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text()); });

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  await page.goto(`${APP}/oms/orders`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: 'Create order' }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/oms-create-01.png`, fullPage: true });
  console.log('url after Create order click:', page.url());
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('body:', bodyText.slice(0, 800));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
