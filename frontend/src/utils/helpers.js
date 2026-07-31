export function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
  if (["delivered", "available", "paid", "accepted", "approved", "confirmed", "completed", "open for booking"].some((s) => key.includes(s))) return "success";
  if (["partial"].some((s) => key.includes(s))) return "info";
  if (["pending", "assigned", "delayed", "maintenance", "awaiting approval", "draft", "departed", "in transit"].some((s) => key.includes(s))) return "warn";
  if (["cancelled", "failed", "rejected", "quote rejected", "withdrawn"].some((s) => key.includes(s))) return "danger";
  return "info";
}

export const REQUEST_STATUSES = [
  "Pending",
  "Awaiting Approval",
  "Quote Rejected",
  "Approved",
  "Assigned",
  "Accepted",
  "Arrived Pickup",
  "Loaded",
  "In Transit",
  "Delivered",
  "Cancelled"
];

export const CANCELABLE_REQUEST_STATUSES = [
  "Pending",
  "Awaiting Approval",
  "Quote Rejected",
  "Approved",
  "Assigned",
  "Accepted",
  "Arrived Pickup"
];

export const TRIP_FLOW = [
  "Pending",
  "Assigned",
  "Accepted",
  "Arrived Pickup",
  "Loaded",
  "In Transit",
  "Delivered"
];

export const TRIP_STATUSES = [...TRIP_FLOW, "Delayed", "Cancelled"];

/** Trip statuses where the driver phone should stream GPS to the server. */
export const LIVE_TRACKING_STATUSES = [
  "Accepted",
  "Arrived Pickup",
  "Loaded",
  "In Transit",
  "Delayed"
];

/** Trip statuses shown on the live tracking map. */
export const LIVE_MAP_STATUSES = [
  "Assigned",
  "Accepted",
  "Arrived Pickup",
  "Loaded",
  "In Transit",
  "Delayed"
];

export function driverTripActionLabel(status) {
  switch (status) {
    case "Assigned":
      return "Accept job";
    case "Accepted":
      return "Mark Picked Up";
    case "Arrived Pickup":
    case "Loaded":
      return "Mark In Transit";
    case "In Transit":
      return "Mark Delivered";
    default:
      return null;
  }
}

export function nextDriverTripStatus(current) {
  if (current === "Assigned") return "Accepted";
  if (current === "Accepted") return "Arrived Pickup";
  if (current === "Arrived Pickup" || current === "Loaded") return "In Transit";
  if (current === "In Transit") return "Delivered";
  return current;
}

export function nextTripStatus(current) {
  const idx = TRIP_FLOW.indexOf(current);
  if (idx < 0) return "Accepted";
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
      { to: "book", labelKey: "nav.phoneBookings", icon: "plus" },
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
        { to: "jobs", labelKey: "nav.bookings", icon: "package" },
        { to: "tracking", labelKey: "nav.liveTracking", icon: "map" },
        { to: "earnings", labelKey: "nav.earnings", icon: "chart" },
        { to: "truck", labelKey: "nav.truckProfile", icon: "truck" }
      ];
    }
    return [
      { to: "", end: true, labelKey: "nav.dashboard", icon: "dashboard" },
      { to: "marketplace", labelKey: "nav.availableLoads", icon: "package" },
      { to: "my-bids", labelKey: "nav.myOffers", icon: "file" },
      { to: "jobs", labelKey: "nav.ftlTrips", icon: "route" },
      { to: "tracking", labelKey: "nav.tracking", icon: "map" },
      { to: "earnings", labelKey: "nav.earnings", icon: "chart" },
      { to: "truck", labelKey: "nav.truckProfile", icon: "truck" }
    ];
  }
  return [
    { to: "", end: true, labelKey: "nav.dashboard", icon: "dashboard" },
    { to: "find-trucks", labelKey: "nav.ftlBook", icon: "truck" },
    { to: "shared-marketplace", labelKey: "nav.sharedBook", icon: "package" },
    { to: "trips", labelKey: "nav.trips", icon: "route" },
    { to: "tracking", labelKey: "nav.tracking", icon: "map" },
    { to: "payments", labelKey: "nav.payment", icon: "chart" }
  ];
}
