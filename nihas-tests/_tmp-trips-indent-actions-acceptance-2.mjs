#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { loadCredentials } from "./credentials.mjs";

const BASE = "http://localhost:8081";
const OUT = "/tmp/trips-indent-actions-accept";
const { email, password } = loadCredentials();

function classify(url) {
  const u = url.toLowerCase();
  if (!u.includes("supabase.co")) return null;
  if (u.includes("/rest/v1/rpc/")) {
    const m = u.match(/rpc\/([^/?]+)/);
    return `rpc:${m?.[1] ?? "?"}`;
  }
  if (u.includes("/rest/v1/")) {
    const m = u.match(/rest\/v1\/([^/?]+)/);
    return `table:${m?.[1] ?? "?"}`;
  }
  return "supabase-other";
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 60000 });
  console.log("[shot]", name);
}

async function dismissReminders(page) {
  const r = page.getByText("Remind me later", { exact: true }).first();
  if (await r.isVisible({ timeout: 1200 }).catch(() => false)) {
    await r.click({ force: true }).catch(() => {});
  }
}

async function waitTrips(page) {
  await dismissReminders(page);
  await page.getByRole("button", { name: /^Add$/i }).first().waitFor({
    state: "visible",
    timeout: 120000,
  });
  await page.waitForTimeout(1800);
}

async function closeHub(page) {
  const close = page.getByLabel("Close Review Hub").first();
  if (await close.isVisible({ timeout: 800 }).catch(() => false)) {
    await close.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(500);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const patches = [];
  page.on("request", (req) => {
    const kind = classify(req.url());
    if (!kind) return;
    const method = req.method().toUpperCase();
    if (method === "PATCH" || method === "DELETE" || (method === "POST" && kind.startsWith("table:"))) {
      patches.push({ method, kind, url: req.url().split("?")[0] });
    }
  });

  const out = {};
  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await waitTrips(page);
  await page.goto(`${BASE}/trips?stage=indent`, { waitUntil: "load", timeout: 90000 });
  await waitTrips(page);

  const reviewBtns = page.getByRole("button", { name: /^Review$/i });
  out.reviewButtonCount = await reviewBtns.count();
  console.log("Review buttons", out.reviewButtonCount);

  const beforeReview = patches.length;
  await reviewBtns.first().click();
  await page.waitForTimeout(1800);
  out.waitingReviewHub =
    (await page.getByText("Review Hub", { exact: true }).first().isVisible().catch(() => false)) ||
    (await page.getByLabel("Close Review Hub").first().isVisible().catch(() => false));
  await shot(page, "10-review-hub-first");
  await closeHub(page);
  out.waitingReviewMutations = patches.slice(beforeReview);

  const market = page.getByLabel(/Share this load to Marketplace|Shared to Marketplace/i).first();
  out.marketVisible = await market.isVisible();
  const beforeMkt = patches.length;
  await market.click();
  await page.waitForTimeout(800);
  const cancel = page.getByRole("button", { name: /^Cancel$/i }).first();
  out.marketConfirm = await page.getByText(/Marketplace\?/i).first().isVisible().catch(() => false);
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    out.marketCancelled = true;
  }
  await page.waitForTimeout(500);
  await shot(page, "11-market-cancelled");
  out.marketMutations = patches.slice(beforeMkt);

  // RECEIVING BIDS: click Review on a card that has that status nearby
  const recReview = page
    .locator("div")
    .filter({ has: page.getByText("RECEIVING BIDS", { exact: true }) })
    .getByRole("button", { name: /^Review$/i })
    .first();
  if (await recReview.isVisible().catch(() => false)) {
    await recReview.click();
    await page.waitForTimeout(1800);
    out.receivingReviewHub =
      (await page.getByText("Review Hub", { exact: true }).first().isVisible().catch(() => false)) ||
      (await page.getByLabel("Close Review Hub").first().isVisible().catch(() => false));
    await shot(page, "12-receiving-review-hub");
    await closeHub(page);
  } else {
    out.receivingReviewHub = "not-found";
  }

  const awReview = page
    .locator("div")
    .filter({ has: page.getByText("AWARDED", { exact: true }) })
    .getByRole("button", { name: /^Review$/i })
    .first();
  if (await awReview.isVisible().catch(() => false)) {
    await awReview.click();
    await page.waitForTimeout(1800);
    out.awardedReviewHub =
      (await page.getByText("Review Hub", { exact: true }).first().isVisible().catch(() => false)) ||
      (await page.getByLabel("Close Review Hub").first().isVisible().catch(() => false));
    await shot(page, "13-awarded-review-hub");
    await closeHub(page);
  } else {
    out.awardedReviewHub = "not-found";
  }

  out.allMutations = patches;
  console.log(JSON.stringify(out, null, 2));
  writeFileSync(`${OUT}/report2.json`, JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
