#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';
const INDENT_ID = 'a1249087-8cb2-4f56-8ff5-067a70d462f7'; // IND047
const DRIVER_NAME = 'Ganesh';
const VEHICLE_CODE = 'GOD684-VEH-001';
const SHOT_DIR = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/2f454f79-3bde-4f31-bedf-f6c3c7c448e3/scratchpad';

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  await page.goto(`${APP}/oms/execution/indent/${INDENT_ID}`, { waitUntil: 'load', timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    const loading = await page.getByText('Loading workspace', { exact: false }).first().isVisible().catch(() => false);
    const loadingFulfillment = await page.getByText('Loading fulfillment', { exact: false }).first().isVisible().catch(() => false);
    if (!loading && !loadingFulfillment) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);
  await shot(page, 'asset-00-indent-loaded');

  const allocateNav = page.getByRole('link', { name: 'ASSET / MARKET' }).first();
  const hasAllocateNav = await allocateNav.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('ASSET / MARKET nav link visible:', hasAllocateNav);
  if (hasAllocateNav) {
    await allocateNav.click();
    await page.waitForTimeout(1500);
  }
  await shot(page, 'asset-00b-allocate-page');
  console.log('BODY after load:', (await page.locator('body').innerText().catch(() => '')).slice(0, 1200));

  const assetTab = page.getByRole('button', { name: 'Asset', exact: true }).first();
  const hasAsset = await assetTab.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Asset tab visible:', hasAsset);
  if (!hasAsset) { await browser.close(); return; }
  await assetTab.click();
  await page.waitForTimeout(1000);

  const driverSelect = page.locator('select').filter({ has: page.locator(`option:has-text("${DRIVER_NAME}")`) }).first();
  const hasDriverOption = await driverSelect.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Driver select with', DRIVER_NAME, 'visible:', hasDriverOption);
  if (hasDriverOption) await driverSelect.selectOption({ label: DRIVER_NAME });

  const vehicleSelect = page.locator('select').filter({ has: page.locator(`option:has-text("${VEHICLE_CODE}")`) }).first();
  const hasVehicleOption = await vehicleSelect.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Vehicle select with', VEHICLE_CODE, 'visible:', hasVehicleOption);
  if (hasVehicleOption) await vehicleSelect.selectOption({ label: VEHICLE_CODE });

  await shot(page, 'asset-01-selected');

  const createBtn = page.getByRole('button', { name: 'Create trip', exact: true }).first();
  const hasCreate = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Create trip button visible:', hasCreate);
  if (!hasCreate) { await browser.close(); return; }
  await createBtn.click();
  await page.waitForTimeout(3000);
  await shot(page, 'asset-02-after-create');
  console.log('BODY after Create trip:', (await page.locator('body').innerText().catch(() => '')).slice(0, 1200));
  console.log('URL after Create trip:', page.url());

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
