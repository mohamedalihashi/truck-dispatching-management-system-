import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Package,
  Plus,
  Route,
  Search,
  Settings,
  Truck,
  User,
  Users,
  X
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { usePermissions, useRealtimeInvalidation, useSettings } from "../hooks/useApi";
import { useDriverGpsTracking } from "../hooks/useDriverGpsTracking";
import { navForRole, roleHome, isSharedDriver } from "../utils/helpers";
import { resolveUploadUrl } from "../config/api.js";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ThemeToggle";
import { LanguageToggle } from "../components/LanguageToggle";
import { BrandLogo } from "../components/BrandLogo";
import { APP_NAME } from "../brand";
import { useLanguage } from "../contexts/LanguageContext";

const icons = {
  dashboard: LayoutDashboard,
  route: Route,
  bell: Bell,
  users: Users,
  truck: Truck,
  chart: BarChart3,
  settings: Settings,
  file: FileText,
  map: MapPin,
  plus: Plus,
  package: Package,
  message: MessageSquare,
  help: HelpCircle
};

const primaryLabelKeys = {
  customer: "common.ftlBook",
  driver: "common.availableLoads",
  admin: "common.addUser"
};

const navPermissions = {
  "": "dashboard",
  users: "users",
  drivers: "users",
  customers: "users",
  requests: "requests",
  trips: "trips",
  jobs: "trips",
  "shared-trips": "trips",
  truck: "trucks",
  trucks: "trucks",
  "find-trucks": "requests",
  book: "requests",
  "post-request": "requests",
  "shared-marketplace": "requests",
  shipments: "requests",
  marketplace: "requests",
  "my-bids": "requests",
  payments: "payments",
  earnings: "earnings",
  tracking: "tracking",
  reports: "reports",
  "audit-logs": "auditLogs",
  sms: "notifications",
  communication: "notifications",
  support: "notifications",
  settings: "settings",
  notifications: "notifications",
  profile: null
};

function canAccessNavItem(item, permissions, permissionsReady) {
  const key = navPermissions[item.to ?? ""];
  if (key == null) return true;
  if (!permissionsReady) return true;
  return permissions[key] === true;
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { data: settings } = useSettings({ enabled: user.role === "admin" });
  const { data: permissionData } = usePermissions();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useRealtimeInvalidation();
  const gps = useDriverGpsTracking();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const permissions = permissionData?.permissions || {};
  const permissionsReady = Boolean(permissionData?.permissions);
  const items = navForRole(user.role, user).filter((item) =>
    canAccessNavItem(item, permissions, permissionsReady)
  );
  const base = roleHome(user.role);
  const companyName = settings?.general?.companyName?.trim();
  const brand = user.role === "admin" ? (companyName || APP_NAME) : APP_NAME;
  const accountLabel = user.role === "admin" && companyName ? companyName : user.name;
  const avatarSrc = user.avatarUrl ? resolveUploadUrl(user.avatarUrl) : null;

  async function signOut() {
    await logout();
    navigate("/login");
  }

  function primaryAction() {
    if (user.role === "customer") navigate(`${base}/find-trucks`);
    else if (user.role === "admin") navigate(`${base}/users`, { state: { openCreate: true } });
    else if (user.role === "driver") {
      if (isSharedDriver(user)) navigate(`${base}/shared-trips/new`);
      else navigate(`${base}/marketplace`);
    } else navigate(`${base}/users`);
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(100%,272px)] flex-col overflow-hidden border-r shadow-xl transition-transform duration-300 lg:w-[248px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Brand */}
        <div className="app-sidebar-divider flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3.5">
          <button type="button" onClick={() => navigate(base)} className="flex min-w-0 items-center gap-2 text-left">
            <BrandLogo size="xs" linkToHome={false} className="max-h-9 max-w-[140px]" />
            {user.role === "admin" && companyName && companyName !== APP_NAME ? (
              <span className="block truncate text-xs font-semibold text-on-sidebar">{brand}</span>
            ) : null}
          </button>
          <button
            type="button"
            className="app-sidebar-link rounded-lg p-1.5 transition lg:hidden"
            onClick={() => setOpen(false)}
            aria-label={t("common.closeMenu")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="no-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <p className="app-sidebar-muted mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em]">
            {t("common.menu")}
          </p>
          {items.map((item, index) => {
            const Icon = icons[item.icon] || LayoutDashboard;
            const to = item.to ? `${base}/${item.to}` : base;
            const prevSection = items[index - 1]?.section;
            const showSection = item.section && item.section !== prevSection;
            return (
              <div key={to}>
                {showSection ? (
                  <p
                    className={`app-sidebar-muted px-3 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                      index === 0 ? "mb-2" : "mb-2 mt-4"
                    }`}
                  >
                    {item.section}
                  </p>
                ) : null}
                <NavLink
                  to={to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive ? "app-sidebar-link-active shadow-sm" : "app-sidebar-link"
                    }`
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="truncate">{t(item.labelKey || item.label)}</span>
                </NavLink>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="app-sidebar-divider shrink-0 space-y-2 border-t px-3 py-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {(
            (user.role === "admin" && permissions.users === true) ||
            (user.role === "driver" && permissions.trips === true)
          ) && (
            <Button className="h-9 w-full text-sm" onClick={primaryAction}>
              <Plus size={15} />
              {user.role === "driver" && isSharedDriver(user)
                ? t("common.newSharedTrip")
                : t(primaryLabelKeys[user.role] || "common.addUser")}
            </Button>
          )}

          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => navigate(`${base}/profile`)}
              className="flex min-w-0 items-center gap-2 rounded-md py-1 text-left transition hover:opacity-80"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary-container text-xs font-bold text-white">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  accountLabel?.charAt(0) || "U"
                )}
              </div>
              <span className="truncate text-xs font-medium text-on-sidebar">{accountLabel}</span>
            </button>
            <span
              className="app-sidebar-chip inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
              title={connected ? t("common.live") : t("common.reconnecting")}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`} />
              {connected ? t("common.live") : "…"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => navigate(`${base}/profile`)}
              className="app-sidebar-link flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition"
            >
              <User size={14} />
              {user.role === "driver" ? t("common.account") : t("common.profile")}
            </button>
            <button
              type="button"
              onClick={() => navigate(`${base}/support`)}
              className="app-sidebar-link flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition"
            >
              <HelpCircle size={14} />
              {user.role === "driver" ? t("common.helpCenter") : t("common.support")}
            </button>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="app-sidebar-outline flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition"
          >
            <LogOut size={14} />
            {t("common.signOut")}
          </button>

          {user.role === "driver" && gps.active ? (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              GPS live · {gps.trackingTripId}
            </p>
          ) : null}
          {user.role === "driver" && gps.error ? (
            <p className="mt-2 text-center text-[10px] font-medium text-amber-300">{gps.error}</p>
          ) : null}
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu overlay"
        />
      ) : null}

      <header className="fixed right-0 top-0 z-30 flex h-14 w-full items-center justify-between border-b border-outline-variant bg-surface-container-lowest/95 px-4 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-sm lg:left-[248px] lg:w-[calc(100%-248px)]">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="rounded-lg p-2 text-on-surface-variant transition hover:bg-secondary-fixed hover:text-secondary-container lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t("common.openMenu")}
          >
            <Menu size={20} />
          </button>
          <div className="relative min-w-0 flex-1 max-w-[11rem] sm:max-w-xs md:max-w-sm lg:max-w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={17} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-full border border-outline-variant bg-surface-container-low py-1.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-secondary-container/30"
              placeholder={t("common.search")}
              aria-label={t("common.search")}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <LanguageToggle compact />
          <ThemeToggle />
          {permissions.notifications === true && <button
            type="button"
            onClick={() => navigate(`${base}/notifications`)}
            className="relative rounded-full p-2 text-on-surface-variant transition hover:bg-secondary-fixed hover:text-secondary-container"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-secondary-container" />
          </button>}
          <div className="hidden h-7 w-px bg-outline-variant sm:block" />
          <button
            type="button"
            onClick={() => navigate(`${base}/profile`)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-secondary-fixed sm:pr-3"
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-secondary-container/40 bg-secondary-container text-xs font-bold text-white">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                user.name?.charAt(0) || "U"
              )}
            </div>
            <div className="hidden text-left sm:block">
              <p className="max-w-[120px] truncate text-sm font-semibold text-on-surface">{user.name}</p>
            </div>
          </button>
        </div>
      </header>

      <main className="min-h-screen px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-[calc(4.5rem+env(safe-area-inset-top))] lg:ml-[248px] lg:px-6 lg:pt-[5.5rem]">
        <div className="mx-auto max-w-[1400px]">
          {user.role === "driver" && gps.trackingTripId && gps.error ? (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              Live tracking needs location access on this phone. {gps.error}
            </div>
          ) : null}
          {user.role === "driver" && gps.active && !gps.error ? (
            <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100">
              Sharing live GPS for {gps.trackingTripId}
              {gps.lastSentAt ? ` · last sent ${gps.lastSentAt.toLocaleTimeString()}` : ""}. Keep this page open while driving.
            </div>
          ) : null}
          <Outlet context={{ search: debouncedSearch }} />
        </div>
      </main>
    </div>
  );
}
