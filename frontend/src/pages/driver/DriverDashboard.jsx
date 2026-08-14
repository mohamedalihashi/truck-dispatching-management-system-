import { lazy, Suspense, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Flag,
  Navigation,
  Package,
  Star,
  Truck,
  Wallet,
  Weight
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { MetricCard } from "../../components/ui/MetricCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useAuth } from "../../contexts/AuthContext";
import { useDashboardSummary, useTripActions } from "../../hooks/useApi";
import { isSharedDriver, money, fareAfterDelivered, nextTripStatus } from "../../utils/helpers";
import { EmptyState } from "../../components/ui/EmptyState";
import { api } from "../../services/api";
import { SharedTripJourney } from "../../components/SharedTripJourney";
import { SharedTripDecision } from "../../components/SharedTripDecision";
import { FTL_DRIVER_ACTIONS } from "../../components/FtlDriverJourney";
import { AssignedTripDecision } from "../../components/AssignedTripDecision";
import { PickupWeightModal } from "../../components/PickupWeightModal";
import { DeliveryProofModal } from "../../components/DeliveryProofModal";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  buildMonthlyTripTrend,
  buildNamedCounts,
  buildStatusDistribution
} from "../../components/dashboard/dashboardChartUtils";

const DriverDashboardCharts = lazy(() =>
  import("../../components/dashboard/DriverDashboardCharts").then((m) => ({
    default: m.DriverDashboardCharts
  }))
);

function ChartsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-12" aria-hidden>
      <div className="h-80 animate-pulse rounded-xl bg-surface-container-low xl:col-span-7" />
      <div className="h-80 animate-pulse rounded-xl bg-surface-container-low xl:col-span-5" />
      <div className="h-64 animate-pulse rounded-xl bg-surface-container-low xl:col-span-12" />
    </div>
  );
}

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
    queryFn: () => api.listMySharedTrips({ limit: 50 })
  });
  const trips = tripsData?.data || [];
  const awaitingAccept = trips.filter((trip) => trip.status === "Assigned");

  const statusData = buildNamedCounts([
    ["Assigned", summary?.assigned],
    ["Open", summary?.open],
    ["Full", summary?.full],
    ["Pickup", summary?.pickup ?? summary?.departed],
    ["In Transit", summary?.inTransit],
    ["Delivered", summary?.delivered ?? summary?.completed]
  ]);
  const trendData = buildMonthlyTripTrend(
    trips.map((trip) => ({
      ...trip,
      status: trip.status === "Delivered" || trip.status === "Completed" ? "Delivered" : trip.status
    }))
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("driver.sharedDashboardTitle")}
        subtitle={t("Welcome back, {name}. Admin assigns shared loads as one job — Accept once, then gather → pickup → Delivered.", {
          name: firstName
        })}
      />

      <SharedTripJourney />

      {awaitingAccept.length ? (
        <section className="space-y-3">
          {awaitingAccept.map((trip) => (
            <div
              key={trip.id}
              className="rounded-xl border border-secondary-container/40 bg-secondary-fixed/25 p-5"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    New shared job — Accept once
                  </p>
                  <p className="text-lg font-bold text-primary-container">{trip.id}</p>
                  <p className="text-sm text-on-surface-variant">
                    {trip.pickup} → {trip.destination} · {trip.bookingsCount} load(s)
                  </p>
                </div>
                <StatusBadge status={trip.status} />
              </div>
              <SharedTripDecision trip={trip} />
              <Link
                to={`/driver/shared-trips/${trip.id}`}
                className="mt-3 inline-block text-sm font-semibold text-secondary hover:underline"
              >
                View details
              </Link>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <MetricCard icon={Package} label="Total trips" value={summary?.total ?? 0} tone="orange" />
        <MetricCard icon={Truck} label="Awaiting accept" value={summary?.assigned ?? 0} tone="soft" />
        <MetricCard icon={CheckCircle2} label="Full" value={summary?.full ?? 0} tone="blue" />
        <MetricCard icon={Navigation} label="Pickup" value={summary?.pickup ?? summary?.departed ?? 0} tone="navy" />
        <MetricCard icon={Navigation} label="In Transit" value={summary?.inTransit ?? 0} tone="amber" />
        <MetricCard
          icon={Flag}
          label="Delivered"
          value={summary?.delivered ?? summary?.completed ?? 0}
          tone="green"
        />
      </div>

      <Suspense fallback={<ChartsSkeleton />}>
        <DriverDashboardCharts
          variant="shared"
          statusData={statusData}
          trendData={trendData}
          totalTrips={summary?.total ?? trips.length}
        />
      </Suspense>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-5">
          <h2 className="text-xl font-semibold text-primary-container">{t("Your shared trips")}</h2>
          <Link to="/driver/shared-trips" className="text-sm font-semibold text-secondary hover:underline">{t("View all")}</Link>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">{t("Loading trips…")}</p>
        ) : !trips.length ? (
          <EmptyState title="No shared trips yet" text="Admin will assign SHARED loads to your truck from Shared Loads." />
        ) : (
          <div className="divide-y divide-outline-variant">
            {trips.slice(0, 5).map((trip) => (
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
  const { gps = {} } = useOutletContext() || {};
  const { data: summary } = useDashboardSummary();
  const stats = summary?.stats;
  const earnings = summary?.earnings;
  const feedbackSummary = summary?.feedbackSummary;
  const actions = useTripActions();
  const jobs = summary?.recentTrips?.data || [];
  const active = jobs.filter((row) => !["Delivered", "Cancelled"].includes(row.status));
  const liveTrip = active[0] ?? null;
  const firstName = (user?.name || "Driver").split(" ")[0];
  const [pickupTrip, setPickupTrip] = useState(null);
  const [deliverTrip, setDeliverTrip] = useState(null);

  const statusData = buildStatusDistribution(jobs);
  const trendData = buildMonthlyTripTrend(jobs);
  const earningsData = [
    { name: "Available", value: Number(earnings?.available ?? 0) },
    { name: "Paid out", value: Number(earnings?.paidOut ?? 0) }
  ];

  async function advanceTrip(trip) {
    const next = nextTripStatus(trip.status);
    if (next === "Picked Up") {
      setPickupTrip(trip);
      return;
    }
    if (next === "Delivered") {
      setDeliverTrip(trip);
      return;
    }
    try {
      await actions.updateStatus.mutateAsync({ id: trip.id, status: next });
    } catch (err) {
      alert(err.message || "Could not update trip status");
    }
  }

  async function confirmPickupWeight(payload) {
    try {
      await actions.updateStatus.mutateAsync(payload);
      setPickupTrip(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function confirmDelivered(payload) {
    await actions.updateStatus.mutateAsync(payload);
    setDeliverTrip(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Driver Dashboard"
        subtitle={t("Welcome back, {name}. Admin assigns jobs — Accept or Reject, then run the trip. Customer pays 100% after Delivered.", {
          name: firstName
        })}
      />

      {liveTrip ? (
        <div className="rounded-xl border border-secondary-container/30 bg-secondary-fixed/20 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Active trip</p>
              <p className="text-lg font-bold text-primary-container">{liveTrip.id}</p>
              <p className="text-sm text-on-surface-variant">{liveTrip.pickup} → {liveTrip.destination}</p>
            </div>
            <StatusBadge status={liveTrip.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {gps.active && !gps.error ? (
              <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                <Navigation size={14} />
                {gps.distanceTraveledKm != null ? `${gps.distanceTraveledKm} km traveled` : "GPS active"}
              </span>
            ) : gps.error ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">{gps.error}</span>
            ) : null}
            <span className="text-on-surface-variant">
              Fare: <strong>{fareAfterDelivered(liveTrip.status, liveTrip.fare)}</strong>
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {liveTrip.status === "Assigned" ? (
              <AssignedTripDecision trip={liveTrip} compact />
            ) : (
              <Button className="px-3 py-1.5 text-sm" onClick={() => advanceTrip(liveTrip)}>
                Next: {nextTripStatus(liveTrip.status)}
              </Button>
            )}
            <Link to="/driver/tracking">
              <Button variant="secondary" className="px-3 py-1.5 text-sm">Live tracking</Button>
            </Link>
            <Link to="/driver/jobs">
              <Button variant="secondary" className="px-3 py-1.5 text-sm">View all jobs</Button>
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard icon={Package} label="Total trips" value={stats?.totalTrips ?? jobs.length} tone="navy" />
        <MetricCard icon={Navigation} label="Active trips" value={active.length} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Delivered" value={stats?.completedOrders ?? 0} tone="green" />
        <MetricCard icon={Wallet} label="Earnings available" value={money(earnings?.available ?? 0)} tone="orange" />
        <MetricCard
          icon={Star}
          label="Avg rating"
          value={feedbackSummary?.avgRating != null ? feedbackSummary.avgRating : "—"}
          hint={feedbackSummary?.count ? `${feedbackSummary.count} reviews` : undefined}
          tone="amber"
        />
      </div>

      <Suspense fallback={<ChartsSkeleton />}>
        <DriverDashboardCharts
          statusData={statusData}
          trendData={trendData}
          earningsData={earningsData}
          totalTrips={jobs.length}
        />
      </Suspense>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FTL_DRIVER_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="group flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(0,0,0,0.05)] transition hover:border-primary/40 hover:shadow-[0px_8px_24px_rgba(0,0,0,0.1)]"
            >
              <div className={`mb-4 w-fit rounded-lg p-2.5 transition group-hover:scale-105 ${action.tone}`}>
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

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-primary-container">Your trips</h2>
            <p className="text-xs text-on-surface-variant">From admin assignment through delivery</p>
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
                  <AssignedTripDecision trip={trip} compact />
                ) : null}
                {active.some((t) => t.id === trip.id) && trip.status !== "Assigned" ? (
                  <Button
                    className="px-3 py-1 text-xs"
                    onClick={() => advanceTrip(trip)}
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
                text="Wait for an admin to assign you a job."
              />
              <div className="mt-4 text-center">
                <Link to="/driver/jobs">
                  <Button><Package size={16} /> Assigned Jobs</Button>
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <PickupWeightModal
        trip={pickupTrip}
        open={Boolean(pickupTrip)}
        onClose={() => setPickupTrip(null)}
        onConfirm={confirmPickupWeight}
        pending={actions.updateStatus.isPending}
      />

      <DeliveryProofModal
        trip={deliverTrip}
        open={Boolean(deliverTrip)}
        onClose={() => setDeliverTrip(null)}
        onDelivered={confirmDelivered}
        pending={actions.updateStatus.isPending}
      />
    </div>
  );
}
