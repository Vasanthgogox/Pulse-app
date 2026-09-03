#!/usr/bin/env node
// Follow-up for Check 3: correct URL this time (no "(driver)" group segment in
// the actual resolved path — confirmed from run.mjs's Check-4 navigation which
// landed on http://localhost:8081/available-loads/<id>, not /(driver)/available-loads/<id>).
import { chromium } from 'playwright';

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const PHONE = '9000000002';
const OTP = '1234';
const TARGET_INDENT = '1e822cca-bc4a-4fbc-8b63-519a7d723ca8';
const OUT = '/private/tmp/claude-501/-Users-ggx-Desktop-Pulse-app/aa0cd08c-fbaa-43db-a775-ddb930ada764/scratchpad/a64_ui_verification';

const log = (m) => console.log(`[a64-qa-c3] ${m}`);

async function tapDigitsOnce(page, digits, delayMs) {
  for (const d of digits.split('')) {
    await page.getByLabel(`Key ${d}`, { exact: true }).first().click();
    await page.waitForTimeout(delayMs);
  }
}
async function tapDigits(page, digits, { verify } = {}) {
  await page.getByLabel(`Key ${digits[0]}`, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await tapDigitsOnce(page, digits, attempt === 1 ? 150 : 350);
    if (!verify) return;
    const ok = await verify().catch(() => false);
    if (ok) return;
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/driver-sign-in`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(1200);
    await tapDigits(page, PHONE, { verify: () => page.getByText('900 000 0002', { exact: false }).first().isVisible() });
    await page.getByText('Send OTP', { exact: false }).first().click();
    await page.getByText('Verification Code', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    await tapDigits(page, OTP, { verify: () => page.getByText('Verify OTP', { exact: false }).first().isEnabled() });
    await page.getByText('Verify OTP', { exact: false }).first().click();
    await page.waitForURL((u) => !u.pathname.includes('driver-sign-in'), { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    log(`signed in — at ${page.url()}`);

    log('visiting target indent detail page with corrected URL');
    await page.goto(`${BASE}/available-loads/${TARGET_INDENT}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/31b-target-indent-detail-correct-url.png`, fullPage: true });
    const detailText = await page.locator('body').innerText();
    log('---- target indent detail text ----');
    log(detailText);
    log('---- end ----');

    // Extract display id (e.g. "IND089") and route text to search for in the open-loads list.
    const idMatch = detailText.match(/([A-Z]{2,5}\d{2,6})\s*·\s*OPEN/);
    const displayId = idMatch ? idMatch[1] : null;
    log(`extracted display id: ${displayId}`);

    log('going to Market > Find Work and scrolling to locate this indent card');
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1200);
    await page.getByText(/^market$/i).first().click();
    await page.waitForTimeout(1500);
    await page.getByText(/^find work$/i).first().click().catch(() => {});
    await page.waitForTimeout(1200);

    let found = false;
    let lastText = '';
    let stableCount = 0;
    for (let i = 1; i <= 25 && !found; i++) {
      const bodyText = await page.locator('body').innerText();
      if (displayId && bodyText.includes(displayId)) {
        found = true;
        log(`found display id ${displayId} in Find Work list at scroll ${i}`);
        break;
      }
      if (bodyText === lastText) {
        stableCount++;
        if (stableCount >= 3) {
          log(`list appears to have stopped changing after ${i} scrolls (reached end)`);
          break;
        }
      } else {
        stableCount = 0;
      }
      lastText = bodyText;
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `${OUT}/34-findwork-final-state.png`, fullPage: true });

    if (found && displayId) {
      const idText = page.getByText(displayId, { exact: false }).first();
      const box = await idText.boundingBox().catch(() => null);
      if (box) {
        await page.screenshot({
          path: `${OUT}/35-findwork-target-indent-card.png`,
          clip: { x: 0, y: Math.max(0, box.y - 20), width: 414, height: 220 },
        }).catch(() => {});
      }
    } else {
      log(`RESULT: indent ${TARGET_INDENT} (display id ${displayId}) was NOT found in the Find Work open-loads list after exhaustive scrolling — it is not currently visible in that feed.`);
    }

    log('DONE');
  } catch (err) {
    console.error(`[a64-qa-c3] FAIL: ${err.message}`);
    await page.screenshot({ path: `${OUT}/ERROR-check3.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
