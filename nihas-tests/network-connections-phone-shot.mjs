#!/usr/bin/env node
// Screenshot the Network tab "Your connections" card at phone widths.
// Reuses the dev server on :8081 and the same test credentials as signin-flow.mjs.
// Run: node nihas-tests/network-connections-phone-shot.mjs

import http from 'node:http';
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PAGE_TIMEOUT = 600_000;
const WIDTHS = [390, 414];
const OUT_DIR = 'nihas-tests/screenshots';

const log = (m) => console.log(`[shot] ${m}`);

function ping(path, timeout) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    try {
      const s = await ping('/', 3000);
      if (s && s < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('dev server not ready on :8081');
}

async function main() {
  await waitForServer();
  log('server up');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`pageerror: ${e.message}`));

  log('opening /sign-in (first bundle compile is slow)...');
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: PAGE_TIMEOUT });

  const email = page.locator('input[type="email"]').first();
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ state: 'visible', timeout: 120_000 });

  const typeInto = async (field, value) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (await field.isEditable().catch(() => false)) {
        await field.click();
        await field.fill('');
        await field.type(value, { delay: 20 });
        if ((await field.inputValue()) === value) return;
      }
      await page.waitForTimeout(1000);
    }
    throw new Error('could not enter value into field (still disabled?)');
  };

  await typeInto(email, 'nihas@gmail.com');
  await typeInto(password, 'nihas123');

  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page
    .waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 180_000 })
    .catch(() => log('WARN: still on sign-in after submit'));
  await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
  log(`after submit — at ${page.url()}`);

  await page.goto(`${BASE}/network`, { waitUntil: 'load', timeout: PAGE_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(4000);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(1500);

    const marker = page.getByText('Your connections', { exact: false }).first();
    const found = await marker
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    log(`${width}px "Your connections" visible: ${found}`);
    await marker.scrollIntoViewIfNeeded().catch(() => {});
    // Wait for the pager to appear so tiles are rendered, not the loading state.
    await page
      .getByText('NEXT', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => log(`WARN: ${width}px pager not visible (still loading?)`));
    await page.waitForTimeout(1500);

    const file = `${OUT_DIR}/network-connections-phone-${width}.png`;
    await page.screenshot({ path: file });
    log(`wrote ${file}`);

    // Measure horizontal gaps: viewport edge -> card edge -> first tile edge.
    const geo = await page.evaluate(() => {
      const label = [...document.querySelectorAll('div,span')].find(
        (el) => el.textContent?.trim() === 'Your connections',
      );
      if (!label) return { error: 'label not found' };
      const out = [];
      let node = label;
      for (let i = 0; i < 12 && node; i += 1) {
        const r = node.getBoundingClientRect();
        const cs = getComputedStyle(node);
        out.push({
          depth: i,
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          marginLeft: cs.marginLeft,
          paddingLeft: cs.paddingLeft,
          borderRadius: cs.borderTopLeftRadius,
          borderLeftWidth: cs.borderLeftWidth,
        });
        node = node.parentElement;
      }
      return { viewport: window.innerWidth, chain: out };
    });
    log(`${width}px geometry: ${JSON.stringify(geo, null, 2)}`);
  }

  await browser.close();
  log('DONE');
}

main().catch((err) => {
  console.error(`[shot] FAIL: ${err.message}`);
  process.exit(1);
});
