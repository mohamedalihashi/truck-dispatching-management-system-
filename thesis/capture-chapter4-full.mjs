/**
 * Full Chapter IV screenshots: auth, admin, driver, customer.
 * Run from thesis/: node capture-chapter4-full.mjs
 * Needs: backend :4000, frontend :5173, AUTH_OTP_ENABLED=false (or no OTP)
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

const ADMIN = {
  identifier: process.env.ADMIN_EMAIL || "maxamedcalixashi02@gmail.com",
  password: process.env.ADMIN_PASSWORD || "calixashi",
};

fs.mkdirSync(OUT, { recursive: true });

function loadCreds() {
  if (!fs.existsSync(CREDS_PATH)) return {};
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
  if (data.requiresVerification || data.verificationRequired) {
    throw new Error("OTP required — set AUTH_OTP_ENABLED=false for capture");
  }
  if (!data.token || !data.user) throw new Error(`No token for ${identifier}`);
  return data;
}

async function injectSession(page, session) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("td_token", token);
    localStorage.setItem("td_user", JSON.stringify(user));
  }, session);
}

async function logout(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("td_token");
    localStorage.removeItem("td_user");
  });
  await page.context().clearCookies();
}

async function shot(page, name) {
  // Viewport only — keeps thesis figures printable (not full-page scrolls)
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("Saved:", name);
}

async function go(page, route, waitMs = 1800) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(waitMs);
}

async function main() {
  const creds = loadCreds();
  const customerId = creds.customerEmail || process.env.THESIS_CUSTOMER_EMAIL || "thesis.customer.iv@gaarihel.test";
  const customerPw = creds.customerPassword || process.env.THESIS_CUSTOMER_PASSWORD || "calixashi";
  const driverId = creds.driverEmail || process.env.SHARED_DRIVER_EMAIL || process.env.FTL_DRIVER_EMAIL || "bahja12@gmail.com";
  const driverPw = creds.driverPassword || process.env.SHARED_DRIVER_PASSWORD || "calixashi";
  const ftlDriverId = creds.ftlDriverEmail || process.env.FTL_DRIVER_EMAIL || driverId;
  const ftlDriverPw = creds.ftlDriverPassword || process.env.FTL_DRIVER_PASSWORD || driverPw;

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome", // use installed Google Chrome
  });
  const page = await browser.newPage({
    viewport: { width: 1360, height: 800 },
    deviceScaleFactor: 1,
  });

  // —— Public ——
  await go(page, "/");
  await shot(page, "fig-4-12-landing-home");
  await go(page, "/login");
  await shot(page, "fig-4-11-login");
  await go(page, "/register");
  await shot(page, "fig-4-10-register");

  // —— Admin ——
  const admin = await apiLogin(ADMIN.identifier, ADMIN.password);
  await injectSession(page, admin);
  await go(page, "/admin", 2200);
  await shot(page, "fig-4-1-admin-dashboard");
  await go(page, "/admin/requests");
  await shot(page, "fig-4-13-admin-requests");
  const assignBtn = page.locator('button[title="Assign"], button:has-text("Assign")').first();
  if (await assignBtn.count()) {
    await assignBtn.click();
    await page.waitForTimeout(900);
    await shot(page, "fig-4-2-ftl-assign-modal");
    await page.keyboard.press("Escape");
  }
  await go(page, "/admin/shared-trips");
  await shot(page, "fig-4-3-shared-pool");
  await go(page, "/admin/trips");
  await shot(page, "fig-4-14-admin-trips");
  await go(page, "/admin/audit-logs");
  await shot(page, "fig-4-15-audit-logs");
  await go(page, "/admin/settings");
  await shot(page, "fig-4-4-pricing-settings");
  await go(page, "/admin/profile");
  await shot(page, "fig-4-16-admin-profile");
  await go(page, "/admin/tracking", 2500);
  await shot(page, "fig-4-7-tracking-map");
  await logout(page);

  // —— Customer ——
  try {
    const customer = await apiLogin(customerId, customerPw);
    await injectSession(page, customer);
    await go(page, "/customer", 2200);
    await shot(page, "fig-4-17-customer-home");
    await go(page, "/customer/book");
    await shot(page, "fig-4-5-customer-booking");
    await go(page, "/customer/trips");
    await shot(page, "fig-4-18-customer-trips");
    await go(page, "/customer/tracking", 2200);
    await shot(page, "fig-4-19-customer-tracking");
    await go(page, "/customer/payments");
    await shot(page, "fig-4-8-payments");
    await go(page, "/customer/profile");
    await shot(page, "fig-4-20-customer-profile");
    await logout(page);
  } catch (e) {
    console.warn("Customer capture skipped:", e.message);
  }

  // —— Driver (shared or FTL from creds) ——
  try {
    const driver = await apiLogin(driverId, driverPw);
    await injectSession(page, driver);
    await go(page, "/driver", 2200);
    await shot(page, "fig-4-21-driver-dashboard");
    const isShared = driver.user?.serviceType === "SHARED";
    if (isShared) {
      await go(page, "/driver/shared-trips");
      await shot(page, "fig-4-6-shared-driver-accept");
      const viewLink = page.locator('a[href*="/driver/shared-trips/"]').first();
      if (await viewLink.count()) {
        await viewLink.click();
        await page.waitForTimeout(2000);
        await shot(page, "fig-4-6b-shared-trip-detail");
      }
    } else {
      await go(page, "/driver/jobs");
      await shot(page, "fig-4-22-driver-assigned-jobs");
      await go(page, "/driver/tracking", 2200);
      await shot(page, "fig-4-7-tracking-map");
    }
    await go(page, "/driver/profile");
    await shot(page, "fig-4-23-driver-profile");
    await logout(page);
  } catch (e) {
    console.warn("Driver capture skipped:", e.message);
  }

  // Optional separate FTL driver if different from shared
  if (ftlDriverId && ftlDriverId !== driverId) {
    try {
      const ftl = await apiLogin(ftlDriverId, ftlDriverPw);
      await injectSession(page, ftl);
      await go(page, "/driver/jobs");
      await shot(page, "fig-4-22-driver-assigned-jobs");
      await go(page, "/driver/profile");
      await shot(page, "fig-4-23-driver-profile");
    } catch (e) {
      console.warn("FTL driver capture skipped:", e.message);
    }
  }

  await browser.close();
  console.log("\nDone. Screenshots in:", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
