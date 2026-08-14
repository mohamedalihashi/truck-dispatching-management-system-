/**
 * Capture remaining Chapter IV screenshots (customer + shared driver).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "screenshots");
const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const API = process.env.API_URL || "http://127.0.0.1:4000/api";
const CREDS_PATH = path.join(__dirname, ".screenshot-credentials.json");

fs.mkdirSync(OUT, { recursive: true });

function loadCreds() {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error("Missing .screenshot-credentials.json in thesis/");
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
}

async function apiLogin(identifier, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${identifier}: ${data.message || res.status}`);
  return data;
}

async function injectSession(page, session) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem("td_token", token);
      localStorage.setItem("td_user", JSON.stringify(user));
    },
    session
  );
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("Saved:", file);
}

async function main() {
  const creds = loadCreds();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const customer = await apiLogin(creds.customerEmail, creds.customerPassword);
  await injectSession(page, customer);
  await page.goto(`${BASE}/customer/book`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot(page, "fig-4-5-customer-booking");

  await page.goto(`${BASE}/customer/payments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "fig-4-8-payments");

  const driver = await apiLogin(creds.driverEmail, creds.driverPassword);
  await injectSession(page, driver);
  await page.goto(`${BASE}/driver`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot(page, "fig-4-6-shared-driver-accept");

  await page.goto(`${BASE}/driver/shared-trips`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const viewLink = page.locator('a[href*="/driver/shared-trips/"]').first();
  if (await viewLink.count()) {
    await viewLink.click();
    await page.waitForTimeout(2000);
    await shot(page, "fig-4-6b-shared-trip-detail");
  }

  await browser.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
