/** Full personal name: letters + spaces (e.g. "Cabdi Axmed Xaashi"). */
export const FULL_NAME_PATTERN = /^[\p{L}\p{M}]+(?:[\s'.-]+[\p{L}\p{M}]+)*$/u;

export function isValidFullName(value) {
  const name = String(value || "").trim();
  return name.length >= 2 && name.length <= 150 && FULL_NAME_PATTERN.test(name);
}

export function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Show fare only after Delivered (GPS distance locked when truck stops). */
export function fareAfterDelivered(status, value, { pendingLabel = "— (after Delivered)" } = {}) {
  const s = String(status || "").toLowerCase();
  if (!s.includes("delivered") && !s.includes("completed")) {
    return pendingLabel;
  }
  if (value == null || !(Number(value) > 0)) return "—";
  return money(value);
}

export function paymentBalance(row) {
  const amount = Number(row?.amount || 0);
  const paid = Number(row?.amountPaid || 0);
  return Math.max(0, amount - paid);
}

export function isPayablePayment(row) {
  return row && row.canPay !== false && ["Pending", "Partial", "Failed"].includes(row.status) && paymentBalance(row) > 0;
}

export function titleCase(value = "") {
  return String(value).replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export function statusTone(status = "") {
  const key = status.toLowerCase();
  if (["delivered", "available", "paid", "approved", "confirmed", "completed", "open for booking", "picked up"].some((s) => key.includes(s))) return "success";
  if (["partial", "near destination", "en route"].some((s) => key.includes(s))) return "info";
  if (["pending", "assigned", "maintenance", "awaiting approval", "draft", "departed", "in transit", "arrived"].some((s) => key.includes(s))) return "warn";
  if (["cancelled", "failed", "rejected", "quote rejected", "withdrawn"].some((s) => key.includes(s))) return "danger";
  return "info";
}

export const REQUEST_STATUSES = [
  "Pending",
  "Awaiting Approval",
  "Quote Rejected",
  "Approved",
  "Assigned",
  "En Route to Pickup",
  "Arrived at Pickup",
  "Picked Up",
  "In Transit",
  "Near Destination",
  "Delivered",
  "Cancelled"
];

export const CANCELABLE_REQUEST_STATUSES = [
  "Pending",
  "Awaiting Approval",
  "Quote Rejected",
  "Approved",
  "Assigned",
  "En Route to Pickup",
  "Arrived at Pickup"
];

export const TRIP_FLOW = [
  "Assigned",
  "En Route to Pickup",
  "Arrived at Pickup",
  "Picked Up",
  "In Transit",
  "Near Destination",
  "Delivered"
];

export const TRIP_STATUSES = ["Pending", ...TRIP_FLOW, "Cancelled"];

/** Driver phone streams GPS during these statuses (used for per-km billing). */
export const LIVE_TRACKING_STATUSES = [
  "Assigned",
  "En Route to Pickup",
  "Arrived at Pickup",
  "Picked Up",
  "In Transit",
  "Near Destination"
];

/** Trip statuses shown on the live tracking map. */
export const LIVE_MAP_STATUSES = [
  "Assigned",
  ...LIVE_TRACKING_STATUSES
];

export function driverTripActionLabel(status) {
  switch (status) {
    case "Assigned":
      return "Start — En Route to Pickup";
    case "En Route to Pickup":
      return "Mark Arrived at Pickup";
    case "Arrived at Pickup":
      return "Mark Picked Up";
    case "Picked Up":
      return "Mark In Transit";
    case "In Transit":
      return "Mark Near Destination";
    case "Near Destination":
      return "Mark Delivered";
    default:
      return null;
  }
}

export function nextDriverTripStatus(current) {
  const idx = TRIP_FLOW.indexOf(current);
  if (idx < 0 || idx >= TRIP_FLOW.length - 1) return current;
  return TRIP_FLOW[idx + 1];
}

export function nextTripStatus(current) {
  if (current === "Pending") return "Assigned";
  const idx = TRIP_FLOW.indexOf(current);
  if (idx < 0) return "En Route to Pickup";
  return TRIP_FLOW[Math.min(idx + 1, TRIP_FLOW.length - 1)];
}

export function roleHome(role) {
  switch (role) {
    case "admin":
      return "/admin";
    case "driver":
      return "/driver";
    case "customer":
    default:
      return "/customer";
  }
}

export function isSharedDriver(user) {
  return user?.serviceType === "SHARED";
}

export function isFtlDriver(user) {
  return !user || user.serviceType !== "SHARED";
}

export function navForRole(role, user = null) {
  if (role === "admin") {
    return [
      { to: "", end: true, labelKey: "nav.dashboard", icon: "dashboard" },
      { to: "requests", labelKey: "nav.cargoRequests", icon: "package" },
      { to: "shared-trips", labelKey: "nav.sharedTrips", icon: "route" },
      { to: "trips", labelKey: "nav.trips", icon: "route" },
      { to: "tracking", labelKey: "nav.liveTracking", icon: "map" },
      { to: "users", labelKey: "nav.users", icon: "users" },
      { to: "customers", labelKey: "nav.customers", icon: "users" },
      { to: "trucks", labelKey: "nav.fleetDrivers", icon: "truck" },
      { to: "payments", labelKey: "nav.payments", icon: "chart" },
      { to: "earnings", labelKey: "nav.payouts", icon: "chart" },
      { to: "reports", labelKey: "nav.reports", icon: "chart", end: true },
      { to: "audit-logs", labelKey: "nav.auditLogs", icon: "file" },
      { to: "support", labelKey: "nav.support", icon: "help" },
      { to: "settings", labelKey: "nav.settings", icon: "settings" }
    ];
  }
  if (role === "driver") {
    if (isSharedDriver(user)) {
      return [
        { to: "", end: true, labelKey: "nav.dashboard", icon: "dashboard" },
        { to: "shared-trips", labelKey: "nav.sharedTrips", icon: "route" },
        { to: "earnings", labelKey: "nav.earnings", icon: "chart" },
        { to: "truck", labelKey: "nav.truckProfile", icon: "truck" }
      ];
    }
    return [
      { to: "", end: true, labelKey: "nav.dashboard", icon: "dashboard" },
      { to: "jobs", labelKey: "nav.ftlTrips", icon: "route" },
      { to: "tracking", labelKey: "nav.liveTracking", icon: "map" },
      { to: "earnings", labelKey: "nav.earnings", icon: "chart" },
      { to: "truck", labelKey: "nav.truckProfile", icon: "truck" }
    ];
  }
  return [
    { to: "", end: true, labelKey: "nav.dashboard", icon: "dashboard" },
    { to: "find-trucks", labelKey: "nav.ftlBook", icon: "truck" },
    { to: "shared-booking", labelKey: "nav.sharedBook", icon: "package" },
    { to: "trips", labelKey: "nav.trips", icon: "route" },
    { to: "tracking", labelKey: "nav.liveTracking", icon: "map" },
    { to: "notifications", labelKey: "nav.notifications", icon: "notifications" },
    { to: "payments", labelKey: "nav.payment", icon: "chart" },
    { to: "support", labelKey: "nav.support", icon: "help" },
    { to: "profile", labelKey: "nav.profile", icon: "users" }
  ];
}
