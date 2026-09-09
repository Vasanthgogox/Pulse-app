#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const PHONE = '9199990005';
const OTP = '4321';

async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split('')) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(delayMs);
  }
}
async function clearDigits(page, maxTaps) {
  const del = page.getByLabel('Delete last digit', { exact: true }).first();
  for (let i = 0; i < maxTaps; i++) { await del.click().catch(() => {}); await page.waitForTimeout(60); }
}
async function tapDigits(page, digits, { verify } = {}) {
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    if (await verify().catch(() => false)) return;
    await clearDigits(page, digits.length + 2);
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const failedBodies = [];
  page.on('response', async (r) => {
    if (r.status() >= 400) {
      let body = '';
      try { body = await r.text(); } catch {}
      failedBodies.push(`${r.status()} ${r.url()}\n  body: ${body}`);
    }
  });

  await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await tapDigits(page, PHONE, { verify: () => page.getByText('919 999 0005', { exact: false }).first().isVisible() });
  await page.getByText('Send OTP', { exact: false }).first().click();
  await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
  await page.getByText('Verify OTP', { exact: false }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/available-loads/ecf7a13d-7fc5-4e66-80bf-9b6551966f0b`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/a10-162-current-state.png`, fullPage: true });

  console.log('--- failed responses (400+) ---');
  console.log(failedBodies.join('\n---\n') || '(none this load)');

  await browser.close();
}
main();
