#!/usr/bin/env node
// A10.2 smoke test: verify the new marketplace-test-payment edge function's
// plumbing (auth, validation, RLS-scoped lookups) WITHOUT touching any real
// IND021 bid. Uses a random non-existent bidId, so every call should fail
// cleanly with 'not_found' or a validation error, never actually mutate
// anything.
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';
import fs from 'node:fs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const FN_URL = 'https://nafxpivddesgsrthmosv.supabase.co/functions/v1/marketplace-test-payment';
const ANON_KEY = fs.readFileSync('.env', 'utf8')
  .split('\n').find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='))?.split('=')[1]?.trim();

const log = (m) => console.log(`[smoke] ${m}`);

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
  await page.waitForTimeout(1500);
  log('signed in');

  // Test 1: no auth header at all -> expect 401.
  const noAuth = await page.evaluate(async (url) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', bidId: 'x', provider: 'cash' }),
    });
    return { status: res.status, body: await res.text() };
  }, FN_URL);
  log(`Test 1 (no auth): status=${noAuth.status} body=${noAuth.body}`);

  // Test 2: valid auth, non-existent bidId -> expect 404 not_found (RLS-scoped lookup finds nothing).
  const sessionRaw = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('auth-token')) return localStorage.getItem(k);
    }
    return null;
  });
  const token = JSON.parse(sessionRaw).access_token;

  const fakeBid = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'create', bidId: '00000000-0000-0000-0000-000000000000', provider: 'cash' }),
    });
    return { status: res.status, body: await res.text() };
  }, { url: FN_URL, anon: ANON_KEY, token });
  log(`Test 2 (fake bidId): status=${fakeBid.status} body=${fakeBid.body}`);

  // Test 3: valid auth, invalid provider -> expect 400 invalid_provider.
  const badProvider = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'create', bidId: '00000000-0000-0000-0000-000000000000', provider: 'razorpay' }),
    });
    return { status: res.status, body: await res.text() };
  }, { url: FN_URL, anon: ANON_KEY, token });
  log(`Test 3 (disallowed provider): status=${badProvider.status} body=${badProvider.body}`);

  // Test 4: simulate action with no pending payment -> expect 404 not_found.
  const noAttempt = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'simulate', bidId: '00000000-0000-0000-0000-000000000000', outcome: 'paid' }),
    });
    return { status: res.status, body: await res.text() };
  }, { url: FN_URL, anon: ANON_KEY, token });
  log(`Test 4 (no attempt to simulate): status=${noAttempt.status} body=${noAttempt.body}`);

  await browser.close();
}
main();
