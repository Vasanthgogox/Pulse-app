#!/usr/bin/env node
// A10.1 Step 5 PAUSE — read-only investigation of the Marketplace fee
// config discrepancy. Calls the authoritative, already-granted-to-
// `authenticated` calculate_marketplace_platform_fee() RPC directly via the
// REST endpoint, reusing an already-authenticated session's own JWT (no
// escalated/service-role credentials). Read-only: this RPC is STABLE,
// documented as preview-only, and mutates nothing.
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';
import fs from 'node:fs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const SUPABASE_URL = 'https://nafxpivddesgsrthmosv.supabase.co';
const ANON_KEY = fs.readFileSync('.env', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='))
  ?.split('=')[1]
  ?.trim();

const log = (m) => console.log(`[fee-investigation] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log(`signed in as Godrej India, url=${page.url()}`);

  // Find the Supabase auth token in localStorage (sb-<ref>-auth-token).
  const localStorageDump = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('auth-token')) out[key] = localStorage.getItem(key);
    }
    return out;
  });
  const keys = Object.keys(localStorageDump);
  log(`auth-token keys found: ${JSON.stringify(keys)}`);
  if (keys.length === 0) { await browser.close(); return; }

  const sessionRaw = localStorageDump[keys[0]];
  const session = JSON.parse(sessionRaw);
  const accessToken = session.access_token;
  log(`got access token: ${accessToken ? 'yes (len=' + accessToken.length + ')' : 'NO'}`);

  // Call the read-only, authenticated-granted RPC directly via REST.
  const result = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(`${url}/rest/v1/rpc/calculate_marketplace_platform_fee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ p_bid_amount: 36500 }),
    });
    const status = res.status;
    const body = await res.text();
    return { status, body };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token: accessToken });

  log(`RPC status: ${result.status}`);
  log(`RPC body: ${result.body}`);

  await browser.close();
}
main();
