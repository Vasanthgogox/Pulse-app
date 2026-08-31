import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/admin_console_shots';
const log = (m) => console.log(`[s2qa] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await page.goto('http://localhost:3002', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1000);

  log('clicking Support tab');
  await page.getByText('Support', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/10-support-inbox.png` });

  log('clicking SUP-000001');
  const row = page.locator('text=/SUP-000001/').first();
  await row.click().catch(() => log('WARNING: could not click SUP-000001 row'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/11-ticket-workspace.png` });

  log('typing a reply');
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('S2 QA: this is a test reply from the Admin Console.');
  await page.screenshot({ path: `${OUT}/12-reply-composer-filled.png` });
  await page.getByText('Send reply', { exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/13-after-agent-reply.png` });

  log('switching to internal note mode');
  await page.getByText('Internal note', { exact: true }).first().click();
  await page.waitForTimeout(300);
  await textarea.click();
  await textarea.fill('S2 QA: internal-only note, should never show to the user.');
  await page.screenshot({ path: `${OUT}/14-internal-note-composer.png` });
  await page.getByText('Add internal note', { exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/15-after-internal-note.png` });

  log('opening priority dropdown');
  await page.getByText('Medium', { exact: true }).first().click().catch(() => log('WARNING: priority select not opened by label'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/16-priority-dropdown-open.png` });
  await page.getByText('High', { exact: true }).last().click().catch(() => log('WARNING: could not pick High'));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/17-after-priority-change.png` });

  log('opening status dropdown');
  await page.getByText('Open', { exact: true }).last().click().catch(() => log('WARNING: status select not opened'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/18-status-dropdown-open.png` });
  await page.getByText('In Progress', { exact: true }).last().click().catch(() => log('WARNING: could not pick In Progress'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/19-after-status-change.png` });

  log('reverting priority/status back to original test-ticket state');
  await page.getByText('High', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText('Medium', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.getByText('In Progress', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText('Open', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/20-restored-state.png` });

  log('search test');
  const search = page.locator('input[placeholder*="SUP-"]');
  await search.fill('SUP-000001');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/21-search-filtered.png` });
  await search.fill('zzz-nonexistent');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/22-search-empty-state.png` });
  await search.fill('');

  log('status filter test (Closed, expect empty)');
  await page.getByText(/^Closed ·/).click().catch(() => log('WARNING: closed filter not found'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/23-status-filter-closed-empty.png` });

  log('DONE');
  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[s2qa] FAIL:', err.message);
  process.exit(1);
});
