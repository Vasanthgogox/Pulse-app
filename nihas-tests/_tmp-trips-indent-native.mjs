#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { loadCredentials } from "./credentials.mjs";

const BASE = "http://localhost:8081";
const OUT = "/tmp/trips-indent-native-shots";
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

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 60000 });
  console.log("[shot]", name);
}

async function dismiss(page) {
  const r = page.getByText("Remind me later", { exact: true }).first();
  if (await r.isVisible({ timeout: 1200 }).catch(() => false)) {
    await r.click({ force: true }).catch(() => {});
  }
}

function chromeFlags(text) {
  return {
    My_Loads: /\bMy Loads\b/.test(text),
    My_load: /\bMy load\b/i.test(text),
    Idle_capacity: /Idle capacity/i.test(text),
    Your_indents_by_stage: /Your indents by stage/i.test(text),
    Search_loads: /Search loads/i.test(text),
    Find_vehicles: /Find vehicles/i.test(text),
    TARGET_RATE: text.includes("TARGET RATE"),
    trip: /GOD684GODTRIP/i.test(text),
    Add: /\+\s*Add|\bAdd\b/.test(text),
    Get_load: /Get load/i.test(text),
  };
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const hits = [];
  page.on("request", (req) => {
    const kind = classify(req.url());
    if (kind) hits.push({ kind, method: req.method(), url: req.url().split("?")[0] });
  });

  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await waitTrips(page);

  const mark = (label) => {
    const n = hits.length;
    return () => hits.slice(n);
  };

  console.log("=== DESKTOP /trips default ===");
  await shot(page, "01-trips-default");

  const afterIndent = mark("indent");
  await page.getByText("Requirement not yet allocated to a trip", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await shot(page, "02-indent");
  const indentText = await page.locator("body").innerText();
  console.log("INDENT chrome", chromeFlags(indentText));
  console.log("INDENT extra supabase after click", afterIndent().length);

  const afterAll = mark("all");
  await page.getByText("Active", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await shot(page, "03-all");
  const allText = await page.locator("body").innerText();
  console.log("ALL chrome", chromeFlags(allText));
  console.log("ALL extra supabase after click", afterAll().length);

  await page.getByText("No driver on trip", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, "04-unassigned");
  console.log("UNASSIGNED chrome", chromeFlags(await page.locator("body").innerText()));

  await page.getByRole("button", { name: /^Add$/i }).first().click();
  await page.waitForTimeout(2000);
  console.log("Add url", page.url());
  await shot(page, "05-add");

  const beforeLoads = hits.length;
  await page.goto(`${BASE}/pulse-loads`, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(4000);
  await dismiss(page);
  await shot(page, "06-pulse-loads");
  const loadsText = await page.locator("body").innerText();
  console.log("LOADS chrome", chromeFlags(loadsText));
  console.log("pulse-loads supabase after nav", hits.length - beforeLoads);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/trips`, { waitUntil: "load", timeout: 90000 });
  await waitTrips(page);
  await page.getByText(/^Indent\s*\(/i).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "07-mobile-indent");
  console.log("MOBILE INDENT", chromeFlags(await page.locator("body").innerText()));
  await page.getByText(/^All\s*\(/i).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "08-mobile-all");
  console.log("MOBILE ALL", chromeFlags(await page.locator("body").innerText()));
  await page.getByRole("button", { name: /^Add$/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  console.log("mobile Add url", page.url());
  await shot(page, "09-mobile-add");

  const counts = {};
  for (const h of hits) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
  console.log("=== supabase kind counts (whole session) ===");
  console.log(JSON.stringify(counts, null, 2));
  const rpcs = Object.keys(counts).filter((k) => k.startsWith("rpc:"));
  console.log("rpcs", rpcs.join(", ") || "(none new named)");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
