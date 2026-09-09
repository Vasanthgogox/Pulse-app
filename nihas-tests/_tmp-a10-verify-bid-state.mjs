#!/usr/bin/env node
// A10.2 read-only state verification: read the DCO's own market_bids row
// directly (RLS-scoped to the bidder themselves), no UI, no mutation.
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

  const sessionRaw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('auth-token')) return localStorage.getItem(k);
    }
    return null;
  });
  const token = JSON.parse(sessionRaw).access_token;

  const result = await page.evaluate(async ({ url, anon, token, indentId }) => {
    const res = await fetch(
      `${url}/rest/v1/market_bids?indent_id=eq.${indentId}&select=id,indent_id,bidder_type,bidder_user_id,amount,status,fee_payment_status,platform_fee_amount,accepted_at`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` } }
    );
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token, indentId: BID_INDENT_ID });

  console.log('market_bids (DCO-visible rows):', result.status);
  console.log(result.body);

  const bidId = JSON.parse(result.body)[0]?.id;
  const feePayments = await page.evaluate(async ({ url, anon, token, bidId }) => {
    const res = await fetch(
      `${url}/rest/v1/marketplace_fee_payments?market_bid_id=eq.${bidId}&select=id,market_bid_id,provider,provider_order_id,amount,status,paid_at`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` } }
    );
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token, bidId });
  console.log('marketplace_fee_payments:', feePayments.status);
  console.log(feePayments.body);

  // Confirm no trip exists yet for this bid (trip creation blocked).
  const trips = await page.evaluate(async ({ url, anon, token, bidId }) => {
    const res = await fetch(
      `${url}/rest/v1/trips?source_market_bid_id=eq.${bidId}&select=id,status,client_price,driver_commission,platform_fee,source_market_bid_id`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` } }
    );
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token, bidId });
  console.log('trips (source_market_bid_id match):', trips.status);
  console.log(trips.body);

  await browser.close();
}
main();
