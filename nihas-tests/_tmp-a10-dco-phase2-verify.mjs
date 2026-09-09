#!/usr/bin/env node
// A10/DCO-4 Phase 2 post-approval verification: read-only, RLS-scoped to the
// DCO's own session (self-read policies). No mutation, no re-award, no
// approval/reject calls, no service-role usage.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:8081';
const PHONE = '9199990005';
const OTP = '4321';
const BID_INDENT_ID = 'ecf7a13d-7fc5-4e66-80bf-9b6551966f0b';
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

async function get(page, path) {
  return page.evaluate(async ({ url, anon, token, path }) => {
    const res = await fetch(`${url}${path}`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token: global.__token, path });
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
  global.__token = token;

  console.log('\n=== 1. dco_profiles (own row, self-read RLS) ===');
  const dcoProfile = await get(page, `/rest/v1/dco_profiles?select=*`);
  console.log(dcoProfile.status, dcoProfile.body);

  console.log('\n=== 2. dco_payees (own row, self-read RLS) ===');
  const dcoPayee = await get(page, `/rest/v1/dco_payees?select=*`);
  console.log(dcoPayee.status, dcoPayee.body);

  console.log('\n=== 3. is_dco_eligible / get_dco_payee_id — direct RPC attempt (expected to be denied; revoked from authenticated) ===');
  const eligibility = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(`${url}/rest/v1/rpc/is_dco_eligible`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token });
  console.log(eligibility.status, eligibility.body);

  console.log('\n=== 4. Marketplace access — list_open_marketplace_loads_for_fleet_owner (read-only RPC, no bid created) ===');
  const marketAccess = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(`${url}/rest/v1/rpc/list_open_marketplace_loads_for_fleet_owner`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_limit: 5 }),
    });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token });
  console.log(marketAccess.status, marketAccess.body);

  console.log('\n=== 5a. market_bids for IND021 (RLS-scoped view) ===');
  const bids = await get(page, `/rest/v1/market_bids?indent_id=eq.${BID_INDENT_ID}&select=id,indent_id,bidder_type,bidder_user_id,amount,status,fee_payment_status,platform_fee_amount,accepted_at`);
  console.log(bids.status, bids.body);

  const bidId = JSON.parse(bids.body)[0]?.id;
  console.log('\n=== 5b. marketplace_fee_payments for that bid ===');
  const feePayments = await get(page, `/rest/v1/marketplace_fee_payments?market_bid_id=eq.${bidId}&select=id,market_bid_id,provider,provider_order_id,amount,status,paid_at`);
  console.log(feePayments.status, feePayments.body);

  console.log('\n=== 5c. trips for that source_market_bid_id (expect empty) ===');
  const trips = await get(page, `/rest/v1/trips?source_market_bid_id=eq.${bidId}&select=id,status,client_price,driver_commission,platform_fee,source_market_bid_id`);
  console.log(trips.status, trips.body);

  await browser.close();
}
main();
