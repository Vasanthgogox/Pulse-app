#!/usr/bin/env node
// Screenshot Trips + Load Center cards at tablet widths (the 768-1023 band that
// falls between the phone hub list and the >=1024 desktop grid).
// Run: node nihas-tests/tablet-cards-screenshot.mjs [tag]

import http from 'node:http';
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PAGE_TIMEOUT = 600_000;
const TAG = process.argv[2] ?? 'before';
const WIDTHS = (process.argv[3] ?? '768,820,900,1000')
  .split(',')
  .map((w) => Number(w.trim()))
  .filter((w) => w > 0);
const OUT_DIR = 'nihas-tests/screenshots';

const log = (m) => console.log(`[tablet] ${m}`);

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

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: PAGE_TIMEOUT });
  const email = page.locator('input[type="email"]').first();
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ state: 'visible', timeout: 120_000 });
  // Typing before the controlled inputs hydrate gets reset back to empty state.
  await page.waitForTimeout(5000);

  const typeInto = async (field, value) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await field.click();
      await field.type(value, { delay: 20 });
      await page.waitForTimeout(400);
      if ((await field.inputValue()) === value) return;
      await field.fill('');
      await page.waitForTimeout(800);
    }
    throw new Error('value would not stick in sign-in field');
  };

  await typeInto(email, 'nihas@gmail.com');
  await typeInto(password, 'nihas123');
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page
    .waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 180_000 })
    .catch(() => log('WARN: still on sign-in after submit'));
  await page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT }).catch(() => {});
  log(`signed in — at ${page.url()}`);
}

/** "Trip awarded to you" action-required cards stack over the hub and hide the list. */
async function dismissActionRequired(page) {
  for (let i = 0; i < 6; i += 1) {
    const later = page.getByText('Later', { exact: true }).first();
    if (!(await later.isVisible().catch(() => false))) return;
    await later.click().catch(() => {});
    await page.waitForTimeout(900);
  }
}

/** Widest right edge of any card in the list, to spot cards overflowing the canvas. */
async function measureCards(page) {
  return page.evaluate(() => {
    const texts = [...document.querySelectorAll('*')].filter((el) =>
      /^DEMO\d+/.test((el.textContent ?? '').trim()),
    );
    const cards = texts
      .map((el) => {
        let node = el;
        for (let i = 0; i < 8 && node?.parentElement; i += 1) node = node.parentElement;
        return node;
      })
      .filter(Boolean)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      });
    return { viewport: window.innerWidth, cards: cards.slice(0, 3) };
  });
}

async function shoot(page, route, marker, label) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: PAGE_TIMEOUT }).catch(() => {});
  await page
    .getByText(marker, { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 120_000 })
    .catch(() => log(`WARN: marker "${marker}" not visible on ${route}`));
  await dismissActionRequired(page);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(1500);
    await dismissActionRequired(page);
    const file = `${OUT_DIR}/${label}-${TAG}-${width}.png`;
    await page.screenshot({ path: file });
    const m = await measureCards(page).catch(() => null);
    log(`${file} ${m ? JSON.stringify(m) : ''}`);
  }
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`pageerror: ${e.message}`));

  await signIn(page);
  await shoot(page, '/trips', 'ADD TRIP', 'trips');
  if (process.env.SKIP_LOADS !== '1') {
    await shoot(page, '/pulse-loads', 'Give load', 'loads');
  }

  await browser.close();
  log('DONE');
}

main().catch((err) => {
  console.error(`[tablet] FAIL: ${err.message}`);
  process.exit(1);
});
