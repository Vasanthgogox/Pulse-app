#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';
const PLAN_ID = '372aebc8-680f-48d7-bbde-6ba50c4c9dc5'; // EP-2026-0007 -> IND047, per peer session

async function main() {
  // Deliberately a brand-new context — empty localStorage, matching the
  // fresh-session/reload scenario where the bug reproduces.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  const localStorageState = await page.evaluate(() => ({ ...window.localStorage }));
  console.log('localStorage after fresh login (should have no pulse-commerce-plans-v1):', JSON.stringify(localStorageState));

  await page.goto(`${APP}/oms/execution/plan/${PLAN_ID}`, { waitUntil: 'load', timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    const loading = await page.getByText('Loading workspace', { exact: false }).first().isVisible().catch(() => false);
    const loadingFulfillment = await page.getByText('Loading fulfillment', { exact: false }).first().isVisible().catch(() => false);
    if (!loading && !loadingFulfillment) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);
  console.log('URL after nav+wait:', page.url());
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/2f454f79-3bde-4f31-bedf-f6c3c7c448e3/scratchpad/verify-share-01-loaded.png', fullPage: true }).catch(e => console.log('screenshot1 failed', e.message));
  console.log('BODY right after load:', (await page.locator('body').innerText().catch(() => '<no body>')).slice(0, 1000));

  const indentToggle = page.getByText('Indent', { exact: true }).first();
  if (await indentToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await indentToggle.click({ force: true });
    await page.waitForTimeout(1500);
  }

  const shareBtn = page.getByRole('button', { name: 'Share to Operations' }).first();
  const shareVisible = await shareBtn.isVisible({ timeout: 8000 }).catch(() => false);
  console.log('Share to Operations button visible:', shareVisible);
  if (!shareVisible) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('BODY (no share button found):', bodyText.slice(0, 1500));
    await browser.close();
    return;
  }

  await shareBtn.click();
  await page.waitForTimeout(2500);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('BODY after Share click:', bodyText.slice(0, 1500));
  console.log('URL after Share click:', page.url());

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
