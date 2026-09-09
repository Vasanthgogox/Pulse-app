#!/usr/bin/env node
// Read-only: check the A10 Pilot DCO's own dco_profiles/dco_payees rows via
// its own RLS-scoped session (self-read policy already confirmed to exist).
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:8081';
const PHONE = '9199990005';
const OTP = '4321';
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

  const dcoProfile = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(`${url}/rest/v1/dco_profiles?select=*`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token });
  console.log('dco_profiles (own row):', dcoProfile.status, dcoProfile.body);

  const dcoPayee = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(`${url}/rest/v1/dco_payees?select=*`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token });
  console.log('dco_payees (own row):', dcoPayee.status, dcoPayee.body);

  // Also check current profile role (must be 'driver' for request_dco_status to work).
  const profileRole = await page.evaluate(async ({ url, anon, token }) => {
    const res = await fetch(`${url}/rest/v1/profiles?select=id,role&id=eq.f3beccae-b47e-4be8-989b-23fc3c78e209`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.text() };
  }, { url: SUPABASE_URL, anon: ANON_KEY, token });
  console.log('profiles.role:', profileRole.status, profileRole.body);

  await browser.close();
}
main();
