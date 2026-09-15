#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';
const PLAN_ID = '372aebc8-680f-48d7-bbde-6ba50c4c9dc5'; // EP-2026-0007

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

  await page.goto(`${APP}/oms/execution/plan/${PLAN_ID}`, { waitUntil: 'load', timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    const loading = await page.getByText('Loading workspace', { exact: false }).first().isVisible().catch(() => false);
    const loadingFulfillment = await page.getByText('Loading fulfillment', { exact: false }).first().isVisible().catch(() => false);
    if (!loading && !loadingFulfillment) break;
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1000);
  await shot(page, 'journey14-00-plan-page-loaded');

  // Click the "Indent" toggle (seen as a pill "Plan | Indent") to switch views in-app.
  const indentToggle = page.getByText('Indent', { exact: true }).first();
  const hasToggle = await indentToggle.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('Indent toggle visible:', hasToggle);
  if (hasToggle) {
    await indentToggle.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('url after Indent toggle:', page.url());
    await shot(page, 'journey14-01-indent-via-toggle');
  }

  const shareBtn = page.getByRole('button', { name: 'Share to Operations' }).first();
  await shareBtn.waitFor({ state: 'visible', timeout: 8000 });
  await shareBtn.click();
  await page.waitForTimeout(2000);
  await shot(page, 'journey14-02-after-share-click');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('after share click body:', bodyText.slice(0, 2000));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
