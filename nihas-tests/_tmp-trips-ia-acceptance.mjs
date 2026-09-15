#!/usr/bin/env node
// Read-only browser acceptance pass for the Trips IA (ALL/INDENT lifecycle) fix.
// Signs in as the existing A10 pilot org QA account (already used across prior
// A10/DCO-4 verification — not a fabricated identity) and only navigates/reads.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';
const EMAIL = 'a10.pilot.org@example.com';
const PASSWORD = 'A10PilotOrg#2026';

const consoleErrors = [];
const failedRequests = [];

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 60000 });
  console.log(`[shot] ${name}`);
}

async function dismissReminder(page) {
  const remindLater = page.getByText('Remind me later', { exact: true }).first();
  if (await remindLater.isVisible({ timeout: 1500 }).catch(() => false)) {
    await remindLater.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    console.log('  (dismissed "Get verified" modal via Remind me later)');
    return;
  }
  const closeX = page.locator('div:has-text("GET VERIFIED")').locator('..').getByRole('button').first();
  if (await closeX.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeX.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    console.log('  (dismissed "Get verified" modal via X)');
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} -- ${req.failure()?.errorText}`));
  page.on('response', (res) => { if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`); });

  console.log('=== SIGN IN ===');
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  const emailInput = page.getByPlaceholder('you@example.com').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(EMAIL);
  const passInput = page.getByPlaceholder('Your password').first();
  await passInput.fill(PASSWORD);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('signed in, url=', page.url());

  console.log('\n=== TRIPS PAGE ===');
  if (!page.url().includes('/trips')) {
    await page.goto(`${BASE}/trips`, { waitUntil: 'load', timeout: 90000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await dismissReminder(page);
  await shot(page, '01-trips-default');

  const addButtons = await page.getByText(/^\+?\s*Add/i).allTextContents();
  console.log('Add-button-like text nodes:', JSON.stringify(addButtons));

  const railText = await page.locator('body').innerText();
  const railOrderCandidates = ['ALL', 'INDENT', 'UNASSIGNED', 'ASSIGNED', 'LOADING', 'IN TRANSIT', 'UNLOADING', 'DELIVERED'];
  console.log('Rail chip presence:', railOrderCandidates.map((k) => `${k}:${railText.toUpperCase().includes(k)}`).join(' '));

  const stages = [
    ['indent', 'INDENT'],
    ['all', 'ALL'],
    ['unassigned', 'UNASSIGNED'],
    ['assigned', 'ASSIGNED'],
    ['loading', 'LOADING'],
    ['in_transit', 'IN TRANSIT'],
    ['unloading', 'UNLOADING'],
    ['delivered', 'DELIVERED'],
  ];

  for (const [slug, label] of stages) {
    console.log(`\n--- clicking stage: ${label} ---`);
    const chip = page.getByText(new RegExp(`^${label}\\b`, 'i')).first();
    const clicked = await chip.click({ timeout: 5000 }).then(() => true).catch((e) => { console.log('click failed:', e.message); return false; });
    if (!clicked) continue;
    await page.waitForTimeout(1800);
    await shot(page, `02-stage-${slug}`);
    const bodyText = await page.locator('body').innerText();
    console.log(`  contains 'TARGET RATE' (indent card marker): ${bodyText.includes('TARGET RATE')}`);
    console.log(`  contains 'AWARDED': ${bodyText.toUpperCase().includes('AWARDED')}`);
    console.log(`  contains 'Your active indents': ${bodyText.includes('Your active indents')}`);
    console.log(`  contains trip-table header 'Route' or 'Trip': ${bodyText.includes('Route') || bodyText.includes('Trip')}`);
  }

  console.log('\n=== LOADS (/pulse-loads) ===');
  await page.goto(`${BASE}/pulse-loads`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await dismissReminder(page);
  await shot(page, '03-pulse-loads');
  const loadsBodyText = await page.locator('body').innerText();
  console.log('Loads page mentions "My load":', loadsBodyText.includes('My load'));
  console.log('Loads page mentions "Get load":', loadsBodyText.includes('Get load'));
  console.log('Loads page mentions "Action required":', loadsBodyText.includes('Action required'));

  console.log('\n=== UNIFIED + ADD ===');
  await page.goto(`${BASE}/add-trip`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await dismissReminder(page);
  await shot(page, '04-add-trip-step1');
  console.log('add-trip first step text snapshot saved');

  console.log('\n=== BACK TO TRIPS: ALL scrolled full page ===');
  await page.goto(`${BASE}/trips`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await dismissReminder(page);
  const allChip = page.getByText(/^ALL\b/i).first();
  await allChip.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, '05-all-full');

  console.log('\n=== MOBILE VIEWPORT ===');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await dismissReminder(page);
  await shot(page, '06-mobile-trips-default');
  const mAllChip = page.getByText(/^ALL\b/i).first();
  await mAllChip.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '07-mobile-all');
  const mIndentChip = page.getByText(/^INDENT\b/i).first();
  await mIndentChip.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '08-mobile-indent');

  console.log('\n=== CONSOLE ERRORS (deduped, first 30) ===');
  console.log([...new Set(consoleErrors)].slice(0, 30).join('\n'));
  console.log('\n=== FAILED/4xx/5xx REQUESTS (deduped, first 30) ===');
  console.log([...new Set(failedRequests)].slice(0, 30).join('\n'));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
