#!/usr/bin/env node
import { chromium } from 'playwright';

const APP = 'http://localhost:8081';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/3fa56c9e-c811-4f44-bc3a-b1b68b1011ee/scratchpad/shots';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${APP}/onboarding/business`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/onboarding-business-check.png`, fullPage: true, timeout: 60000 });

  console.log('=== ERRORS ===');
  console.log([...new Set(errors)].filter(e => /OrganizationProvider|useOrganization/.test(e)).join('\n') || '(none matching OrganizationProvider)');
  console.log('\n=== ALL ERRORS (first 10) ===');
  console.log([...new Set(errors)].slice(0, 10).join('\n'));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
