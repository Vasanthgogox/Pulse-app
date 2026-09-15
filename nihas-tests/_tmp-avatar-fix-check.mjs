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
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  await page.goto(`${APP}/trips`, { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30; i++) {
    const ready = await page.getByText('Active', { exact: true }).first().isVisible().catch(() => false);
    if (ready) break;
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1000);

  const indentCard = page.getByText('Requirement not yet allocated to a trip', { exact: true }).first();
  await indentCard.waitFor({ state: 'visible', timeout: 15000 });
  await indentCard.click({ force: true });
  await page.waitForTimeout(1500);

  const thisMonth = page.getByText('THIS MONTH', { exact: true }).first();
  if (await thisMonth.isVisible({ timeout: 2000 }).catch(() => false)) {
    await thisMonth.click({ force: true });
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${OUT}/avatar-fix-check.png`, fullPage: true, timeout: 60000 });
  console.log('screenshot taken');

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
