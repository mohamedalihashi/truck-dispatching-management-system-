import {
  CheckCircle2,
  ChevronRight,
  Navigation,
  Package,
  Plus,
  Truck,
  Weight,
  Flag
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../contexts/AuthContext";
import { useDashboardSummary, useTripActions } from "../../hooks/useApi";
import { isSharedDriver, money, nextTripStatus } from "../../utils/helpers";
import { EmptyState } from "../../components/ui/EmptyState";
import { api } from "../../services/api";
import { LazyFleetMap } from "../../components/map/LazyFleetMap";
import { SharedTripJourney } from "../../components/SharedTripJourney";
import { FtlDriverJourney, FTL_DRIVER_ACTIONS } from "../../components/FtlDriverJourney";
import { useLanguage } from "../../contexts/LanguageContext";

export function DriverDashboard() {
  const { user } = useAuth();
  if (isSharedDriver(user)) return <SharedDriverDashboard user={user} />;
  return <FtlDriverDashboard user={user} />;
}

function SharedDriverDashboard({ user }) {
  const { t } = useLanguage();
  const firstName = (user?.name || "Driver").split(" ")[0];
  const { data: summary } = useQuery({
    queryKey: ["shared-trips-summary"],
    queryFn: () => api.sharedTripsSummary()
  });
  const { data: tripsData, isLoading } = useQuery({
    queryKey: ["my-shared-trips-dashboard"],
    queryFn: () => api.listMySharedTrips({ limit: 5 })
  });
  const trips = tripsData?.data || [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("driver.sharedDashboardTitle")}
        subtitle={t("Welcome back, {name}. Publish → book → pay full fare once before pickup → in transit → delivered.", {
          name: firstName
        })}
        actions={
          <Link to="/driver/shared-trips/new">
            <Button><Plus size={16} /> {t("driver.newSharedTrip")}</Button>
          </Link>
        }
      />

      <SharedTripJourney />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <CenterMetric icon={Package} tone="bg-primary-fixed-dim text-primary-container" value={summary?.total ?? 0} label="Total trips" />
        <CenterMetric icon={Truck} tone="bg-secondary-fixed text-on-secondary-fixed" value={summary?.open ?? 0} label="Open" />
        <CenterMetric icon={CheckCircle2} tone="bg-tertiary-fixed text-on-tertiary-fixed" value={summary?.full ?? 0} label="Full" />
        <CenterMetric icon={Navigation} tone="bg-secondary-container text-on-secondary" value={summary?.pickup ?? summary?.departed ?? 0} label="Pickup" />
        <CenterMetric icon={Navigation} tone="bg-secondary-fixed text-on-secondary-fixed" value={summary?.inTransit ?? 0} label="In Transit" />
        <CenterMetric icon={Flag} tone="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" value={summary?.delivered ?? summary?.completed ?? 0} label="Delivered" />
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">{t("Your shared trips")}</h2>
          <Link to="/driver/shared-trips" className="text-sm font-semibold text-secondary hover:underline">{t("View all")}</Link>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">{t("Loading trips…")}</p>
        ) : !trips.length ? (
          <EmptyState title="No shared trips yet" text="Create a trip with open capacity so customers can book by the ton." />
        ) : (
          <div className="divide-y divide-outline-variant">
            {trips.map((trip) => (
              <Link key={trip.id} to={`/driver/shared-trips/${trip.id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition hover:bg-surface-container-low">
                <div>
                  <p className="font-semibold text-on-surface">{trip.id}</p>
                  <p className="text-sm text-on-surface-variant">{trip.pickup} → {trip.destination}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-on-surface-variant"><Weight size={14} /> {trip.availableTons}t / {trip.totalCapacityTons}t</span>
                  <StatusBadge status={trip.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FtlDriverDashboard({ user }) {
  const { t } = useLanguage();
  const { data: summary } = useDashboardSummary();
  const stats = summary?.stats;
  const earnings = summary?.earnings;
  const actions = useTripActions();
  const jobs = summary?.recentTrips?.data || [];
  const active = jobs.filter((row) => !["Delivered", "Cancelled"].includes(row.status));
  const live = active[0];
  const firstName = (user?.name || "Driver").split(" ")[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Driver Dashboard"
        subtitle={t("Welcome back, {name}. Available loads, offers, trips, tracking, and earnings.", {
          name: firstName
        })}
      />

      <FtlDriverJourney status={live?.status} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FTL_DRIVER_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="group flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] transition hover:border-primary/40 hover:shadow-[0px_8px_24px_rgba(0,0,0,0.1)]"
            >
              <div className={`mb-4 w-fit rounded-lg p-2.5 ${action.tone}`}>
                <Icon size={22} />
              </div>
              <h2 className="text-base font-semibold text-primary-container">{t(action.title)}</h2>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-on-surface-variant">{t(action.text)}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-on-tertiary-container opacity-80 group-hover:opacity-100">
                {t("Open")} <ChevronRight size={14} />
              </span>
            </Link>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Active trips" value={active.length} />
        <Stat label="Delivered" value={stats?.completedOrders ?? 0} />
        <Stat label="Earnings available" value={money(earnings?.available ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-7">
          <div className="flex items-center justify-between border-b border-outline-variant px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-primary-container">Your trips</h2>
              <p className="text-xs text-on-surface-variant">After booking — until delivery ends</p>
            </div>
            <Link to="/driver/jobs" className="text-sm font-semibold text-secondary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-outline-variant">
            {jobs.slice(0, 5).map((trip) => (
              <div key={trip.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{trip.id}</p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {trip.pickup || "—"} → {trip.destination || "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={trip.status} />
                  {trip.status === "Assigned" ? (
                    <>
                      <Button className="px-3 py-1 text-xs" onClick={() => actions.accept.mutate(trip.id)}>Accept</Button>
                      <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => actions.reject.mutate(trip.id)}>Reject</Button>
                    </>
                  ) : null}
                  {active.some((t) => t.id === trip.id) && trip.status !== "Assigned" ? (
                    <Button
                      className="px-3 py-1 text-xs"
                      onClick={() => actions.updateStatus.mutate({ id: trip.id, status: nextTripStatus(trip.status) })}
                    >
                      Next: {nextTripStatus(trip.status)}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!jobs.length ? (
              <div className="px-6 py-10">
                <EmptyState
                  title="No trips yet"
                  text="Start with Available Loads — bid on an open FTL request."
                />
                <div className="mt-4 text-center">
                  <Link to="/driver/marketplace">
                    <Button><Package size={16} /> Available Loads</Button>
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-outline-variant px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-primary-container">Tracking</h2>
              <p className="text-xs text-on-surface-variant">Active load: {live?.id || "—"}</p>
            </div>
            <Link to="/driver/tracking" className="text-sm font-semibold text-secondary hover:underline">
              Open map
            </Link>
          </div>
          <div className="relative min-h-[260px] flex-1">
            <LazyFleetMap trips={live ? [live] : active} selectedId={live?.id} className="absolute inset-0 h-full w-full" />
          </div>
          <div className="border-t border-outline-variant bg-surface-container-low px-6 py-4 text-sm">
            {live ? (
              <p>
                <span className="font-semibold">{live.status}</span>
                <span className="text-on-surface-variant"> · {live.pickup} → {live.destination}</span>
              </p>
            ) : (
              <p className="text-on-surface-variant">No active load to track right now.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <article className="rounded-xl border border-outline-variant bg-surface-container-lowest px-5 py-4 shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
      <div className="text-2xl font-bold text-primary-container">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-on-surface-variant">{label}</div>
    </article>
  );
}

function CenterMetric({ icon: Icon, tone, value, label }) {
  const { t } = useLanguage();
  return (
    <article className="flex flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
      <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>
        <Icon size={28} />
      </div>
      <p className="text-[32px] font-bold leading-10 text-on-surface">{value}</p>
      <p className="text-sm font-semibold text-on-primary-container">{t(label)}</p>
    </article>
  );
}
