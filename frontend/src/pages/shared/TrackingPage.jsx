import { useEffect, useMemo, useState } from "react";
import { LocateFixed, Radio, Search, Truck } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { FleetMap } from "../../components/map/FleetMap";
import { TripReplayModal } from "../../components/map/TripReplayModal";
import {
  useLiveFleet,
  useTripActions,
  useTripEvents,
  useTripRoute,
  useTrips,
} from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { LIVE_MAP_STATUSES, nextTripStatus, roleHome } from "../../utils/helpers";
import { matchSomaliaCity, resolveTripMapPosition } from "../../utils/geo";
import { useLanguage } from "../../contexts/LanguageContext";

const LIVE_POLL_MS = 5_000;

function gpsBadgeClass(status) {
  switch (status) {
    case "MOVING":
      return "bg-emerald-100 text-emerald-800";
    case "IDLE":
      return "bg-amber-100 text-amber-900";
    case "ONLINE":
      return "bg-sky-100 text-sky-900";
    default:
      return "bg-rose-100 text-rose-900";
  }
}

function formatEta(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return "—";
  const m = Math.max(0, Math.round(Number(minutes)));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  return `${h}h ${rem}m`;
}

export function TrackingPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const outlet = useOutletContext() || {};
  const layoutSearch = String(outlet.search || "").trim();
  const canManage = user.role === "admin";
  const base = roleHome(user.role);

  const tripsQuery = useTrips({}, { refetchInterval: LIVE_POLL_MS });
  const fleetQuery = useLiveFleet(
    {},
    { enabled: canManage, refetchInterval: canManage ? LIVE_POLL_MS : false }
  );
  const actions = useTripActions();

  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [gpsFilter, setGpsFilter] = useState("ALL");
  const [replayTripId, setReplayTripId] = useState(null);

  // Sync top dashboard search bar → fleet search (when user types in header).
  useEffect(() => {
    if (layoutSearch !== undefined) setSearch(layoutSearch);
  }, [layoutSearch]);

  const allActive = (tripsQuery.data?.data || []).filter((trip) =>
    LIVE_MAP_STATUSES.includes(trip.status)
  );
  const liveTrips = allActive.filter((trip) => resolveTripMapPosition(trip).live);

  const fleetRows = fleetQuery.data?.data || [];
  const summary = fleetQuery.data?.summary || {
    totalTrucks: 0,
    online: 0,
    moving: 0,
    idle: 0,
    offline: 0,
    activeTrips: 0,
  };

  const filteredFleet = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fleetRows.filter((row) => {
      const status = String(row.gpsStatus || "OFFLINE").toUpperCase();
      if (gpsFilter === "ONLINE") {
        if (status !== "MOVING" && status !== "IDLE") return false;
      } else if (gpsFilter !== "ALL" && status !== gpsFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        row.truckNumber,
        row.plateNumber,
        row.driver,
        row.activeTrip?.id,
        row.activeTrip?.pickup,
        row.activeTrip?.destination,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [fleetRows, search, gpsFilter]);

  // Map markers always follow the filtered list (never fall back to unfiltered trips).
  const mapTrips = useMemo(() => {
    if (!canManage) return liveTrips;
    return filteredFleet
      .filter((t) => t.lastLocation?.lat != null && t.lastLocation?.lng != null)
      .map((truck) => ({
        id: truck.activeTrip?.id || truck.id,
        truckNumber: truck.truckNumber,
        truck: truck.truckNumber,
        driver: truck.driver,
        pickup: truck.activeTrip?.pickup,
        destination: truck.activeTrip?.destination,
        status: truck.activeTrip?.status || truck.status,
        gpsStatus: truck.gpsStatus,
        lastSeenLabel: truck.lastSeenLabel,
        lastLocation: {
          ...truck.lastLocation,
          speedKmh: truck.lastLocation?.speedKmh,
        },
        distanceTraveledKm: truck.activeTrip?.distanceTraveledKm,
        progress: truck.activeTrip?.progress,
        plateNumber: truck.plateNumber,
        _truckId: truck.id,
      }));
  }, [canManage, filteredFleet, liveTrips]);

  // Keep selection inside the current filter results.
  useEffect(() => {
    if (!canManage) return;
    const stillVisible = filteredFleet.some(
      (t) => t.id === selectedId || t.activeTrip?.id === selectedId
    );
    if (!stillVisible) {
      const first = filteredFleet[0];
      setSelectedId(first?.activeTrip?.id || first?.id || null);
    }
  }, [canManage, filteredFleet, selectedId]);

  const selected =
    (canManage
      ? mapTrips.find((trip) => trip.id === selectedId || trip._truckId === selectedId) ||
        filteredFleet
          .filter((t) => t.id === selectedId || t.activeTrip?.id === selectedId)
          .map((truck) => ({
            id: truck.activeTrip?.id || truck.id,
            truckNumber: truck.truckNumber,
            truck: truck.truckNumber,
            driver: truck.driver,
            pickup: truck.activeTrip?.pickup,
            destination: truck.activeTrip?.destination,
            status: truck.activeTrip?.status,
            gpsStatus: truck.gpsStatus,
            lastSeenLabel: truck.lastSeenLabel,
            lastLocation: truck.lastLocation,
            progress: truck.activeTrip?.progress,
            _truckId: truck.id,
          }))[0]
      : null) ||
    mapTrips.find((trip) => trip.id === selectedId) ||
    mapTrips[0] ||
    null;

  const selectedFleet =
    canManage && selected
      ? fleetRows.find(
          (t) => t.id === selected._truckId || t.activeTrip?.id === selected.id || t.id === selectedId
        ) || null
      : null;

  const routeTripId = selected?.activeTrip?.id || (selected?.pickup ? selected.id : null);
  const { data: routeData } = useTripRoute(routeTripId, {
    enabled: Boolean(routeTripId),
    refetchInterval: LIVE_POLL_MS,
  });
  const { data: eventsData } = useTripEvents(routeTripId, {
    enabled: canManage && Boolean(routeTripId),
    refetchInterval: 15_000,
  });

  const routePoints = routeData?.points || [];
  const destinationPoint = selected
    ? matchSomaliaCity(selected.destination) || matchSomaliaCity(selected.pickup)
    : null;
  const progress = selectedFleet?.activeTrip?.progress || selected?.progress || null;
  const lastUpdated = (canManage ? fleetQuery.dataUpdatedAt : tripsQuery.dataUpdatedAt)
    ? new Date(canManage ? fleetQuery.dataUpdatedAt : tripsQuery.dataUpdatedAt).toLocaleTimeString()
    : "—";

  async function updateStatus(trip, status) {
    try {
      await actions.updateStatus.mutateAsync({ id: trip.id, status });
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.liveTracking")}
        subtitle={
          canManage
            ? "Live fleet map — GPS status, speed, ETA, route history & replay."
            : user.role === "customer"
              ? t("Track your active shipments across Somalia in real time.")
              : t("Realtime trip positions and status controls.")
        }
        actions={
          canManage ? (
            <Link to={`${base}/trips`}>
              <Button variant="secondary">{t("nav.trips")}</Button>
            </Link>
          ) : null
        }
      />

      {canManage ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total trucks", value: summary.totalTrucks, filter: "ALL" },
            { label: "Online", value: summary.online, filter: "ONLINE" },
            { label: "Moving", value: summary.moving, filter: "MOVING" },
            { label: "Idle", value: summary.idle, filter: "IDLE" },
            { label: "Offline", value: summary.offline, filter: "OFFLINE" },
            { label: "Active trips", value: summary.activeTrips, filter: "ACTIVE" },
          ].map((card) => {
            const active =
              card.filter === "ACTIVE" ? false : gpsFilter === card.filter;
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => {
                  if (card.filter === "ACTIVE") setGpsFilter("ALL");
                  else setGpsFilter(card.filter);
                }}
                className={`rounded-xl border px-4 py-3 text-left shadow-sm transition ${
                  active
                    ? "border-secondary-container bg-secondary-fixed/30"
                    : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                }`}
              >
                <p className="text-xs text-on-surface-variant">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold text-primary-container">{card.value}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
          <Radio size={14} className={tripsQuery.isFetching || fleetQuery.isFetching ? "animate-pulse" : ""} />
          Live · Socket + {LIVE_POLL_MS / 1000}s refresh
        </span>
        <span>Last sync: {lastUpdated}</span>
        {!canManage ? <span>{liveTrips.length} GPS live</span> : null}
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-8">
          <div className="flex flex-col gap-3 border-b border-outline-variant px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-on-surface">Live Fleet Map</h2>
              <p className="text-xs text-on-surface-variant">
                {canManage
                  ? `${filteredFleet.length} of ${fleetRows.length} trucks · ${mapTrips.length} on map`
                  : `${mapTrips.length} markers · zoom / pan · click truck for details`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage ? (
                <>
                  <div className="relative min-w-[180px] flex-1 sm:flex-none">
                    <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      className="stitch-input w-full !py-1.5 pl-7 text-sm"
                      placeholder="Search truck / driver / plate"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="stitch-input !py-1.5 text-sm"
                    value={gpsFilter}
                    onChange={(e) => setGpsFilter(e.target.value)}
                    aria-label="GPS status filter"
                  >
                    <option value="ALL">All GPS</option>
                    <option value="ONLINE">Online (Moving + Idle)</option>
                    <option value="MOVING">Moving</option>
                    <option value="IDLE">Idle</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                  {(search || gpsFilter !== "ALL") && (
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-secondary-container hover:bg-surface-container-low"
                      onClick={() => {
                        setSearch("");
                        setGpsFilter("ALL");
                      }}
                    >
                      Clear
                    </button>
                  )}
                </>
              ) : null}
              <button
                type="button"
                onClick={() => (canManage ? fleetQuery.refetch() : tripsQuery.refetch())}
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low"
                title="Refresh"
              >
                <LocateFixed size={18} />
              </button>
            </div>
          </div>
          <div className="relative min-h-[480px] flex-1">
            <FleetMap
              trips={mapTrips}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              routePoints={routePoints}
              destinationPoint={destinationPoint}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </section>

        <section className="col-span-12 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-4">
          <div className="border-b border-outline-variant px-6 py-5">
            <h2 className="text-xl font-semibold text-on-surface">
              {canManage ? "Live trucks" : "Live GPS trips"}
            </h2>
            {canManage ? (
              <p className="mt-1 text-xs text-on-surface-variant">
                Showing {filteredFleet.length}
                {gpsFilter !== "ALL" ? ` · ${gpsFilter}` : ""}
                {search.trim() ? ` · “${search.trim()}”` : ""}
              </p>
            ) : null}
          </div>

          {selected && canManage ? (
            <div className="space-y-2 border-b border-outline-variant bg-secondary-fixed/20 px-5 py-4 text-sm">
              <p className="text-lg font-semibold text-primary-container">
                {selectedFleet?.truckNumber || selected.truckNumber || selected.truck || selected.id}
              </p>
              <p>Driver: {selected.driver || "—"}</p>
              <p>
                GPS:{" "}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${gpsBadgeClass(selected.gpsStatus)}`}>
                  {selected.gpsStatus || "—"}
                </span>
                {selected.lastSeenLabel ? ` · ${selected.lastSeenLabel}` : ""}
              </p>
              <p>
                Speed:{" "}
                {selected.lastLocation?.speedKmh != null
                  ? `${selected.lastLocation.speedKmh} km/h`
                  : "—"}
              </p>
              <p>
                Trip: {selected.pickup || "—"} → {selected.destination || "—"}
              </p>
              {selected.activeTrip?.status || selected.status ? (
                <p>Status: {selected.activeTrip?.status || selected.status}</p>
              ) : null}
              {progress ? (
                <>
                  <p>Distance: {progress.plannedDistanceKm ?? "—"} km</p>
                  <p>Completed: {progress.completedDistanceKm ?? "—"} km</p>
                  <p>Remaining: {progress.remainingDistanceKm ?? "—"} km</p>
                  <p>ETA: {formatEta(progress.etaMinutes)}</p>
                </>
              ) : null}
              {routeTripId ? (
                <Button
                  variant="secondary"
                  className="mt-2 w-full"
                  onClick={() => setReplayTripId(routeTripId)}
                >
                  Trip Replay
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
            {canManage
              ? filteredFleet.map((truck) => (
                  <article
                    key={truck.id}
                    className={`cursor-pointer rounded-lg border p-4 transition ${
                      selected?._truckId === truck.id || selected?.id === truck.activeTrip?.id
                        ? "border-secondary-container bg-secondary-fixed/20"
                        : "border-outline-variant hover:bg-surface-container-low"
                    }`}
                    onClick={() =>
                      setSelectedId(truck.activeTrip?.id || truck.id)
                    }
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary-container">
                        <Truck size={16} className="text-secondary-container" />
                        {truck.truckNumber}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gpsBadgeClass(truck.gpsStatus)}`}>
                        {truck.gpsStatus}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      {truck.driver || "Unassigned"} · {truck.plateNumber}
                    </p>
                    {truck.activeTrip ? (
                      <p className="mt-1 text-sm font-medium">
                        {truck.activeTrip.pickup} → {truck.activeTrip.destination}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-on-surface-variant">No active trip</p>
                    )}
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {truck.lastLocation?.speedKmh != null
                        ? `${truck.lastLocation.speedKmh} km/h`
                        : "—"}
                      {truck.lastSeenLabel ? ` · ${truck.lastSeenLabel}` : ""}
                    </p>
                  </article>
                ))
              : liveTrips.map((trip) => (
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
                        GPS: {Number(trip.lastLocation.lat).toFixed(4)},{" "}
                        {Number(trip.lastLocation.lng).toFixed(4)}
                        {trip.lastLocation.speedKmh != null
                          ? ` · ${trip.lastLocation.speedKmh} km/h`
                          : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-700">Waiting for driver GPS</p>
                    )}
                    {canManage && (
                      <div className="mt-3 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          className="px-2 py-1 text-xs"
                          onClick={() => updateStatus(trip, nextTripStatus(trip.status))}
                        >
                          Advance
                        </Button>
                      </div>
                    )}
                  </article>
                ))}

            {canManage && !filteredFleet.length ? (
              <p className="px-2 py-10 text-center text-sm text-on-surface-variant">
                No trucks match this search/filter.
                <button
                  type="button"
                  className="mt-2 block w-full text-sm font-semibold text-secondary-container"
                  onClick={() => {
                    setSearch("");
                    setGpsFilter("ALL");
                  }}
                >
                  Clear filters
                </button>
              </p>
            ) : null}
            {!canManage && !liveTrips.length ? (
              <div className="px-2 py-10 text-center">
                <p className="text-sm text-on-surface-variant">GPS signal ma jirto hadda.</p>
              </div>
            ) : null}
          </div>

          {canManage && eventsData?.events?.length ? (
            <div className="border-t border-outline-variant px-4 py-3">
              <h3 className="mb-2 text-sm font-semibold text-on-surface">Recent events</h3>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-on-surface-variant">
                {eventsData.events.slice(-8).reverse().map((ev) => (
                  <li key={ev.id}>
                    {ev.at ? new Date(ev.at).toLocaleTimeString() : ""} · {ev.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <TripReplayModal
        tripId={replayTripId}
        open={Boolean(replayTripId)}
        onClose={() => setReplayTripId(null)}
      />
    </div>
  );
}
