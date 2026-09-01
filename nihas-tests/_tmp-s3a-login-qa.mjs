import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/s3a_shots';
const log = (m) => console.log(`[s3a] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  log('loading analytics console with no session (fresh context, no storage)');
  await page.goto('http://localhost:3002/ops-9f3a2c/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/01-signed-out-should-be-login.png` });

  const hasLoginHeading = await page.getByText('Admin Console — sign in', { exact: true }).count();
  const hasEmailField = await page.locator('#admin-email').count();
  const hasPasswordField = await page.locator('#admin-password').count();
  const hasAnyPanelChrome = await page.getByText('Org & User Management', { exact: false }).count();
  log(`login heading present: ${hasLoginHeading > 0}`);
  log(`email field present: ${hasEmailField > 0}`);
  log(`password field present: ${hasPasswordField > 0}`);
  log(`console chrome leaked pre-login: ${hasAnyPanelChrome > 0}`);

  log('attempting sign-in with target bootstrap email + a dummy password (expected to fail — no password set on this account)');
  await page.fill('#admin-email', 'vasanth.raj@gogox.com');
  await page.fill('#admin-password', 'dummy-test-password-not-real');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/02-signin-attempt-result.png` });
  const errorText = await page.locator('.text-destructive').first().textContent().catch(() => null);
  log(`error shown after sign-in attempt: ${errorText ?? '(none found)'}`);

  await browser.close();
  log('DONE');
}

main().catch((err) => {
  console.error('[s3a] FAIL:', err.message);
  process.exit(1);
});
