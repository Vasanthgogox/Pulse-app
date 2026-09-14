#!/usr/bin/env node
// READ-ONLY verification of the DriverJobCard mode-router architecture.
// Single pass, single navigation per step, no repeated opens, no data mutation
// beyond normal driver read navigation. Throwaway diagnostic script, not committed.

import { chromium } from 'playwright';
import fs from 'fs';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PAGE_TIMEOUT = 120_000;
const PHONE = '9008008008';
const OTP = '2204';
const SCREEN_DIR = 'nihas-tests/screenshots';
fs.mkdirSync(SCREEN_DIR, { recursive: true });

const events = [];
const RPC_OF_INTEREST = [
  'get_driver_trip_stop_orders',
  'stop_execution_state',
  'trips_driver_view',
  'get_pending_otp_trips',
  'is_driver_available',
  'auth/v1/token',
  'auth/v1/user',
];

function nowIso() { return new Date().toISOString(); }
function log(m) { const line = `[${nowIso()}] ${m}`; console.log(line); events.push({ t: Date.now(), kind: 'log', msg: m }); }

function classify(url) {
  for (const needle of RPC_OF_INTEREST) {
    if (url.includes(needle)) return needle;
  }
  if (url.includes('/rest/v1/') || url.includes('/auth/v1/') || url.includes('/rest-admin/')) return 'other-supabase';
  return null;
}

async function currentDigits(page) {
  const all = await page.locator('[aria-label]').all();
  let best = '';
  for (const el of all) {
    const label = await el.getAttribute('aria-label').catch(() => null);
    if (label && /^[\d\s]+$/.test(label)) {
      const norm = label.replace(/\s+/g, '');
      if (norm.length > best.length) best = norm;
    }
  }
  return best;
}

async function tapDigits(page, digits) {
  let expected = '';
  for (const d of digits) {
    expected += d;
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      await page.getByLabel(`Key ${d}`, { exact: true }).click();
      await page.waitForTimeout(350);
      const cur = await currentDigits(page);
      if (cur === expected) ok = true;
    }
    if (!ok) log(`WARNING: could not confirm digit tap "${d}" (expected cumulative "${expected}", got "${await currentDigits(page)}")`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();

  page.on('console', (m) => {
    const t = m.text();
    events.push({ t: Date.now(), kind: 'console', level: m.type(), text: t });
    if (/error/i.test(m.type()) || /\[AuthGuard\]/.test(t)) log(`CONSOLE[${m.type()}]: ${t}`);
  });
  page.on('pageerror', (err) => {
    events.push({ t: Date.now(), kind: 'pageerror', text: String(err) });
    log(`PAGEERROR: ${err}`);
  });
  page.on('request', (req) => {
    const c = classify(req.url());
    if (c) events.push({ t: Date.now(), kind: 'request', tag: c, method: req.method(), url: req.url() });
  });
  page.on('response', async (res) => {
    const c = classify(res.url());
    if (c) {
      events.push({ t: Date.now(), kind: 'response', tag: c, status: res.status(), url: res.url() });
      if (res.status() >= 400) log(`HTTP ${res.status()} ${c} ${res.url()}`);
    }
  });
  page.on('requestfailed', (req) => {
    const c = classify(req.url());
    events.push({ t: Date.now(), kind: 'requestfailed', tag: c || 'other', url: req.url(), failure: req.failure()?.errorText });
    log(`REQUEST FAILED: ${req.url()} — ${req.failure()?.errorText}`);
  });

  const shot = async (name) => page.screenshot({ path: `${SCREEN_DIR}/${name}.png` }).catch(() => {});

  try {
    log('=== SIGN IN ===');
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: PAGE_TIMEOUT });
    await page.waitForTimeout(1500);
    await tapDigits(page, PHONE);
    await page.waitForTimeout(300);
    await shot('00-phone-entered');
    const phoneDigitsSeen = await page.evaluate(() => document.body.innerText).catch(() => '');
    log(`phone step body text snippet: ${phoneDigitsSeen.split('\n').filter(l => /\d/.test(l)).join(' | ')}`);
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.waitForTimeout(2000);
    await shot('00a-after-send-otp');
    await page.getByText('Verification Code', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 20_000 }).catch(() => log('WARN: no Verification Code label seen'));
    await tapDigits(page, OTP);
    await page.waitForTimeout(300);
    await shot('00b-otp-entered');
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 20_000 }).catch(() => log('WARN: still on sign-in'));
    await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`signed in — at ${page.url()}`);

    log('=== TEST 1: DRIVER HOME STARTUP ===');
    const homeMarker = events.length;
    await page.waitForTimeout(4000);
    await shot('01-home-settled');
    log(`Home URL: ${page.url()}`);

    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    fs.writeFileSync(`${SCREEN_DIR}/01-home-bodytext.txt`, bodyText);

    const healthBefore = await page.evaluate(() => {
      try {
        return window.__PLATFORM_HEALTH__ ? window.__PLATFORM_HEALTH__() : null;
      } catch (e) { return { error: String(e) }; }
    }).catch((e) => ({ error: String(e) }));
    log(`PLATFORM_HEALTH before opening any card: ${JSON.stringify(healthBefore?.channels ?? healthBefore)}`);

    const hasDeliveryMission = await page.getByText('Delivery Mission', { exact: false }).first().isVisible().catch(() => false);
    const hasArrive = await page.getByText(/Arrive/i).first().isVisible().catch(() => false);
    const hasCompleteStop = await page.getByText(/Complete Stop/i).first().isVisible().catch(() => false);
    const hasPickup = await page.getByText(/Pickup/i).first().isVisible().catch(() => false);
    log(`visible markers on Home: DeliveryMissionCTA=${hasDeliveryMission} Arrive=${hasArrive} CompleteStop=${hasCompleteStop} Pickup=${hasPickup}`);

    const rpcCallsDuringHome = events.slice(homeMarker).filter(e => e.kind === 'request');
    log(`requests fired during Home settle: ${JSON.stringify(rpcCallsDuringHome.map(e => e.tag))}`);

    const healthAfter = await page.evaluate(() => {
      try {
        return window.__PLATFORM_HEALTH__ ? window.__PLATFORM_HEALTH__() : null;
      } catch (e) { return { error: String(e) }; }
    }).catch((e) => ({ error: String(e) }));
    log(`PLATFORM_HEALTH after Home settle (no card opened yet): ${JSON.stringify(healthAfter?.channels ?? healthAfter)}`);

    fs.writeFileSync(`${SCREEN_DIR}/events.json`, JSON.stringify(events, null, 2));
    log(`wrote ${SCREEN_DIR}/events.json (${events.length} events)`);

    await browser.close();
    process.exit(0);
  } catch (err) {
    log(`FAIL: ${err.message}`);
    await shot('ERROR');
    fs.writeFileSync(`${SCREEN_DIR}/events.json`, JSON.stringify(events, null, 2));
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
