/**
 * Capture GaariHel UI screenshots for Chapter IV.
 * Run: node capture-screenshots.mjs
 * Requires: backend on :4000, frontend on :5173, playwright chromium
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "screenshots");
const BASE = process.env.APP_URL || "http://127.0.0.1:5173";
const API = process.env.API_URL || "http://127.0.0.1:4000/api";

const ADMIN = {
  identifier: process.env.ADMIN_EMAIL || "maxamedcalixashi02@gmail.com",
  password: process.env.ADMIN_PASSWORD || "calixashi",
};

const THESIS_CUSTOMER = {
  identifier: process.env.THESIS_CUSTOMER_EMAIL || "thesis.customer.iv@gaarihel.test",
  password: process.env.THESIS_CUSTOMER_PASSWORD || "calixashi",
};

const SHARED_DRIVER = {
  identifier: process.env.SHARED_DRIVER_EMAIL || "bahja12@gmail.com",
  password: process.env.SHARED_DRIVER_PASSWORD || "calixashi",
};

const ROLE_HOME = {
  admin: "/admin",
  driver: "/driver",
  customer: "/customer",
};

fs.mkdirSync(OUT, { recursive: true });

async function apiLogin(identifier, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${identifier}: ${data.message || res.status}`);
  if (data.requiresVerification && data.email) {
    throw new Error("OTP required — set AUTH_OTP_ENABLED=false in backend/.env");
  }
  if (!data.token || !data.user) {
    throw new Error(`Login for ${identifier} did not return token/user`);
  }
  return data;
}

async function findUserByRole(token, role, serviceType) {
  const res = await fetch(`${API}/users?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const rows = data.data || data;
  return rows.find(
    (u) =>
      u.role === role &&
      (!serviceType || u.serviceType === serviceType || u.driverServiceType === serviceType)
  );
}

async function injectSession(page, { token, user }) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token: t, user: u }) => {
      localStorage.setItem("td_token", t);
      localStorage.setItem("td_user", JSON.stringify(u));
    },
    { token, user }
  );
}

async function loginAs(page, identifier, password) {
  const session = await apiLogin(identifier, password);
  await injectSession(page, session);
  const home = ROLE_HOME[session.user.role] || "/";
  await page.goto(`${BASE}${home}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return session;
}

async function logout(page) {
  await page.context().clearCookies();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("td_token");
    localStorage.removeItem("td_user");
  });
}

async function shot(page, name, fullPage = true) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log("Saved:", file);
  return file;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // --- Admin ---
  await loginAs(page, ADMIN.identifier, ADMIN.password);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await shot(page, "fig-4-1-admin-dashboard");

  await page.goto(`${BASE}/admin/requests`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const assignBtn = page.locator('button[title="Assign"], button:has-text("Assign")').first();
  if (await assignBtn.count()) {
    await assignBtn.click();
    await page.waitForTimeout(1000);
    await shot(page, "fig-4-2-ftl-assign-modal", false);
    await page.keyboard.press("Escape");
  } else {
    await shot(page, "fig-4-2-ftl-assign-modal");
  }

  await page.goto(`${BASE}/admin/shared-trips`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "fig-4-3-shared-pool");

  await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const pricing = page.locator("text=Pricing rates").first();
  if (await pricing.count()) {
    await pricing.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }
  await shot(page, "fig-4-4-pricing-settings");

  await page.goto(`${BASE}/admin/tracking`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await shot(page, "fig-4-7-tracking-map");

  await logout(page);

  // --- Customer ---
  try {
    await loginAs(page, THESIS_CUSTOMER.identifier, THESIS_CUSTOMER.password);
  } catch (e) {
    console.warn("Customer login:", e.message);
  }

  if (page.url().includes("/customer")) {
    await page.goto(`${BASE}/customer/book`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await shot(page, "fig-4-5-customer-booking");

    await page.goto(`${BASE}/customer/payments`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(page, "fig-4-8-payments");
  }

  await logout(page);

  // --- Shared driver ---
  try {
    await loginAs(page, SHARED_DRIVER.identifier, SHARED_DRIVER.password);
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
  } catch (e) {
    console.warn("Driver shots:", e.message);
  }

  await browser.close();
  console.log("\nDone. Screenshots in:", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
