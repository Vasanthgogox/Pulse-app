#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';
const INDENT_ID = 'a1249087-8cb2-4f56-8ff5-067a70d462f7'; // IND047

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

  await page.goto(`${APP}/oms/execution/indent/${INDENT_ID}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: 'Share to Operations' }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, 'journey12-00-share-dialog');
  let bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('after Share to Operations click:', bodyText.slice(0, 1500));

  // If a confirm dialog appeared, look for a confirm button inside it.
  const confirmBtn = page.getByRole('button', { name: /Share|Confirm|Yes/ }).last();
  const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('has a follow-up confirm button:', hasConfirm);
  if (hasConfirm) {
    await confirmBtn.click();
    await page.waitForTimeout(2000);
    await shot(page, 'journey12-01-after-confirm');
    bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('after confirm:', bodyText.slice(0, 1500));
  }

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
