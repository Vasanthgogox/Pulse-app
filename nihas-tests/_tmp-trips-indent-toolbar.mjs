#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { loadCredentials } from "./credentials.mjs";

const BASE = "http://localhost:8081";
const OUT = "/tmp/trips-indent-toolbar-shots";
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

async function dismiss(page) {
  const r = page.getByText("Remind me later", { exact: true }).first();
  if (await r.isVisible({ timeout: 1000 }).catch(() => false)) {
    await r.click({ force: true }).catch(() => {});
  }
}

async function waitTrips(page) {
  await dismiss(page);
  await page.getByRole("button", { name: /^Add$/i }).first().waitFor({
    state: "visible",
    timeout: 90000,
  });
  await page.waitForTimeout(2500);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const hits = [];
  page.on("request", (req) => {
    const kind = classify(req.url());
    if (kind) hits.push(kind);
  });

  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await waitTrips(page);

  await page.getByText("Requirement not yet allocated to a trip", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/01-indent-toolbar.png`, fullPage: true, timeout: 60000 });
  const indentText = await page.locator("body").innerText();
  console.log("INDENT", {
    Search: /Search trip \/ client \/ supplier/i.test(indentText),
    TODAY: /\bTODAY\b/.test(indentText),
    My_Loads: /\bMy Loads\b/.test(indentText),
    Idle_capacity: /Idle capacity/i.test(indentText),
    TARGET_RATE: indentText.includes("TARGET RATE") || /LIVE|BIDS|WON/.test(indentText),
    Showing: /Showing /i.test(indentText),
  });

  const beforeSearch = hits.length;
  const search = page.getByPlaceholder("Search trip / client / supplier").first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill("Apple");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/02-indent-search-apple.png`, fullPage: true, timeout: 60000 });
    console.log("search extra supabase", hits.length - beforeSearch);
  } else {
    console.log("search field missing");
  }

  await page.getByText("Active", { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/03-all-toolbar.png`, fullPage: true, timeout: 60000 });
  const allText = await page.locator("body").innerText();
  console.log("ALL", {
    Search: /Search trip \/ client \/ supplier/i.test(allText),
    TARGET_or_LIVE: /TARGET RATE|\bLIVE\b/.test(allText),
    trip: /GOD684GODTRIP/i.test(allText),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/trips`, { waitUntil: "load", timeout: 90000 });
  await waitTrips(page);
  await page.getByText(/^Indent\s*\(/i).first().click().catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/04-mobile-indent.png`, fullPage: true, timeout: 60000 });
  const m = await page.locator("body").innerText();
  console.log("MOBILE INDENT", {
    Search: /Search trip/i.test(m),
    Today: /\bToday\b|\bTODAY\b/.test(m),
    My_Loads: /\bMy Loads\b/.test(m),
  });

  const counts = {};
  for (const k of hits) counts[k] = (counts[k] ?? 0) + 1;
  console.log("table:indents", counts["table:indents"] ?? 0);
  console.log("rpc:market_indents_for_org", counts["rpc:market_indents_for_org"] ?? 0);
  console.log("rpc:get_network_feed", counts["rpc:get_network_feed"] ?? 0);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
