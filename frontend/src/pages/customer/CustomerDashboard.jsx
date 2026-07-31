import { Link } from "react-router-dom";
import {
  ChevronRight,
  CreditCard,
  MapPin,
  Package,
  Route,
  Star,
  Truck
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useDashboardSummary } from "../../hooks/useApi";
import { money } from "../../utils/helpers";
import { LazyFleetMap } from "../../components/map/LazyFleetMap";
import { useLanguage } from "../../contexts/LanguageContext";

export function CustomerDashboard() {
  const { t } = useLanguage();
  const { data: summary } = useDashboardSummary();
  const stats = summary?.stats;
  const shipments = summary?.recentTrips?.data || [];
  const active = shipments.filter((row) => !["Delivered", "Cancelled"].includes(row.status));
  const live = active[0];
  const needsFeedback = shipments.find((row) => row.status === "Delivered" && !row.feedback);

  const ACTIONS = [
    {
      to: "/customer/find-trucks",
      icon: Truck,
      title: t("customer.ftlBookTitle"),
      text: t("customer.ftlBookText"),
      tone: "bg-secondary-fixed text-on-secondary-fixed"
    },
    {
      to: "/customer/shared-marketplace",
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
      to: "/customer/tracking",
      icon: MapPin,
      title: t("customer.trackingTitle"),
      text: t("customer.trackingText"),
      tone: "bg-secondary-fixed text-on-secondary-fixed"
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition hover:border-secondary-container hover:shadow-md"
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${action.tone}`}>
                <Icon size={18} />
              </span>
              <p className="mt-3 font-semibold text-on-surface">{action.title}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{action.text}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-container">{t("customer.recentTrips")}</h2>
            <Link to="/customer/trips" className="text-sm font-semibold text-secondary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          <div className="space-y-3">
            {shipments.slice(0, 5).map((row) => (
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
            {!shipments.length && (
              <p className="py-6 text-center text-sm text-on-surface-variant">{t("common.noData")}</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <h2 className="mb-4 text-lg font-semibold text-primary-container">{t("customer.activeTracking")}</h2>
          {live ? (
            <div className="space-y-3">
              <p className="text-sm text-on-surface-variant">
                {live.id} · {live.pickup} → {live.destination}
              </p>
              <div className="h-56 overflow-hidden rounded-xl">
                <LazyFleetMap trips={[live]} />
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-on-surface-variant">{t("common.noData")}</p>
          )}
          {stats ? (
            <p className="mt-3 text-xs text-on-surface-variant">
              Active: {stats.activeTrips ?? active.length}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
