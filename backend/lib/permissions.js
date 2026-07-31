const ALL = ["admin", "driver", "customer"];
export const PERMISSION_CATALOG = [
  { key: "dashboard", label: "Dashboard", roles: ALL },
  { key: "users", label: "Users and drivers", roles: ["admin"] },
  { key: "requests", label: "Cargo requests and quotes", roles: ALL },
  { key: "trips", label: "Trips and delivery workflow", roles: ALL },
  { key: "trucks", label: "Fleet and trucks", roles: ["admin", "driver"] },
  { key: "payments", label: "Payments and finance", roles: ["admin", "customer"] },
  { key: "earnings", label: "Earnings and payouts", roles: ["admin", "driver"] },
  { key: "tracking", label: "Live tracking", roles: ALL },
  { key: "reports", label: "Reports and analytics", roles: ["admin"] },
  { key: "auditLogs", label: "Audit logs", roles: ["admin"] },
  { key: "settings", label: "System settings", roles: ["admin"] },
  { key: "notifications", label: "Notifications", roles: ALL },
];

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: Object.fromEntries(PERMISSION_CATALOG.map(({ key }) => [key, true])),
  driver: {
    dashboard: true, users: false, requests: true, trips: true, trucks: true,
    payments: false, earnings: true, tracking: true, reports: false,
    auditLogs: false, settings: false, notifications: true,
  },
  customer: {
    dashboard: true, users: false, requests: true, trips: true, trucks: false,
    payments: true, earnings: false, tracking: true, reports: false,
    auditLogs: false, settings: false, notifications: true,
  },
};

export function mergeRolePermissions(value = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, defaults]) => [
      role,
      Object.fromEntries(PERMISSION_CATALOG.map(({ key, roles }) => [
        key,
        roles.includes(role) ? Boolean(value?.[role]?.[key] ?? defaults[key]) : false,
      ])),
    ])
  );
}
