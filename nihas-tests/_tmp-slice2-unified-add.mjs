#!/usr/bin/env node
/**
 * Slice 2 browser acceptance — unified + Add wizard (no create submit).
 */
import { chromium } from "playwright";
import { loadCredentials } from "./credentials.mjs";

const BASE = "http://localhost:8081";
const OUT = "/tmp/slice2-unified-add-shots";
const { email, password } = loadCredentials();

async function shot(page, name) {
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    fullPage: true,
    timeout: 60000,
  });
  console.log(`[shot] ${name}`);
}

async function dismissReminder(page) {
  const remindLater = page.getByText("Remind me later", { exact: true }).first();
  if (await remindLater.isVisible({ timeout: 1500 }).catch(() => false)) {
    await remindLater.click({ force: true }).catch(() => {});
  }
}

async function clickContinue(page) {
  const btn = page.getByRole("button", { name: /continue/i }).first();
  const enabled = await btn.isEnabled().catch(() => false);
  if (!enabled) return false;
  await btn.click();
  await page.waitForTimeout(1100);
  return true;
}

async function main() {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await dismissReminder(page);
  console.log("signed in", page.url());

  await page.goto(`${BASE}/add-trip`, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  await shot(page, "02-add-wizard-client");

  await page.getByText("Apple", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, "05-client-picked");

  await page.getByText("Add sale", { exact: true }).first().click();
  await page.waitForTimeout(800);
  await shot(page, "06b-sale-keypad");
  const digit = page.getByText("1", { exact: true }).first();
  if (await digit.isVisible({ timeout: 2000 }).catch(() => false)) {
    for (const d of ["1", "0", "0", "0", "0"]) {
      await page.getByText(d, { exact: true }).last().click();
      await page.waitForTimeout(80);
    }
  } else {
    const input = page.locator("input").first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill("10000");
    }
  }
  const done = page.getByRole("button", { name: /done|continue/i }).first();
  await done.click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "06c-sale-set");

  for (let i = 0; i < 10; i++) {
    const t = await page.locator("body").innerText();
    const flags = {
      Asset: /\bAsset\b/.test(t),
      Market: /\bMarket\b/.test(t),
      Existing: /Existing supplier/i.test(t),
      Bidding: /Share for bidding/i.test(t),
      Route: /Pickup|Drop/i.test(t),
    };
    console.log(`walk ${i}`, flags);
    if (flags.Asset && flags.Market) {
      await shot(page, "07-source-asset-market");
      await page.getByRole("button", { name: /Market/i }).first().click();
      await page.waitForTimeout(700);
      await clickContinue(page);
      await shot(page, "08-after-market");
      const t2 = await page.locator("body").innerText();
      console.log("after market", {
        Existing: /Existing supplier/i.test(t2),
        Bidding: /Share for bidding/i.test(t2),
      });
      if (/Existing supplier/i.test(t2) && /Share for bidding/i.test(t2)) {
        await page.getByRole("button", { name: /Share for bidding/i }).first().click();
        await page.waitForTimeout(600);
        await clickContinue(page);
        await shot(page, "09-share-destination");
        const t3 = await page.locator("body").innerText();
        console.log("share dest", {
          Network: /Integrated suppliers|Network/i.test(t3),
          Marketplace: /Marketplace/i.test(t3),
          Both: /\bBoth\b/.test(t3),
        });
      }
      break;
    }
    await shot(page, `walk-${i}`);
    const advanced = await clickContinue(page);
    if (!advanced) {
      console.log("continue disabled; keypad/sale may be required");
      break;
    }
  }

  console.log("consoleErrors", consoleErrors.slice(0, 12));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
