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

  const cb1 = page.locator('table tbody tr').nth(1).getByRole('checkbox', { name: 'Select row' });
  const cnt = await cb1.count();
  console.log('row1 checkbox count (no prior click):', cnt);
  await cb1.check({ force: true, timeout: 8000 }).then(() => console.log('row1 check OK')).catch(e => console.log('row1 check FAILED:', e.message.split('\n')[0]));
  const checked = await cb1.getAttribute('aria-checked').catch(() => 'ERR');
  console.log('row1 aria-checked after:', checked);
  await browser.close();
})();
