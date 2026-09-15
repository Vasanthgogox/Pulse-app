#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { loadCredentials } from "./credentials.mjs";

const BASE = "http://localhost:8081";
const OUT = "/tmp/trips-indent-awarded-review";
const { email, password } = loadCredentials();

async function waitTrips(page) {
  const r = page.getByText("Remind me later", { exact: true }).first();
  if (await r.isVisible({ timeout: 1200 }).catch(() => false)) {
    await r.click({ force: true }).catch(() => {});
  }
  await page.getByRole("button", { name: /^Add$/i }).first().waitFor({
    state: "visible",
    timeout: 120000,
  });
  await page.waitForTimeout(1800);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await waitTrips(page);
  await page.goto(`${BASE}/trips?stage=indent`, { waitUntil: "load", timeout: 90000 });
  await waitTrips(page);

  const awardedReview = page
    .locator("div")
    .filter({ has: page.getByText("AWARDED", { exact: true }) })
    .filter({ has: page.getByText("Pending", { exact: false }) })
    .getByRole("button", { name: /^Review$/i })
    .first();

  const fallback = page
    .locator("div")
    .filter({ has: page.getByText("AWARDED", { exact: true }) })
    .getByRole("button", { name: /^Review$/i })
    .first();

  const btn = (await awardedReview.isVisible().catch(() => false))
    ? awardedReview
    : fallback;
  await btn.click();
  await page.waitForTimeout(1800);
  const hub =
    (await page.getByText("Review Hub", { exact: true }).first().isVisible().catch(() => false)) ||
    (await page.getByLabel("Close Review Hub").first().isVisible().catch(() => false));
  await page.screenshot({ path: `${OUT}/awarded-review-hub.png`, fullPage: true, timeout: 60000 });
  console.log(JSON.stringify({ awardedReviewHub: hub, url: page.url() }));
  await browser.close();
  process.exit(hub ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
