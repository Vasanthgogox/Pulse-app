#!/usr/bin/env node
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const log = (m) => console.log(`[real-award3] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  page.on('dialog', async (d) => { log(`DIALOG: ${d.message()}`); await d.accept().catch(() => {}); });

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log(`signed in, url=${page.url()}`);

  await page.goto(`${BASE}/pulse-loads`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const anchor = page.getByText('SpaceXLogistics', { exact: true }).first();
  await anchor.waitFor({ state: 'visible', timeout: 15_000 });
  await anchor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const reviewBtn = page.locator(
    'xpath=//*[text()="SpaceXLogistics"]/following::*[contains(text(),"Review")][1]'
  ).first();
  await reviewBtn.click();
  log('clicked Review, waiting up to 40s for offers to load...');

  const loadingGone = await page.getByText('LOADING OFFERS', { exact: false }).first()
    .waitFor({ state: 'hidden', timeout: 40_000 }).then(() => true).catch(() => false);
  log(`loading spinner resolved: ${loadingGone}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-140-pre-award.png`, fullPage: true });

  const dcoAccept = page.locator(
    'xpath=//*[text()="Fleet owner (A10 Pilot DCO)"]/following::*[text()="Accept"][1]'
  ).first();
  await dcoAccept.waitFor({ state: 'visible', timeout: 15_000 });
  await dcoAccept.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/a10-141-award-confirm-prompt.png`, fullPage: true });

  const confirmAcceptBtn = page.getByText('Accept', { exact: true }).last();
  await confirmAcceptBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await confirmAcceptBtn.click();
  for (let i = 0; i < 8; i++) await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/a10-142-after-award.png`, fullPage: true });
  log(`url after award: ${page.url()}`);

  await browser.close();
}
main();
