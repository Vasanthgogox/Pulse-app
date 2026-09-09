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
  await page.goto(`${BASE}/pulse-loads`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const anchor = page.getByText('SpaceXLogistics', { exact: true }).first();
  await anchor.waitFor({ state: 'visible', timeout: 20000 });
  await anchor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  // Viewport (not fullPage) screenshot -- coordinates map 1:1 to what we'll click.
  await page.screenshot({ path: `${OUT}/coord-viewport.png`, fullPage: false });
  const box = await anchor.boundingBox();
  console.log('SpaceXLogistics box:', JSON.stringify(box));
  // Keep the page open by writing session state -- we can't persist across
  // processes, so instead: print the box, then in a SEPARATE immediate step
  // click a coordinate offset from it (Review sits ~140px below, right side).
  if (box) {
    const clickX = 345;
    const clickY = box.y + 204;
    console.log(`computed click target: (${clickX}, ${clickY})`);
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/coord-after-click.png`, fullPage: false });
    const hubVisible = await page.getByText('REVIEW HUB', { exact: true }).first().isVisible().catch(() => false);
    console.log('REVIEW HUB visible after coord click:', hubVisible);
  }
  await browser.close();
})();
