import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/shots';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  const consoleMsgs = [];
  page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  await page.goto('http://localhost:8081/sign-in', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);

  const emailInput = page.getByPlaceholder('you@example.com').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill('a10.pilot.org@example.com');
  const passInput = page.getByPlaceholder('Your password').first();
  await passInput.fill('A10PilotOrg#2026');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/a10-41-org-signin-filled.png`, fullPage: true });

  const signInBtn = page.getByRole('button', { name: 'Sign in', exact: true }).first();
  await signInBtn.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/a10-42-org-after-signin.png`, fullPage: true });
  console.log('URL:', page.url());
  console.log(consoleMsgs.filter(m => m.includes('AuthGuard') || m.includes('org')).slice(-15).join('\n'));
  await browser.close();
})();
