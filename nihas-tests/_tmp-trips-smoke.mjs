#!/usr/bin/env node
// Basic post-reconciliation smoke check: /trips bundles, +Add visible,
// INDENT/UNASSIGNED chips visible, no Metro 500 / missing-module error.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';
const EMAIL = 'a10.pilot.org@example.com';
const PASSWORD = 'A10PilotOrg#2026';

const consoleErrors = [];
const failedRequests = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const allConsole = [];
  page.on('console', (m) => { allConsole.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('response', (res) => { if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`); });

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (!page.url().includes('/trips')) {
    await page.goto(`${BASE}/trips`, { waitUntil: 'load', timeout: 90000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  for (let i = 0; i < 20; i++) {
    const spinner = await page.getByText('This usually takes just a moment', { exact: false }).first().isVisible().catch(() => false);
    if (!spinner) break;
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(2000);

  const remindLater = page.getByText('Remind me later', { exact: true }).first();
  if (await remindLater.isVisible({ timeout: 1500 }).catch(() => false)) {
    await remindLater.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${OUT}/smoke-01-trips.png`, fullPage: true, timeout: 60000 });
  const bodyText = await page.locator('body').innerText();
  console.log('URL:', page.url());
  console.log('Has "+ Add"/"Add" button text:', /\bAdd\b/.test(bodyText));
  console.log('Has ALL chip:', /\bAll\b/i.test(bodyText));
  console.log('Has INDENT chip:', /\bIndent\b/i.test(bodyText));
  console.log('Has UNASSIGNED chip:', /\bUnassigned\b/i.test(bodyText));
  console.log('Mentions TripsIndentsPanel error:', bodyText.includes('TripsIndentsPanel'));

  console.log('\n=== ALL CONSOLE (last 40) ===');
  console.log(allConsole.slice(-40).join('\n'));
  console.log('\n=== CONSOLE ERRORS (deduped) ===');
  console.log([...new Set(consoleErrors)].slice(0, 20).join('\n'));
  console.log('\n=== 4xx/5xx RESPONSES (deduped) ===');
  console.log([...new Set(failedRequests)].slice(0, 20).join('\n'));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
