import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/admin_console_shots';
const log = (m) => console.log(`[polish] ${m}`);

async function shotAtWidth(browser, width, height, label) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('http://localhost:3002', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.getByText('Support', { exact: true }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/${label}-inbox.png` });
  await page.locator('text=/SUP-000001/').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/${label}-workspace.png` });
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  log('checking selected-value clarity on priority/status triggers');
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://localhost:3002', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.getByText('Support', { exact: true }).first().click();
  await page.waitForTimeout(1000);
  await page.locator('text=/SUP-000001/').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/30-workspace-with-labels.png` });

  // Open the priority dropdown by its trigger (now labelled), check the open state.
  await page.locator('button[role="combobox"]').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/31-priority-dropdown-labelled-open.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Context chip check
  await page.screenshot({ path: `${OUT}/32-context-chips-resolved.png` });
  await page.close();

  log('responsive check: 1280x800 (narrower)');
  await shotAtWidth(browser, 1280, 800, '40-narrow');

  log('responsive check: 1920x1080 (wider)');
  await shotAtWidth(browser, 1920, 1080, '41-wide');

  log('DONE');
  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[polish] FAIL:', err.message);
  process.exit(1);
});
