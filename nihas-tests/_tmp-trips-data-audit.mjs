#!/usr/bin/env node
// Data-populated acceptance + DB query efficiency audit for Trips INDENT lifecycle.
// Read-only: signs in to an existing, already-populated QA org (Godrej India),
// navigates/clicks only. No writes, no service_role, no schema changes.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';

let phase = 'boot';
const reqLog = [];
const realtimeEvents = [];
const consoleAll = [];
const pending = new Map();

async function dismissReminder(page) {
  const remindLater = page.getByText('Remind me later', { exact: true }).first();
  if (await remindLater.isVisible({ timeout: 1500 }).catch(() => false)) {
    await remindLater.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

let sawBuildError = false;

async function waitReady(page) {
  const t0 = Date.now();
  // Playwright's own waitFor polls continuously with actionability checks —
  // far more robust against a fading/rotating loading splash than a manual
  // isVisible() snapshot loop, which can catch the splash mid-fade and
  // falsely report "gone".
  const ok = await page
    .getByText('ALL', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 90000 })
    .then(() => true)
    .catch(() => false);
  console.log(`  waitReady: ${ok ? 'ALL chip visible' : 'gave up waiting for ALL chip'} after ${Date.now() - t0}ms`);
  await page.waitForTimeout(800);
}

async function clickChip(page, label) {
  await waitReady(page);
  await page.keyboard.press('Escape').catch(() => {});
  await dismissReminder(page);
  const chip = page.getByText(new RegExp(`^${label}\\b`, 'i')).first();
  try {
    await chip.click({ timeout: 6000 });
    return true;
  } catch {
    try {
      await chip.click({ timeout: 4000, force: true });
      return true;
    } catch (e2) {
      console.log(`${label} click failed even with force:`, e2.message.split('\n')[0]);
      return false;
    }
  }
}

function classify(url) {
  if (url.includes('/rest/v1/rpc/')) return 'rpc';
  if (url.includes('/rest/v1/')) return 'rest';
  if (url.includes('/auth/v1/')) return 'auth';
  if (url.includes('/realtime/')) return 'realtime-ws';
  return 'other-supabase';
}

async function settle(page, ms = 2000) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (m) => {
    const text = `[${m.type()}] ${m.text()}`;
    consoleAll.push(text);
    if (text.includes('[realtime]')) realtimeEvents.push(`${phase} :: ${text}`);
  });
  page.on('pageerror', (e) => {
    consoleAll.push(`pageerror: ${e.message}`);
    if (/SyntaxError|TransformError|Unable to resolve module/.test(e.message)) {
      sawBuildError = true;
    }
  });

  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('supabase.co')) return;
    pending.set(req, Date.now());
  });
  page.on('requestfinished', async (req) => {
    const url = req.url();
    if (!url.includes('supabase.co')) return;
    const start = pending.get(req);
    const res = await req.response().catch(() => null);
    reqLog.push({
      phase,
      method: req.method(),
      url,
      status: res ? res.status() : null,
      ms: start ? Date.now() - start : null,
    });
    pending.delete(req);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.includes('supabase.co')) return;
    reqLog.push({ phase, method: req.method(), url, status: 'FAILED', ms: null });
  });

  phase = 'sign-in';
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await waitReady(page);
  await dismissReminder(page);
  console.log('signed in, url=', page.url());

  phase = 'trips-initial-load';
  reqLog.length = 0; // reset — only count from here
  if (!page.url().includes('/trips')) {
    await page.goto(`${BASE}/trips`, { waitUntil: 'load', timeout: 90000 });
  } else {
    await page.reload({ waitUntil: 'load', timeout: 90000 });
  }
  await waitReady(page);
  await dismissReminder(page);
  await settle(page, 2500);
  await page.screenshot({ path: `${OUT}/audit-01-trips-initial.png`, fullPage: true, timeout: 60000 });
  const initialLoadCount = reqLog.length;
  console.log(`[${phase}] supabase requests: ${initialLoadCount}`);
  if (sawBuildError) {
    console.log('\n!!! BUILD ERROR DETECTED DURING LOAD — aborting run, results below this point are unreliable !!!');
    console.log(consoleAll.filter((c) => c.startsWith('pageerror')).slice(0, 3).join('\n'));
    await browser.close();
    process.exit(2);
  }

  phase = 'click-indent';
  const beforeIndent = reqLog.length;
  await clickChip(page, "Indent");
  await settle(page, 2500);
  await page.screenshot({ path: `${OUT}/audit-02-indent.png`, fullPage: true, timeout: 60000 });
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeIndent}`);
  const indentBodyText = await page.locator('body').innerText();
  console.log('  awarded chip visible in INDENT view:', /awarded/i.test(indentBodyText));

  phase = 'click-all';
  const beforeAll = reqLog.length;
  await clickChip(page, "All");
  await settle(page, 2500);
  await page.screenshot({ path: `${OUT}/audit-03-all.png`, fullPage: true, timeout: 60000 });
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeAll}`);
  const allBodyText = await page.locator('body').innerText();
  console.log('  "Your active indents" (indent card section) visible in ALL:', allBodyText.includes('Your active indents'));

  phase = 'click-unassigned';
  const beforeUnassigned = reqLog.length;
  await clickChip(page, "Unassigned");
  await settle(page, 2000);
  await page.screenshot({ path: `${OUT}/audit-04-unassigned.png`, fullPage: true, timeout: 60000 });
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeUnassigned}`);
  const unassignedBodyText = await page.locator('body').innerText();
  console.log('  "Your active indents" visible in UNASSIGNED (should be false):', unassignedBodyText.includes('Your active indents'));

  phase = 'click-assigned';
  const beforeAssigned = reqLog.length;
  await clickChip(page, "Assigned");
  await settle(page, 2000);
  await page.screenshot({ path: `${OUT}/audit-05-assigned.png`, fullPage: true, timeout: 60000 });
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeAssigned}`);

  phase = 'click-loading';
  const beforeLoading = reqLog.length;
  await clickChip(page, "Loading");
  await settle(page, 2000);
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeLoading}`);

  phase = 'click-unloading';
  const beforeUnloading = reqLog.length;
  await clickChip(page, "Unloading");
  await settle(page, 2000);
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeUnloading}`);
  await page.screenshot({ path: `${OUT}/audit-06-unloading.png`, fullPage: true, timeout: 60000 });

  phase = 'click-delivered';
  const beforeDelivered = reqLog.length;
  await clickChip(page, "Delivered");
  await settle(page, 2000);
  await page.screenshot({ path: `${OUT}/audit-07-delivered.png`, fullPage: true, timeout: 60000 });
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeDelivered}`);

  phase = 'back-to-all-recheck';
  const beforeAllAgain = reqLog.length;
  await clickChip(page, "All");
  await settle(page, 2500);
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeAllAgain}`);

  phase = 'search-typing';
  const beforeSearch = reqLog.length;
  const search = page.getByPlaceholder(/search/i).first();
  const hasSearch = await search.isVisible().catch(() => false);
  if (hasSearch) {
    await search.click().catch(() => {});
    await search.type('a', { delay: 100 }).catch(() => {});
    await settle(page, 1500);
  }
  console.log(`[${phase}] supabase requests: ${reqLog.length - beforeSearch} (search box found: ${hasSearch})`);

  console.log('\n=== FULL REQUEST LOG (phase | method | status | ms | url) ===');
  for (const r of reqLog) {
    console.log(`${r.phase} | ${r.method} | ${r.status} | ${r.ms}ms | ${r.url}`);
  }

  console.log('\n=== REALTIME CHANNEL EVENTS ===');
  console.log(realtimeEvents.join('\n'));

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(consoleAll.filter((c) => c.startsWith('[error]') || c.startsWith('pageerror')).join('\n'));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
