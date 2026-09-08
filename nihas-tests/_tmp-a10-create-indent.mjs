#!/usr/bin/env node
// A10.1 Step 2: create one fresh Marketplace-circulated indent as the
// "GODREJ INDIA" business account (explicit user override after the
// nihas-logs/godrej mismatch), for controlled A10 discovery/bid testing.
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';

const log = (m) => console.log(`[a10-indent] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  page.on('pageerror', (e) => log(`PAGE ERROR: ${e.message}`));

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  log(`post-signin url: ${page.url()}`);

  await page.goto(`${BASE}/create-indent`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (page.url().includes('sign-in')) {
    log('bounced back to sign-in, retrying navigation once more');
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}/create-indent`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: `${OUT}/a10-60-client-step.png`, fullPage: true });
  log(`create-indent url: ${page.url()}`);

  const clientRow = page.getByText('SpaceXLogistics', { exact: true }).first();
  await clientRow.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(500);
  let priceVisible = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    await clientRow.click();
    await page.waitForTimeout(1000);
    priceVisible = await page.getByText('Billing SpaceXLogistics', { exact: false }).first().isVisible().catch(() => false);
    if (priceVisible) break;
    log(`client selection attempt ${attempt + 1} did not stick, retrying`);
    await page.waitForTimeout(500);
  }
  if (!priceVisible) throw new Error('client selection never stuck after 10 attempts');
  await page.screenshot({ path: `${OUT}/a10-60b-client-selected.png`, fullPage: true });

  // Client price: ₹45,000 via the on-screen decimal keypad.
  const key4 = page.getByLabel('Key 4', { exact: true }).first();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await key4.isVisible().catch(() => false)) break;
    await page.waitForTimeout(1000);
  }
  for (const d of '45000') {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-60c-price-entered.png`, fullPage: true });

  const continueBtn1 = page.getByRole('button', { name: 'Continue', exact: true }).first();
  await continueBtn1.waitFor({ state: 'visible', timeout: 10_000 });
  const enabled = await continueBtn1.isEnabled().catch(() => false);
  log(`continue enabled after client select: ${enabled}`);
  if (!enabled) throw new Error('client step continue never enabled');
  await continueBtn1.click();
  const tomorrowChip = page.getByText('Tomorrow', { exact: true }).first();
  await tomorrowChip.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-61-route-step.png`, fullPage: true });

  // Route step: Tomorrow, free-text pickup/drop (no geocode pick needed).
  await tomorrowChip.click();
  await page.waitForTimeout(500);
  await page.getByText('Search or pick pickup location', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText('Chennai', { exact: false }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/a10-62b-pickup-set.png`, fullPage: true });

  await page.getByText('Search or pick drop location', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText('Bengaluru', { exact: false }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/a10-62c-drop-set.png`, fullPage: true });

  const continueBtn2 = page.getByRole('button', { name: 'Continue', exact: true }).first();
  await continueBtn2.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < 6; i++) {
    if (await continueBtn2.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  const routeEnabled = await continueBtn2.isEnabled().catch(() => false);
  log(`continue enabled after route fill: ${routeEnabled}`);
  if (!routeEnabled) throw new Error('route step continue never enabled');
  await continueBtn2.click();
  const vehicleTypeField = page.getByText('Select vehicle type (optional)', { exact: true }).first();
  await vehicleTypeField.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-63-vehicle-step.png`, fullPage: true });

  // Load step: vehicle type, product type, tonnage via quick-pick chips.
  await vehicleTypeField.click();
  await page.waitForTimeout(800);
  await page.getByText('10 FT', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/a10-64b-vehicle-type-set.png`, fullPage: true });

  await page.getByText('Select product type (optional)', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText('FMCG', { exact: true }).first().click();
  await page.waitForTimeout(600);

  await page.getByText('10t', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-65-load-filled.png`, fullPage: true });

  const continueBtn3 = page.getByRole('button', { name: 'Continue', exact: true }).first();
  await continueBtn3.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < 6; i++) {
    if (await continueBtn3.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  const loadEnabled = await continueBtn3.isEnabled().catch(() => false);
  log(`continue enabled after load fill: ${loadEnabled}`);
  if (!loadEnabled) throw new Error('load step continue never enabled');
  await continueBtn3.click();
  const marginChip = page.getByText('15%', { exact: true }).first();
  await marginChip.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-66-prices-step.png`, fullPage: true });

  // Target step: margin 15% off the ₹45,000 client price -> supplier_target ~₹38,250.
  await marginChip.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/a10-67-target-set.png`, fullPage: true });

  const continueBtn4 = page.getByRole('button', { name: 'Continue', exact: true }).first();
  await continueBtn4.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < 6; i++) {
    if (await continueBtn4.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  const targetEnabled = await continueBtn4.isEnabled().catch(() => false);
  log(`continue enabled after target set: ${targetEnabled}`);
  if (!targetEnabled) throw new Error('target step continue never enabled');
  await continueBtn4.click();
  const marketplaceRadio = page.getByText('Marketplace', { exact: true }).first();
  await marketplaceRadio.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-68-share-step.png`, fullPage: true });

  await marketplaceRadio.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/a10-69-marketplace-selected.png`, fullPage: true });

  const shareBtn = page.getByRole('button', { name: 'Share it to marketplace', exact: true }).first();
  await shareBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await shareBtn.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/a10-70-confirm-modal.png`, fullPage: true });

  const shareNowBtn = page.getByRole('button', { name: /^Share now$|^Share \d+ now$/ }).first();
  await shareNowBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await shareNowBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/a10-71-published.png`, fullPage: true });
  log(`final url: ${page.url()}`);

  await browser.close();
}
main();
