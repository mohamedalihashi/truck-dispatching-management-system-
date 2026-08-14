import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  MapPin,
  Package,
  Route,
  Star,
  Truck,
  Wallet
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { MetricCard } from "../../components/ui/MetricCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useDashboardSummary } from "../../hooks/useApi";
import { money } from "../../utils/helpers";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  buildMonthlyTripTrend,
  buildStatusDistribution
} from "../../components/dashboard/dashboardChartUtils";

const CustomerDashboardCharts = lazy(() =>
  import("../../components/dashboard/CustomerDashboardCharts").then((m) => ({
    default: m.CustomerDashboardCharts
  }))
);

function ChartsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-12" aria-hidden>
      <div className="h-80 animate-pulse rounded-xl bg-surface-container-low xl:col-span-7" />
      <div className="h-80 animate-pulse rounded-xl bg-surface-container-low xl:col-span-5" />
      <div className="h-72 animate-pulse rounded-xl bg-surface-container-low xl:col-span-12" />
    </div>
  );
}

export function CustomerDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data: summary } = useDashboardSummary();
  const stats = summary?.stats;
  const trips = (summary?.recentTrips?.data || []).filter(
    (row) => !user?.id || row.customerId === user.id
  );
  const active = trips.filter((row) => !["Delivered", "Cancelled"].includes(row.status));
  const live = active[0];
  const needsFeedback = trips.find((row) => row.status === "Delivered" && !row.feedback);

  const statusData = buildStatusDistribution(trips);
  const trendData = buildMonthlyTripTrend(trips);

  const ACTIONS = [
    {
      to: "/customer/find-trucks",
      icon: Truck,
      title: t("customer.ftlBookTitle"),
      text: t("customer.ftlBookText"),
      tone: "bg-secondary-fixed text-on-secondary-fixed"
    },
    {
      to: "/customer/shared-booking",
      icon: Package,
      title: t("customer.sharedBookTitle"),
      text: t("customer.sharedBookText"),
      tone: "bg-tertiary-fixed text-on-tertiary-fixed"
    },
    {
      to: "/customer/trips",
      icon: Route,
      title: t("customer.tripsTitle"),
      text: t("customer.tripsText"),
      tone: "bg-primary-fixed text-on-primary-fixed"
    },
    {
      to: "/customer/payments",
      icon: CreditCard,
      title: t("customer.paymentTitle"),
      text: t("customer.paymentText"),
      tone: "bg-tertiary-fixed text-on-tertiary-fixed"
    }
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("customer.dashboardTitle")}
        subtitle={t("customer.dashboardSubtitle")}
      />

      {needsFeedback && (
        <Link
          to="/customer/trips"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <Star size={18} className="shrink-0 fill-amber-400 text-amber-500" />
          <span>
            <strong>Trip {needsFeedback.id}</strong> {t("customer.rateDelivery")}
          </span>
          <ChevronRight className="ml-auto shrink-0" size={18} />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard
          icon={Route}
          label="Total trips"
          value={stats?.totalTrips ?? trips.length}
          tone="navy"
        />
        <MetricCard
          icon={MapPin}
          label="Active trips"
          value={stats?.liveTrips ?? active.length}
          tone="blue"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Delivered"
          value={stats?.completedOrders ?? 0}
          tone="green"
        />
        <MetricCard
          icon={Package}
          label="Pending requests"
          value={stats?.pendingOrders ?? 0}
          tone="soft"
        />
        <MetricCard
          icon={Wallet}
          label="Total spent"
          value={money(stats?.revenue ?? 0)}
          tone="orange"
        />
      </div>

      {live ? (
        <Link
          to="/customer/notifications"
          className="flex items-center gap-3 rounded-xl border border-secondary-container/30 bg-secondary-fixed/20 px-4 py-3 text-sm text-on-surface transition hover:border-secondary-container/50 hover:bg-secondary-fixed/35"
        >
          <Bell size={18} className="shrink-0 text-secondary-container" />
          <span>
            <strong>Trip {live.id}</strong> — {t("customer.tripStatusInNotifications")}
          </span>
          <ChevronRight className="ml-auto shrink-0 text-on-surface-variant" size={18} />
        </Link>
      ) : null}

      <Suspense fallback={<ChartsSkeleton />}>
        <CustomerDashboardCharts
          statusData={statusData}
          trendData={trendData}
          totalTrips={trips.length}
        />
      </Suspense>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="group rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_16px_rgba(0,0,0,0.04)] transition hover:border-secondary/40 hover:shadow-[0px_8px_24px_rgba(0,0,0,0.08)]"
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition group-hover:scale-105 ${action.tone}`}>
                <Icon size={18} />
              </span>
              <p className="mt-3 font-semibold text-on-surface">{action.title}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{action.text}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_16px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-container">{t("customer.recentTrips")}</h2>
            <Link to="/customer/trips" className="text-sm font-semibold text-secondary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          <div className="space-y-3">
            {trips.slice(0, 5).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{row.id}</p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {row.pickup} → {row.destination}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={row.status} />
                  <p className="mt-1 text-xs text-on-surface-variant">{money(row.fare)}</p>
                </div>
              </div>
            ))}
            {!trips.length && (
              <p className="py-6 text-center text-sm text-on-surface-variant">{t("common.noData")}</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_16px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-container">{t("customer.activeTrips")}</h2>
            <Link to="/customer/trips" className="text-sm font-semibold text-secondary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          <div className="space-y-3">
            {active.slice(0, 5).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{row.id}</p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {row.pickup} → {row.destination}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
            ))}
            {!active.length && (
              <p className="py-6 text-center text-sm text-on-surface-variant">{t("common.noData")}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
