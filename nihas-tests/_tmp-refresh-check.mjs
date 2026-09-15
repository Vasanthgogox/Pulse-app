import { chromium } from 'playwright';
const APP = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill('godrej@gmail.com');
  await page.getByPlaceholder('Your password').first().fill('godrej123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.goto(`${APP}/oms/orders`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  for (let i = 0; i < 15; i++) {
    const stillLoading = await page.getByText('Loading workspace', { exact: false }).first().isVisible().catch(() => false);
    if (!stillLoading) { console.log(`settled after ~${i*2}s`); break; }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1000);
  const row9 = page.locator('table tbody tr').filter({ hasText: 'SO-2026-00009' });
  const row8 = page.locator('table tbody tr').filter({ hasText: 'SO-2026-00008' });
  console.log('SO-2026-00009 after refresh:', (await row9.innerText().catch(e=>'ERR:'+e.message)).replace(/\n/g,' | '));
  console.log('SO-2026-00008 after refresh:', (await row8.innerText().catch(e=>'ERR:'+e.message)).replace(/\n/g,' | '));
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots/refresh-check.png', fullPage: true });
  await browser.close();
})();
