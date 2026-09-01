#!/usr/bin/env node
// Read-only RLS isolation check for Support S1, using the REAL driver test
// account's authenticated session hitting PostgREST directly (respects RLS,
// unlike `supabase db query --linked` which always connects as `postgres`
// with BYPASSRLS=true). No writes anywhere.
import { chromium } from 'playwright';
import fs from 'node:fs';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9008008008';
const OTP = '2204';
const TICKET_ID = '3d53918c-db14-47b9-9f74-189a9dbdd275'; // SUP-000001

// Same .env this app itself loads — anon key is public by design.
const envText = fs.readFileSync('.env', 'utf8');
const urlLine = envText.split('\n').find((l) => /^EXPO_PUBLIC_SUPABASE_URL=/.test(l));
const keyLine = envText.split('\n').find((l) => /^EXPO_PUBLIC_SUPABASE_ANON_KEY=/.test(l));
const SUPABASE_URL = urlLine.split('=')[1].trim();
const ANON_KEY = keyLine.split('=')[1].trim();

const log = (m) => console.log(`[rls] ${m}`);

async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split('')) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(delayMs);
  }
}
async function tapDigits(page, digits, { verify } = {}) {
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    const ok = await verify().catch(() => false);
    if (ok) return;
    const del = page.getByLabel('Delete last digit', { exact: true }).first();
    for (let i = 0; i < digits.length + 2; i++) { await del.click().catch(() => {}); await page.waitForTimeout(60); }
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1500);
    await tapDigits(page, PHONE, { verify: () => page.getByText('900 800 8008', { exact: false }).first().isVisible() });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`signed in as driver test account — at ${page.url()}`);

    // Extract the real access token from this real authenticated session.
    const accessToken = await page.evaluate(() => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          try {
            const parsed = JSON.parse(window.localStorage.getItem(key));
            return parsed?.access_token ?? null;
          } catch {
            return null;
          }
        }
      }
      return null;
    });

    if (!accessToken) {
      log('FAILED: could not extract a session access_token from localStorage');
      await browser.close();
      process.exit(1);
    }
    log(`extracted a real session access_token (len=${accessToken.length})`);

    // Hit PostgREST directly with this real token — this path DOES enforce RLS.
    const result = await page.evaluate(
      async ({ url, anonKey, token, ticketId }) => {
        const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
        const [ticketRes, commentsRes, whoAmI] = await Promise.all([
          fetch(`${url}/rest/v1/support_tickets?id=eq.${ticketId}&select=id,display_id`, { headers }).then((r) => r.json()),
          fetch(`${url}/rest/v1/support_ticket_comments?ticket_id=eq.${ticketId}&select=id`, { headers }).then((r) => r.json()),
          fetch(`${url}/auth/v1/user`, { headers }).then((r) => r.json()),
        ]);
        return { ticketRes, commentsRes, callerUid: whoAmI?.id ?? null };
      },
      { url: SUPABASE_URL, anonKey: ANON_KEY, token: accessToken, ticketId: TICKET_ID },
    );

    log(`caller uid (driver test account): ${result.callerUid}`);
    log(`ticket rows visible to this different real user: ${JSON.stringify(result.ticketRes)}`);
    log(`comment rows visible to this different real user: ${JSON.stringify(result.commentsRes)}`);

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error(`[rls] FAIL: ${err.message}`);
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
