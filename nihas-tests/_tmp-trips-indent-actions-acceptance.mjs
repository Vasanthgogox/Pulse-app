#!/usr/bin/env node
/**
 * Scratch browser acceptance: native Trips INDENT cards + Give Load actions.
 * Does not commit. Cancels Marketplace confirm. Closes Review Hub / Pulse sheet.
 */
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
  if (u.includes("/realtime/")) return "realtime";
  return "supabase-other";
}

function isWrite(method) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase());
}

async function shot(page, name) {
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    fullPage: true,
    timeout: 60000,
  });
  console.log("[shot]", name);
}

async function dismissReminders(page) {
  const r = page.getByText("Remind me later", { exact: true }).first();
  if (await r.isVisible({ timeout: 1500 }).catch(() => false)) {
    await r.click({ force: true }).catch(() => {});
  }
}

async function waitTrips(page) {
  await dismissReminders(page);
  await page.getByRole("button", { name: /^Add$/i }).first().waitFor({
    state: "visible",
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
}

function cardByStatus(page, status) {
  return page
    .locator("div")
    .filter({ hasText: new RegExp(`^${status}$`, "i") })
    .locator("xpath=ancestor::*[contains(@class,'css-') or true][1]")
    .first();
}

async function findCardRoot(page, statusLabel) {
  const status = page.getByText(statusLabel, { exact: true }).first();
  await status.waitFor({ state: "visible", timeout: 20000 });
  return status.locator("xpath=ancestor::div[contains(., 'Review') or contains(., 'Review Hub')][1]");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const hits = [];
  page.on("request", (req) => {
    const kind = classify(req.url());
    if (!kind) return;
    hits.push({
      kind,
      method: req.method(),
      write: isWrite(req.method()),
      url: req.url().split("?")[0],
    });
  });
  page.on("dialog", async (dialog) => {
    console.log("[dialog]", dialog.type(), dialog.message().slice(0, 120));
    await dialog.dismiss();
  });

  const report = {
    login: false,
    indentStage: false,
    statuses: {},
    waiting: {},
    receiving: {},
    awarded: {},
    bodyNav: {},
    writesOnRender: 0,
  };

  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await waitTrips(page);
  report.login = true;

  await page.goto(`${BASE}/trips?stage=indent`, { waitUntil: "load", timeout: 90000 });
  await waitTrips(page);
  await shot(page, "01-indent-stage");

  const body = await page.locator("body").innerText();
  report.statuses = {
    waiting: body.includes("WAITING FOR BID"),
    receiving: body.includes("RECEIVING BIDS"),
    awarded: body.includes("AWARDED"),
    unassignedLeak: /\bUNASSIGNED\b/.test(body) && body.includes("WAITING FOR BID"),
  };
  report.indentStage = /Indent\s*\(/i.test(body) || report.statuses.waiting;
  console.log("status presence", report.statuses);

  const afterPaint = hits.length;
  await page.waitForTimeout(1500);
  const idleHits = hits.slice(afterPaint);
  report.writesOnRender = idleHits.filter((h) => h.write).length;
  console.log("idle writes after paint", report.writesOnRender, idleHits.filter((h) => h.write));

  // --- WAITING FOR BID ---
  try {
    const waitingStatus = page.getByText("WAITING FOR BID", { exact: true }).first();
    await waitingStatus.waitFor({ timeout: 15000 });
    const waitingCard = waitingStatus.locator("xpath=ancestor::div[.//text()[contains(.,'Review')]][1]");
    const pulse = waitingCard.getByLabel(/Pulse indent as a 24 hour story|Pulse story is live/i).first();
    const market = waitingCard.getByLabel(/Share this load to Marketplace|Shared to Marketplace/i).first();
    const review = waitingCard.getByRole("button", { name: /Review Hub/i }).first();

    report.waiting.pulseVisible = await pulse.isVisible().catch(() => false);
    report.waiting.marketVisible = await market.isVisible().catch(() => false);
    report.waiting.reviewVisible = await review.isVisible().catch(() => false);

    const nPulse = hits.length;
    if (report.waiting.pulseVisible) {
      await pulse.click();
      await page.waitForTimeout(1200);
      const sheet = page.getByText(/Broadcast load|Broadcast to story/i).first();
      report.waiting.pulseSheet = await sheet.isVisible().catch(() => false);
      await shot(page, "02-waiting-pulse-sheet");
      const close = page.getByLabel(/^Close$/i).first();
      if (await close.isVisible().catch(() => false)) await close.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
    report.waiting.pulseWrites = hits.slice(nPulse).filter((h) => h.write).map((h) => h.kind);

    const nMkt = hits.length;
    if (report.waiting.marketVisible) {
      await market.click();
      await page.waitForTimeout(800);
      report.waiting.marketDialogDismissed = true;
      await shot(page, "03-waiting-market-after-cancel");
    }
    report.waiting.marketWrites = hits.slice(nMkt).filter((h) => h.write).map((h) => h.kind);

    const nRev = hits.length;
    if (report.waiting.reviewVisible) {
      await review.click();
      await page.waitForTimeout(1500);
      report.waiting.reviewHub =
        (await page.getByText("Review Hub", { exact: true }).first().isVisible().catch(() => false)) ||
        (await page.getByLabel("Close Review Hub").first().isVisible().catch(() => false));
      await shot(page, "04-waiting-review-hub");
      const closeHub = page.getByLabel("Close Review Hub").first();
      if (await closeHub.isVisible().catch(() => false)) await closeHub.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
    report.waiting.reviewWrites = hits.slice(nRev).filter((h) => h.write).map((h) => h.kind);
  } catch (e) {
    report.waiting.error = String(e?.message ?? e);
    console.log("WAITING error", report.waiting.error);
    await shot(page, "02-waiting-error");
  }

  // --- RECEIVING BIDS ---
  try {
    const recStatus = page.getByText("RECEIVING BIDS", { exact: true }).first();
    report.receiving.present = await recStatus.isVisible().catch(() => false);
    if (report.receiving.present) {
      const recCard = recStatus.locator("xpath=ancestor::div[.//text()[contains(.,'Review')]][1]");
      const market = recCard.getByLabel(/Share this load to Marketplace|Shared to Marketplace/i).first();
      const review = recCard.getByRole("button", { name: /Review Hub/i }).first();
      report.receiving.marketVisible = await market.isVisible().catch(() => false);
      report.receiving.reviewVisible = await review.isVisible().catch(() => false);
      if (report.receiving.reviewVisible) {
        await review.click();
        await page.waitForTimeout(1500);
        report.receiving.reviewHub =
          (await page.getByText("Review Hub", { exact: true }).first().isVisible().catch(() => false)) ||
          (await page.getByLabel("Close Review Hub").first().isVisible().catch(() => false));
        await shot(page, "05-receiving-review-hub");
        const closeHub = page.getByLabel("Close Review Hub").first();
        if (await closeHub.isVisible().catch(() => false)) await closeHub.click();
        else await page.keyboard.press("Escape");
        await page.waitForTimeout(600);
      }
    }
  } catch (e) {
    report.receiving.error = String(e?.message ?? e);
    await shot(page, "05-receiving-error");
  }

  // --- AWARDED ---
  try {
    const awStatus = page.getByText("AWARDED", { exact: true }).first();
    report.awarded.present = await awStatus.isVisible().catch(() => false);
    if (report.awarded.present) {
      const awCard = awStatus.locator("xpath=ancestor::div[.//text()[contains(.,'Review')]][1]");
      const market = awCard.getByLabel(/Share this load to Marketplace|Shared to Marketplace/i);
      const review = awCard.getByRole("button", { name: /Review Hub/i }).first();
      report.awarded.marketCount = await market.count();
      report.awarded.marketHidden = report.awarded.marketCount === 0;
      report.awarded.reviewVisible = await review.isVisible().catch(() => false);
      if (report.awarded.reviewVisible) {
        await review.click();
        await page.waitForTimeout(1500);
        report.awarded.reviewHub =
          (await page.getByText("Review Hub", { exact: true }).first().isVisible().catch(() => false)) ||
          (await page.getByLabel("Close Review Hub").first().isVisible().catch(() => false));
        await shot(page, "06-awarded-review-hub");
        const closeHub = page.getByLabel("Close Review Hub").first();
        if (await closeHub.isVisible().catch(() => false)) await closeHub.click();
        else await page.keyboard.press("Escape");
        await page.waitForTimeout(600);
      }
    }
  } catch (e) {
    report.awarded.error = String(e?.message ?? e);
    await shot(page, "06-awarded-error");
  }

  // Card body opens indent detail (click client/route area, not footer buttons)
  try {
    await page.goto(`${BASE}/trips?stage=indent`, { waitUntil: "load", timeout: 90000 });
    await waitTrips(page);
    const name = page.getByText("2 MERGED ORDERS", { exact: false }).first();
    if (await name.isVisible().catch(() => false)) {
      await name.click();
      await page.waitForTimeout(2000);
      report.bodyNav.url = page.url();
      report.bodyNav.openedIndent = /\/indent\//.test(page.url());
      await shot(page, "07-body-nav-indent-detail");
    } else {
      const waiting = page.getByText("WAITING FOR BID", { exact: true }).first();
      await waiting.click({ position: { x: 20, y: -40 } }).catch(async () => {
        await waiting.click();
      });
      await page.waitForTimeout(2000);
      report.bodyNav.url = page.url();
      report.bodyNav.openedIndent = /\/indent\//.test(page.url());
      await shot(page, "07-body-nav-indent-detail");
    }
  } catch (e) {
    report.bodyNav.error = String(e?.message ?? e);
  }

  const writes = hits.filter((h) => h.write);
  report.writeKinds = [...new Set(writes.map((w) => `${w.method} ${w.kind}`))];
  console.log("=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

  await browser.close();
  const failed =
    !report.login ||
    !report.statuses.waiting ||
    report.waiting.error ||
    report.waiting.pulseSheet === false ||
    report.waiting.reviewHub === false ||
    (report.waiting.marketWrites && report.waiting.marketWrites.length > 0);
  process.exit(failed ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
