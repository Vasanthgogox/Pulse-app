import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/s3a_shots';
const log = (m) => console.log(`[s3a-google] ${m}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3002/ops-9f3a2c/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/03-login-with-google-button.png` });

  const hasGoogleButton = await page.getByText('Continue with Google', { exact: true }).count();
  log(`google button present: ${hasGoogleButton > 0}`);

  log('clicking Continue with Google, watching for navigation target');
  const navPromise = page.waitForURL(/./, { timeout: 8000 }).catch(() => null);
  await page.getByText('Continue with Google', { exact: true }).click();
  await navPromise;
  await page.waitForTimeout(1500);
  const finalUrl = page.url();
  log(`landed on: ${finalUrl}`);
  await page.screenshot({ path: `${OUT}/04-after-google-click.png` });

  await browser.close();
  log('DONE');
}

main().catch((err) => {
  console.error('[s3a-google] FAIL:', err.message);
  process.exit(1);
});
