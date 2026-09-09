#!/usr/bin/env node
// A10.2 read-only verification: does the DCO's phone show unmasked now that
// fee_payment_status=paid, via the same RPC the business Review Hub calls?
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';
import fs from 'node:fs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const SUPABASE_URL = 'https://nafxpivddesgsrthmosv.supabase.co';
const ANON_KEY = fs.readFileSync('.env', 'utf8')
  .split('\n').find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='))?.split('=')[1]?.trim();
const INDENT_ID = 'ecf7a13d-7fc5-4e66-80bf-9b6551966f0b';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const sessionRaw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('auth-token')) return localStorage.getItem(k);
    }
    return null;
  });
  const token = JSON.parse(sessionRaw).access_token;

  const result = await page.evaluate(async ({ url, anon, token, indentId }) => {
    const res = await fetch(`${url}/rest/v1/rpc/list_market_bids_for_indent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_indent_id: indentId }),
    });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token, indentId: INDENT_ID });

  console.log('list_market_bids_for_indent:', result.status);
  console.log(result.body);

  await browser.close();
}
main();
