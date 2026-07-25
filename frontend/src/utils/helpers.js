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
  if (["delivered", "available", "paid", "accepted", "approved"].some((s) => key.includes(s))) return "success";
  if (["partial"].some((s) => key.includes(s))) return "info";
  if (["pending", "assigned", "delayed", "maintenance", "awaiting approval"].some((s) => key.includes(s))) return "warn";
  if (["cancelled", "failed", "rejected", "quote rejected"].some((s) => key.includes(s))) return "danger";
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
  "Assigned",
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
    case "dispatcher":
      return "/dispatcher";
    case "driver":
      return "/driver";
    case "customer":
    default:
      return "/customer";
  }
}

export function navForRole(role) {
  const support = { to: "support", label: "Support", icon: "help" };

  if (role === "admin") {
    return [
      { to: "", end: true, label: "Dashboard", icon: "dashboard" },
      { to: "requests", label: "Requests", icon: "file" },
      { to: "trips", label: "Trips", icon: "route" },
      { to: "tracking", label: "Live Tracking", icon: "map" },
      { to: "users", label: "Users", icon: "users" },
      { to: "trucks", label: "Fleet / Drivers", icon: "truck" },
      { to: "pricing", label: "Pricing", icon: "chart" },
      { to: "payments", label: "Finance", icon: "chart" },
      { to: "earnings", label: "Payouts", icon: "chart" },
      { to: "reports", label: "Reports", icon: "chart" },
      { to: "audit-logs", label: "Audit Logs", icon: "file" },
      { to: "support", label: "Support", icon: "help" },
      { to: "settings", label: "Settings", icon: "settings" }
    ];
  }
  if (role === "dispatcher") {
    return [
      { to: "", end: true, label: "Dashboard", icon: "dashboard" },
      { to: "trips", label: "Trips", icon: "route" },
      { to: "requests", label: "Requests", icon: "file" },
      { to: "customers", label: "Customers", icon: "users" },
      { to: "drivers", label: "Fleet / Drivers", icon: "truck" },
      { to: "tracking", label: "Live Tracking", icon: "map" },
      { to: "earnings", label: "Earnings", icon: "chart" },
      support
    ];
  }
  if (role === "driver") {
    return [
      { to: "", end: true, label: "Dashboard", icon: "dashboard" },
      { to: "jobs", label: "My Jobs", icon: "route" },
      { to: "truck", label: "My Truck", icon: "truck" },
      { to: "earnings", label: "Earnings", icon: "chart" },
      support
    ];
  }
  return [
    { to: "", end: true, label: "Dashboard", icon: "dashboard" },
    { to: "book", label: "Book Truck", icon: "plus" },
    { to: "shipments", label: "Shipments", icon: "package" },
    { to: "tracking", label: "Track", icon: "map" },
    { to: "payments", label: "Payments", icon: "chart" },
    support
  ];
}
