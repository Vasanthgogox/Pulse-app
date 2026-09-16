#!/usr/bin/env node
// Phase 1 forensic capture (direct-URL variant): log in, then navigate straight
// to a known Client Detail URL, isolating ITS OWN mount-time request waterfall
// from Finance-tab-wide bootstrap noise (Network/Trips/Marketplace prefetching
// all racing for the same connections on a full Finance-tab visit).
import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';

const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const CLIENT_ID = process.argv[2] || '89d21711-109b-4bbd-81f9-4da510dd43ae'; // "Apple", Godrej India org

const log = (m) => console.log(`[fin-waterfall] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('dialog', async (d) => { await d.dismiss().catch(() => {}); });

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.waitForTimeout(300);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForTimeout(6000);
  log(`post-submit url: ${page.url()}`);
  if (page.url().includes('sign-in')) {
    const errText = await page.locator('text=/invalid|incorrect|error/i').first().textContent().catch(() => null);
    log(`still on sign-in, visible error text: ${errText}`);
    await page.screenshot({ path: '/tmp/login-debug.png', fullPage: true }).catch(() => {});
    await browser.close();
    return;
  }

  // Visit a cheap authenticated route first so session machinery is warm
  // before we measure — isolates ClientDetail's OWN cost from cold-start auth.
  await page.goto(`${BASE}/(tabs)/finance`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  log(`warm-up route url: ${page.url()}`);

  // ---- Capture window starts here ----
  const requests = [];
  const t0 = Date.now();
  const onReq = (req) => {
    const url = req.url();
    if (!url.startsWith(BASE) && !url.includes('supabase')) return;
    requests.push({ url, method: req.method(), start: Date.now() - t0, end: null, status: null, req });
  };
  const onDone = (res) => {
    const req = res.request();
    const entry = requests.find((r) => r.req === req && r.end == null);
    if (entry) { entry.end = Date.now() - t0; entry.status = res.status(); }
  };
  page.on('request', onReq);
  page.on('response', onDone);

  await page.goto(`${BASE}/client/${CLIENT_ID}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  log(`navigated directly to /client/${CLIENT_ID}`);

  // Poll for first useful paint: the client's name text appearing anywhere.
  const firstPaintDeadline = Date.now() + 30_000;
  let firstPaintMs = null;
  while (Date.now() < firstPaintDeadline) {
    const hasHeader = await page.locator('text=/Apple/i').first().isVisible().catch(() => false);
    if (hasHeader) { firstPaintMs = Date.now() - t0; break; }
    await page.waitForTimeout(200);
  }
  log(`first useful paint: ${firstPaintMs}ms`);

  await page.waitForTimeout(10000); // let remaining hydration settle
  const settledMs = Date.now() - t0;

  page.off('request', onReq);
  page.off('response', onDone);

  console.log('=== REQUESTS (relative ms from direct navigation) ===');
  for (const r of requests) {
    const dur = r.end != null ? r.end - r.start : null;
    console.log(`${String(r.start).padStart(6)}ms -> ${r.end != null ? String(r.end).padStart(6) + 'ms' : '  (pending)'}  [${dur ?? '?'}ms]  ${r.status ?? '?'}  ${r.method} ${r.url.replace(BASE, '').split('?')[0]}`);
  }
  console.log(`Total requests captured: ${requests.length}`);
  console.log(`First useful paint (client name visible): ${firstPaintMs}ms`);
  console.log(`Measurement window closed at: ${settledMs}ms`);

  await page.screenshot({ path: '/tmp/client-detail-debug.png', fullPage: true }).catch(() => {});
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
