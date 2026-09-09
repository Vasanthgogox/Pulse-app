#!/usr/bin/env node
// A10/DCO-4 Phase 2 verification, org-side supplement: confirm the competing
// Fleet Org bid on IND021 is still 'rejected' using the existing dedicated
// QA business login (already used earlier this session, not a new identity).
// Read-only table select only — no RPC calls, no mutation.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { loadCredentials } from './credentials.mjs';

const BASE = 'http://localhost:8081';
const BID_INDENT_ID = 'ecf7a13d-7fc5-4e66-80bf-9b6551966f0b';
const ANON_KEY = fs.readFileSync('.env', 'utf8')
  .split('\n').find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='))?.split('=')[1]?.trim();
const SUPABASE_URL = 'https://nafxpivddesgsrthmosv.supabase.co';

async function main() {
  const { email, password } = loadCredentials();
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log('signed in (org side), url=', page.url());

  const sessionRaw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('auth-token')) return localStorage.getItem(k);
    }
    return null;
  });
  const token = JSON.parse(sessionRaw).access_token;

  const bids = await page.evaluate(async ({ url, anon, token, indentId }) => {
    const res = await fetch(
      `${url}/rest/v1/market_bids?indent_id=eq.${indentId}&select=id,bidder_type,amount,status,fee_payment_status`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` } }
    );
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token, indentId: BID_INDENT_ID });
  console.log('market_bids for IND021 (org-side RLS view):', bids.status);
  console.log(bids.body);

  await browser.close();
}
main();
