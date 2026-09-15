#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { loadCredentials } from "./credentials.mjs";

const BASE = "http://localhost:8081";
const OUT = "/tmp/trips-recon-shots";
const { email, password } = loadCredentials();

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

async function waitHub(page, label) {
  await dismiss(page);
  const add = page.getByRole("button", { name: /^Add$/i }).first();
  const myTrips = page.getByText("My Trips", { exact: true }).first();
  await Promise.race([
    add.waitFor({ state: "visible", timeout: 90000 }),
    myTrips.waitFor({ state: "visible", timeout: 90000 }),
  ]).catch(() => {});
  await page.waitForTimeout(1500);
  await dismiss(page);
  const t = await page.locator("body").innerText();
  console.log(label, {
    url: page.url(),
    splash: /almost ready|preparing your workspace/i.test(t),
    hasAdd: await add.isVisible().catch(() => false),
    railAll: /All\s*\(\d+\)/i.test(t),
    railIndent: /Indent\s*\(\d+\)/i.test(t),
  });
}

async function clickRail(page, re) {
  const loc = page.getByText(re).first();
  const ok = await loc.click({ timeout: 8000 }).then(() => true).catch((e) => {
    console.log("click fail", re, e.message);
    return false;
  });
  await page.waitForTimeout(2000);
  return ok;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").first().fill(email);
  await page.getByPlaceholder("Your password").first().fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 90000 }).catch(() => {});
  await dismiss(page);

  await page.goto(`${BASE}/trips`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitHub(page, "desktop-trips");
  await shot(page, "12-desktop-trips-ready");

  const addVisible = await page.getByRole("button", { name: /^Add$/i }).first().isVisible().catch(() => false);
  const addTrip = await page.getByText("Add Trip", { exact: false }).count();
  const addLoad = await page.getByText("Add Load", { exact: false }).count();
  console.log("header", { addVisible, addTrip, addLoad });

  await clickRail(page, /^All\s*\(/i);
  await shot(page, "13-desktop-all");
  const allT = await page.locator("body").innerText();
  console.log("ALL body", {
    TARGET_RATE: allT.includes("TARGET RATE"),
    My_Loads: /My Loads/i.test(allT),
    trip_codes: /GOD684GODTRIP/i.test(allT),
    Assigned: /ASSIGNED/i.test(allT),
  });

  await clickRail(page, /^Indent\s*\(/i);
  await shot(page, "14-desktop-indent");
  const indT = await page.locator("body").innerText();
  console.log("INDENT body", {
    TARGET_RATE: indT.includes("TARGET RATE"),
    AWARDED: /AWARDED/i.test(indT),
    My_Loads: /My Loads/i.test(indT),
    toolbar: /Active|History|Search/i.test(indT),
    trip_codes: /GOD684GODTRIP/i.test(indT),
  });

  await clickRail(page, /^Unassigned\s*\(/i);
  await shot(page, "15-desktop-unassigned");
  const uT = await page.locator("body").innerText();
  console.log("UNASSIGNED body", {
    TARGET_RATE: uT.includes("TARGET RATE"),
    trip_codes: /GOD684GODTRIP/i.test(uT),
    UNASSIGNED: /UNASSIGNED/i.test(uT),
  });

  await page.goto(`${BASE}/trips?stage=indent`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitHub(page, "deeplink");
  await shot(page, "16-desktop-deeplink-indent");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/trips`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitHub(page, "mobile-trips");
  await clickRail(page, /^All\s*\(/i);
  await shot(page, "17-mobile-all");
  const mAll = await page.locator("body").innerText();
  console.log("mobile ALL", {
    TARGET_RATE: mAll.includes("TARGET RATE"),
    trip_cards: /GOD684GODTRIP/i.test(mAll),
  });
  await clickRail(page, /^Indent\s*\(/i);
  await shot(page, "18-mobile-indent");

  await page.getByRole("button", { name: /^Add$/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  console.log("after header Add url", page.url());
  await shot(page, "19-after-add-click");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
