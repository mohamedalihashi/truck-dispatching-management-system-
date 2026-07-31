import { useState } from "react";
import { Filter, LocateFixed, Maximize2, Radio, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { LazyFleetMap } from "../../components/map/LazyFleetMap";
import { useTripActions, useTripRoute, useTrips } from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { LIVE_MAP_STATUSES, nextTripStatus, roleHome } from "../../utils/helpers";
import { matchSomaliaCity, resolveTripMapPosition } from "../../utils/geo";

const LIVE_POLL_MS = 15_000;

export function TrackingPage() {
  const { user } = useAuth();
  const { data, dataUpdatedAt, refetch, isFetching } = useTrips(
    {},
    { refetchInterval: LIVE_POLL_MS, refetchIntervalInBackground: false }
  );
  const actions = useTripActions();
  const [selectedId, setSelectedId] = useState(null);
  const canManage = user.role === "admin";
  const base = roleHome(user.role);
  const live = (data?.data || []).filter((trip) => LIVE_MAP_STATUSES.includes(trip.status));
  const liveGpsCount = live.filter((trip) => resolveTripMapPosition(trip).live).length;
  const selected = live.find((t) => t.id === selectedId) || live[0] || null;
  const { data: routeData } = useTripRoute(selected?.id, { refetchInterval: LIVE_POLL_MS });
  const routePoints = routeData?.points || [];
  const destinationPoint = selected
    ? matchSomaliaCity(selected.destination) || matchSomaliaCity(selected.pickup)
    : null;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  async function updateStatus(trip, status) {
    try {
      await actions.updateStatus.mutateAsync({ id: trip.id, status });
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={user.role === "customer" ? "Tracking" : "Tracking"}
        subtitle={
          user.role === "customer"
            ? "Live location for your active trips until delivery."
            : user.role === "driver"
              ? "Step 4 — share live location while the load is on the road."
              : "Realtime trip positions and admin status controls."
        }
        actions={
          canManage ? (
            <Link to={`${base}/trips`}>
              <Button variant="secondary">All trips</Button>
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Radio size={14} className={isFetching ? "animate-pulse" : ""} />
          Live · updates every {LIVE_POLL_MS / 1000}s
        </span>
        <span>Last sync: {lastUpdated}</span>
        <span>{liveGpsCount} live GPS · {live.length - liveGpsCount} estimated on map</span>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-8">
          <div className="flex items-center justify-between border-b border-outline-variant px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-on-surface">Fleet Map — Somalia</h2>
              <p className="text-xs text-on-surface-variant">{live.length} active loads on corridor</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low"
                title="Refresh map"
              >
                <LocateFixed size={18} />
              </button>
              <button type="button" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low">
                <Filter size={18} />
              </button>
              <button type="button" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low">
                <Maximize2 size={18} />
              </button>
            </div>
          </div>
          <div className="relative min-h-[480px] flex-1">
            <LazyFleetMap
              trips={live}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              routePoints={routePoints}
              destinationPoint={destinationPoint}
              className="absolute inset-0 h-full w-full"
            />
            <div className="pointer-events-none absolute inset-x-4 bottom-4 grid gap-3 sm:grid-cols-2">
              {live.slice(0, 4).map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => setSelectedId(trip.id)}
                  className={`pointer-events-auto rounded-xl border p-4 text-left text-white backdrop-blur transition ${
                    selected?.id === trip.id
                      ? "border-secondary-container bg-primary-container"
                      : "border-white/20 bg-primary-container/80"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <strong className="text-sm tracking-wide">{trip.id}</strong>
                    <LocateFixed size={16} className="text-secondary-fixed-dim" />
                  </div>
                  <p className="text-sm text-on-primary-container">
                    {trip.pickup} → {trip.destination}
                  </p>
                  <p className="mt-2 text-xs text-on-primary-container/80">
                    {resolveTripMapPosition(trip).live
                      ? `Live GPS · ${Number(trip.lastLocation.lat).toFixed(4)}, ${Number(trip.lastLocation.lng).toFixed(4)}`
                      : trip.lastLocation
                        ? `Last GPS · ${Number(trip.lastLocation.lat).toFixed(4)}, ${Number(trip.lastLocation.lng).toFixed(4)}`
                        : `${trip.pickup} area (estimated — waiting for driver GPS)`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="col-span-12 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-4">
          <div className="border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-on-surface">Active Trips</h2>
          </div>
          <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
            {live.map((trip) => (
              <article
                key={trip.id}
                className={`cursor-pointer rounded-lg border p-4 transition ${
                  selected?.id === trip.id
                    ? "border-secondary-container bg-secondary-fixed/20"
                    : "border-outline-variant hover:bg-surface-container-low"
                }`}
                onClick={() => setSelectedId(trip.id)}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary-container">
                    <Truck size={16} className="text-secondary-container" />
                    {trip.id}
                  </div>
                  <StatusBadge status={trip.status} />
                </div>
                <p className="text-sm text-on-surface-variant">
                  {trip.driver || "Unassigned"} · {trip.truck || "No truck"}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {trip.pickup} → {trip.destination}
                </p>
                {trip.lastLocation ? (
                  <p className="mt-1 text-xs text-on-surface-variant">
                    GPS: {Number(trip.lastLocation.lat).toFixed(4)}, {Number(trip.lastLocation.lng).toFixed(4)}
                    {trip.lastLocation.updatedAt
                      ? ` · ${new Date(trip.lastLocation.updatedAt).toLocaleTimeString()}`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Waiting for driver GPS signal</p>
                )}
                {trip.eta?.label ? (
                  <p className="mt-1 text-xs font-medium text-secondary-container">
                    ETA destination: {trip.eta.label} · {trip.eta.distanceKm} km
                  </p>
                ) : null}
                {canManage && (
                  <div className="mt-3 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button className="px-2 py-1 text-xs" onClick={() => updateStatus(trip, nextTripStatus(trip.status))}>
                      Advance
                    </Button>
                    {trip.status !== "Delayed" && (
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => updateStatus(trip, "Delayed")}>
                        Delayed
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {!live.length && (
              <p className="px-2 py-10 text-center text-sm text-on-surface-variant">No live trips right now.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
