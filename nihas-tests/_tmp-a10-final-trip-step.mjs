#!/usr/bin/env node
// A10 final step: resume the SAME awarded+paid IND021 DCO bid through the
// real product UI, letting the existing client-side effect in
// AvailableLoadDetailScreen call create_market_trip_after_fee_payment() once
// dco_payee_missing is resolved. No RPC called directly, no vehicle picker
// exists in this flow (owner_vehicle_id is fixed at bid-submission time per
// the DCO-4 contract) -- this script only navigates and reads.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
const PHONE = '9199990005';
const OTP = '4321';
const INDENT_ID = 'ecf7a13d-7fc5-4e66-80bf-9b6551966f0b';
const BID_ID = '51bc48f2-a75c-4624-811a-68b7bafabaf9';
const ANON_KEY = fs.readFileSync('.env', 'utf8')
  .split('\n').find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='))?.split('=')[1]?.trim();
const SUPABASE_URL = 'https://nafxpivddesgsrthmosv.supabase.co';

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
  console.log('signed in, url=', page.url());

  const sessionRaw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('auth-token')) return localStorage.getItem(k);
    }
    return null;
  });
  const token = JSON.parse(sessionRaw).access_token;
  const get = (path) => page.evaluate(async ({ url, anon, token, path }) => {
    const res = await fetch(`${url}${path}`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token, path });

  console.log('\n=== PRE-STATE: bid (owner_vehicle_id) ===');
  const preBid = await get(`/rest/v1/market_bids?id=eq.${BID_ID}&select=id,status,fee_payment_status,owner_vehicle_id`);
  console.log(preBid.status, preBid.body);
  const ovId = JSON.parse(preBid.body)[0]?.owner_vehicle_id;

  console.log('\n=== PRE-STATE: owner_vehicles row for that id ===');
  const preVehicle = await get(`/rest/v1/owner_vehicles?id=eq.${ovId}&select=id,vehicle_number,vehicle_type,status`);
  console.log(preVehicle.status, preVehicle.body);

  console.log('\n=== PRE-STATE: trips for this bid (expect empty) ===');
  const preTrips = await get(`/rest/v1/trips?source_market_bid_id=eq.${BID_ID}&select=id`);
  console.log(preTrips.status, preTrips.body);

  console.log('\n--- Navigating to the awarded load detail screen to let the existing client effect fire ---');
  await page.goto(`${BASE}/available-loads/${INDENT_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/a10-final-01-load-detail.png`, fullPage: true });
  // Give the useEffect + RPC round trip extra time.
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/a10-final-02-after-effect.png`, fullPage: true });
  console.log('post-navigation url:', page.url());

  console.log('\n=== POST-STATE: trips for this bid ===');
  const postTrips = await get(`/rest/v1/trips?source_market_bid_id=eq.${BID_ID}&select=*`);
  console.log(postTrips.status, postTrips.body);

  console.log('\n--- Reloading once more to check idempotency (no duplicate trip) ---');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/a10-final-03-after-reload.png`, fullPage: true });

  console.log('\n=== POST-RELOAD: trips for this bid (must still be exactly 1) ===');
  const postTrips2 = await get(`/rest/v1/trips?source_market_bid_id=eq.${BID_ID}&select=id,status`);
  console.log(postTrips2.status, postTrips2.body);

  console.log('\n=== market_bids row after trip creation (bidder-visible) ===');
  const postBid = await get(`/rest/v1/market_bids?id=eq.${BID_ID}&select=id,status,fee_payment_status`);
  console.log(postBid.status, postBid.body);

  await browser.close();
}
main();
