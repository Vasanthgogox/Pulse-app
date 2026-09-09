import { chromium } from 'playwright';
import { loadCredentials } from './credentials.mjs';
const { email: E2E_EMAIL, password: E2E_PASSWORD } = loadCredentials();
const BASE = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[type="email"]').first().fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.locator('[data-testid="signin-submit-btn"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // Confirm we're NOT mid-create-load (fresh session, should be fine) and check My Loads state directly.
  await page.goto(`${BASE}/pulse-loads`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/confirm-no-stray-load.png`, fullPage: true });
  await browser.close();
})();
