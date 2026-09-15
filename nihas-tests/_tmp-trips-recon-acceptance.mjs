#!/usr/bin/env node
// Read-only browser acceptance for reconciled TripsScreen + unified Add.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { loadCredentials } from "./credentials.mjs";

const BASE = "http://localhost:8081";
const OUT = "/tmp/trips-recon-shots";
const { email, password } = loadCredentials();

const consoleErrors = [];
const failedRequests = [];

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
    await page.waitForTimeout(400);
  }
}

async function body(page) {
  return page.locator("body").innerText();
}

async function waitTripsReady(page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2800);
  await dismissReminder(page);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (req) =>
    failedRequests.push(
      `${req.method()} ${req.url()} -- ${req.failure()?.errorText}`,
    ),
  );

  console.log("=== 1 SIGN IN ===");
  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page
    .waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 90000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  await dismissReminder(page);
  console.log("signed in", page.url());

  console.log("=== 2 /trips ===");
  await page.goto(`${BASE}/trips`, { waitUntil: "load", timeout: 90000 });
  await waitTripsReady(page);
  const splash = (await body(page)).toLowerCase().includes("preparing");
  console.log("still_splash", splash);
  await shot(page, "01-desktop-trips");

  const headerAdd = page.getByRole("button", { name: /^Add$/i });
  const addCount = await headerAdd.count();
  const addTripCount = await page.getByText(/Add Trip/i).count();
  const addLoadCount = await page.getByText(/Add Load/i).count();
  console.log("add_buttons", { addCount, addTripCount, addLoadCount });

  const t = await body(page);
  const rail = ["ALL", "INDENT", "UNASSIGNED", "ASSIGNED", "LOADING", "IN TRANSIT", "UNLOADING", "DELIVERED"];
  console.log(
    "rail",
    rail.map((k) => `${k}:${t.toUpperCase().includes(k)}`).join(" "),
  );
  console.log("has_indents_tab", /\bIndents\b/.test(t) && /Trips/.test(t));
  console.log("has_toolbar", /Sort|Filter|Search|Active|History/i.test(t));

  console.log("=== 3 INDENT ===");
  await page.getByText(/^INDENT\b/i).first().click({ timeout: 8000 }).catch((e) => {
    console.log("indent click failed", e.message);
  });
  await page.waitForTimeout(2000);
  await shot(page, "02-desktop-indent");
  const indentText = await body(page);
  console.log("indent_markers", {
    TARGET_RATE: indentText.includes("TARGET RATE"),
    AWARDED: indentText.toUpperCase().includes("AWARDED"),
    Give_Load: /Give Load|My load|Your active indent/i.test(indentText),
    trip_table: /Route/.test(indentText),
    toolbar: /Active|History|Add/i.test(indentText),
  });

  console.log("=== 4 UNASSIGNED ===");
  await page.getByText(/^UNASSIGNED\b/i).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, "03-desktop-unassigned");
  const uText = await body(page);
  console.log("unassigned_markers", {
    TARGET_RATE: uText.includes("TARGET RATE"),
    trip_ui: /Route|Trip|driver/i.test(uText),
  });

  console.log("=== 5 ALL ===");
  await page.getByText(/^ALL\b/i).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "04-desktop-all");
  const allText = await body(page);
  console.log("all_markers", {
    TARGET_RATE: allText.includes("TARGET RATE"),
    trip_ui: /Route|Trip/.test(allText),
  });

  console.log("=== 6 other stages ===");
  for (const label of ["ASSIGNED", "LOADING", "IN TRANSIT", "UNLOADING", "DELIVERED"]) {
    await page.getByText(new RegExp(`^${label}\\b`, "i")).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await shot(page, "05-desktop-delivered");

  console.log("=== 7 deep link stage=indent ===");
  await page.goto(`${BASE}/trips?stage=indent`, { waitUntil: "load", timeout: 90000 });
  await waitTripsReady(page);
  await shot(page, "06-deeplink-indent");
  console.log("deeplink_url", page.url());

  console.log("=== 8 Loads Get Load only ===");
  await page.goto(`${BASE}/pulse-loads`, { waitUntil: "load", timeout: 90000 });
  await waitTripsReady(page);
  await shot(page, "07-pulse-loads");
  const loads = await body(page);
  console.log("loads_markers", {
    Get_load: /Get load/i.test(loads),
    My_load: /My load/i.test(loads),
    Give_Load: /Give Load/i.test(loads),
  });

  console.log("=== 9 + Add unified flow ===");
  await page.goto(`${BASE}/trips`, { waitUntil: "load", timeout: 90000 });
  await waitTripsReady(page);
  const addBtn = page.getByRole("button", { name: /^Add$/i }).first();
  if (await addBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(2500);
  } else {
    await page.goto(`${BASE}/add-trip`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(2500);
  }
  await shot(page, "08-add-flow");
  console.log("add_url", page.url());
  const addBody = await body(page);
  console.log("add_markers", {
    Client: /Client/i.test(addBody),
    Route: /Route|Pickup/i.test(addBody),
    Source: /Source|Asset|Market/i.test(addBody),
  });

  console.log("=== 10 mobile ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/trips`, { waitUntil: "load", timeout: 90000 });
  await waitTripsReady(page);
  await shot(page, "09-mobile-trips");
  await page.getByText(/^ALL\b/i).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "10-mobile-all");
  await page.getByText(/^INDENT\b/i).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "11-mobile-indent");

  console.log("=== CONSOLE ERRORS ===");
  console.log([...new Set(consoleErrors)].slice(0, 25).join("\n"));
  console.log("=== FAILED REQUESTS ===");
  console.log([...new Set(failedRequests)].slice(0, 20).join("\n"));

  await browser.close();
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
