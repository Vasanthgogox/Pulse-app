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
  await page.goto('http://localhost:8081/pulse-loads', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/a10-73-pulse-loads.png`, fullPage: true });

  // Confirm Godrej India (the owning org) does NOT see its own load as an
  // external Find-Loads opportunity.
  await page.getByText('Find Loads', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/a10-75-godrej-find-loads.png`, fullPage: true });
  const selfListed = await page.getByText('SpaceXLogistics', { exact: true }).first().isVisible().catch(() => false);
  console.log('Godrej sees its own SpaceXLogistics load in Find Loads:', selfListed);

  await browser.close();
})();
