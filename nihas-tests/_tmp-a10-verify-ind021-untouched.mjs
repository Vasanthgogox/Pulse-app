import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';
const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  await page.goto('http://localhost:8081/sign-in', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.goto('http://localhost:8081/pulse-loads', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const search = page.locator('[role="button"]').filter({ has: page.locator('svg') }).last();
  // Use the search icon at top right of My Loads.
  await page.locator('svg').first();
  await page.getByRole('button').filter({ hasText: '' }).last().click().catch(() => {});
  // Simpler: use the search input if visible after tapping the magnifying glass icon.
  await page.waitForTimeout(500);
  const searchInput = page.getByPlaceholder(/search/i).first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('SpaceX');
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${OUT}/a10-final-search.png`, fullPage: true });

  const found = await page.getByText('SpaceXLogistics', { exact: true }).first().isVisible().catch(() => false);
  console.log('SpaceXLogistics found via search:', found);
  if (found) {
    await page.getByText('SpaceXLogistics', { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/a10-final-card.png`, fullPage: true });
  }
  await browser.close();
})();
