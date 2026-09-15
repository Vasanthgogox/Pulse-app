#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${APP}/sign-in`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('you@example.com').first().fill(EMAIL);
  await page.getByPlaceholder('Your password').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});

  await page.goto(`${APP}/oms/orders`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  const rowHtml = await page.locator('table tbody tr').first().innerHTML();
  console.log('=== ROW 0 HTML ===');
  console.log(rowHtml.slice(0, 2000));

  console.log('\n=== ELEMENTS CONTAINING "Build Plan" text ===');
  const els = await page.locator(':text("Build Plan")').all();
  for (const el of els) {
    const tag = await el.evaluate((n) => n.tagName);
    const cls = await el.evaluate((n) => n.className);
    const outer = await el.evaluate((n) => n.outerHTML.slice(0, 200));
    console.log(`<${tag} class="${cls}">`, outer);
  }

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
