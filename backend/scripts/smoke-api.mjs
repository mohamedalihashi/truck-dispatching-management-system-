/**
 * Live API smoke test — core product flows.
 * Usage: node scripts/smoke-api.mjs
 */
const API = process.env.API_URL || "http://127.0.0.1:4000/api";
const PASS = process.env.DEMO_PASSWORD || "calixashi";

const results = [];

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(identifier) {
  const r = await req("POST", "/auth/login", {
    body: { identifier, password: PASS },
  });
  const token = r.data?.token || r.data?.data?.token;
  const user = r.data?.user || r.data?.data?.user;
  return { ...r, token, user };
}

async function main() {
  console.log(`Smoke testing ${API}\n`);

  const health = await req("GET", "/health");
  log("GET /health", health.ok && health.data?.status === "ok", health.data?.status);

  const admin = await login("maxamedcalixashi02@gmail.com");
  log("Admin login", Boolean(admin.token), admin.data?.message || admin.user?.role);

  if (!admin.token) {
    console.log("\nAbort: admin login failed");
    process.exit(1);
  }

  const me = await req("GET", "/auth/me", { token: admin.token });
  log("GET /auth/me", me.ok, me.data?.role || me.data?.user?.role);

  const requests = await req("GET", "/cargo-requests?limit=5", { token: admin.token });
  log("GET /cargo-requests", requests.ok, `count=${requests.data?.data?.length ?? requests.data?.items?.length ?? "?"}`);

  const trips = await req("GET", "/trips?limit=5", { token: admin.token });
  log("GET /trips", trips.ok);

  const trucks = await req("GET", "/trucks?limit=5", { token: admin.token });
  log("GET /trucks", trucks.ok);

  const users = await req("GET", "/users?limit=20", { token: admin.token });
  log("GET /users", users.ok);

  const audits = await req("GET", "/admin/audit-logs?limit=5", { token: admin.token });
  log("GET /admin/audit-logs", audits.ok);

  const settings = await req("GET", "/admin/settings", { token: admin.token });
  log("GET /admin/settings", settings.ok);

  const reports = await req("GET", "/reports/summary", { token: admin.token });
  log("GET /reports/summary", reports.ok || reports.status === 404, `status=${reports.status}`);

  const testimonials = await req("GET", "/public/testimonials");
  log("GET /public/testimonials", testimonials.ok);

  // Known demo accounts used by thesis / local smoke (password: DEMO_PASSWORD)
  const customerLogin = await login(
    process.env.SMOKE_CUSTOMER || "thesis.customer.iv@gaarihel.test"
  );
  log("Customer login", Boolean(customerLogin.token), customerLogin.user?.role || customerLogin.data?.message);
  if (customerLogin.token) {
    const cTrips = await req("GET", "/trips?limit=5", { token: customerLogin.token });
    log("Customer GET /trips", cTrips.ok);
    const cNotif = await req("GET", "/notifications?limit=5", { token: customerLogin.token });
    log("Customer GET /notifications", cNotif.ok);
    const cPay = await req("GET", "/payments/waafi/config", { token: customerLogin.token });
    log("Customer GET /payments/waafi/config", cPay.ok);
  }

  const sharedLogin = await login(process.env.SMOKE_SHARED_DRIVER || "bahja12@gmail.com");
  log(
    "SHARED driver login",
    Boolean(sharedLogin.token),
    sharedLogin.user?.serviceType || sharedLogin.data?.message
  );
  if (sharedLogin.token) {
    const st = await req("GET", "/shared-trips?limit=5", { token: sharedLogin.token });
    log("SHARED driver GET /shared-trips", st.ok);
    const jobs = await req("GET", "/trips?limit=5", { token: sharedLogin.token });
    log("SHARED driver GET /trips", jobs.ok);
  }

  // Legacy /marketplace API removed — expect 404
  const market = await req("GET", "/marketplace/ftl", { token: admin.token });
  log("GET /marketplace/ftl removed", market.status === 404, `status=${market.status}`);

  const publicTrucks = await req("GET", "/public/trucks");
  log("GET /public/trucks removed", publicTrucks.status === 404, `status=${publicTrucks.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:");
    failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
