import { useEffect, useMemo, useState } from "react";
import { LocateFixed, MapPin, Navigation, Radio, Search, Truck } from "lucide-react";
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
import { resolveTripMapPosition, buildTripRoadDisplay, fetchOsrmRoadPath } from "../../utils/geo";
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

function formatDistanceKm(km) {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return `${Number(km).toFixed(1)} km`;
}

/** Prefer billed GPS km; if still 0, infer from planned − remaining so the UI matches the map. */
function displayProgress(progress) {
  if (!progress) return null;
  const planned = Number(progress.plannedDistanceKm);
  const remaining = Number(progress.remainingDistanceKm);
  let completed = Number(progress.completedDistanceKm) || 0;
  if (
    completed <= 0 &&
    Number.isFinite(planned) &&
    planned > 0 &&
    Number.isFinite(remaining)
  ) {
    completed = Math.max(0, Math.round((planned - remaining) * 10) / 10);
  }
  return { ...progress, completedDistanceKm: completed };
}

function isGpsOnline(status) {
  const s = String(status || "OFFLINE").toUpperCase();
  return s === "MOVING" || s === "IDLE" || s === "ONLINE";
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
    const rows = fleetRows.filter((row) => {
      const status = String(row.gpsStatus || "OFFLINE").toUpperCase();
      if (gpsFilter === "ONLINE") {
        if (status !== "MOVING" && status !== "IDLE") return false;
      } else if (gpsFilter === "ACTIVE") {
        if (!row.activeTrip) return false;
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
    // Active trips first, then GPS-online trucks
    return rows.slice().sort((a, b) => {
      const aLive = a.activeTrip ? 1 : 0;
      const bLive = b.activeTrip ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      const aGps = isGpsOnline(a.gpsStatus) ? 1 : 0;
      const bGps = isGpsOnline(b.gpsStatus) ? 1 : 0;
      return bGps - aGps;
    });
  }, [fleetRows, search, gpsFilter]);

  /** Admin: active assigned trips (shown in top strip). */
  const liveTripCards = useMemo(() => {
    if (!canManage) return [];
    return fleetRows
      .filter((row) => row.activeTrip)
      .map((truck) => ({
        truckId: truck.id,
        tripId: truck.activeTrip.id,
        truckNumber: truck.truckNumber,
        plateNumber: truck.plateNumber,
        driver: truck.driver,
        pickup: truck.activeTrip.pickup,
        destination: truck.activeTrip.destination,
        status: truck.activeTrip.status,
        gpsStatus: truck.gpsStatus,
        lastSeenLabel: truck.lastSeenLabel,
        progress: truck.activeTrip.progress,
        hasGps:
          truck.activeTrip?.lastLocation?.lat != null ||
          truck.lastLocation?.lat != null,
      }))
      .sort((a, b) => Number(b.hasGps) - Number(a.hasGps));
  }, [canManage, fleetRows]);

  // Map markers: GPS trucks + selected offline trip still gets road FROM→TO via origin/destination.
  const mapTrips = useMemo(() => {
    if (!canManage) return liveTrips;
    return filteredFleet
      .map((truck) => {
        const loc = truck.activeTrip?.lastLocation || truck.lastLocation;
        if (loc?.lat == null || loc?.lng == null) return null;
        return {
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
            lat: Number(loc.lat),
            lng: Number(loc.lng),
            updatedAt: loc.updatedAt,
            speedKmh: loc.speedKmh != null ? Number(loc.speedKmh) : null,
            heading: loc.heading != null ? Number(loc.heading) : null,
          },
          distanceTraveledKm: truck.activeTrip?.distanceTraveledKm,
          progress: truck.activeTrip?.progress,
          plateNumber: truck.plateNumber,
          _truckId: truck.id,
        };
      })
      .filter(Boolean);
  }, [canManage, filteredFleet, liveTrips]);

  // Prefer selecting an active trip; keep selection inside filter results.
  useEffect(() => {
    if (!canManage) return;
    const stillVisible = filteredFleet.some(
      (t) => t.id === selectedId || t.activeTrip?.id === selectedId
    );
    if (!stillVisible) {
      const preferred =
        filteredFleet.find((t) => t.activeTrip) ||
        filteredFleet.find((t) => isGpsOnline(t.gpsStatus)) ||
        filteredFleet[0];
      setSelectedId(preferred?.activeTrip?.id || preferred?.id || null);
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
            plateNumber: truck.plateNumber,
            driver: truck.driver,
            pickup: truck.activeTrip?.pickup,
            destination: truck.activeTrip?.destination,
            status: truck.activeTrip?.status,
            gpsStatus: truck.gpsStatus,
            lastSeenLabel: truck.lastSeenLabel,
            lastLocation: truck.activeTrip?.lastLocation || truck.lastLocation,
            progress: truck.activeTrip?.progress,
            activeTrip: truck.activeTrip,
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

  const routeTripId =
    selectedFleet?.activeTrip?.id ||
    selected?.activeTrip?.id ||
    (selected?.pickup ? selected.id : null);
  const selectedHasGps =
    selected?.lastLocation?.lat != null && selected?.lastLocation?.lng != null;
  const { data: routeData } = useTripRoute(routeTripId, {
    enabled: Boolean(routeTripId),
    refetchInterval: LIVE_POLL_MS,
  });
  const { data: eventsData } = useTripEvents(routeTripId, {
    enabled: canManage && Boolean(routeTripId),
    refetchInterval: 15_000,
  });

  const routePointsGps = routeData?.points || [];
  const [osrmPath, setOsrmPath] = useState([]);

  const roadDisplay = useMemo(() => {
    const tripForRoad = selected
      ? {
          ...selected,
          pickup: selected.pickup || selected.activeTrip?.pickup,
          destination: selected.destination || selected.activeTrip?.destination,
          lastLocation: selected.lastLocation || selectedFleet?.lastLocation,
        }
      : null;
    return buildTripRoadDisplay({
      trip: tripForRoad,
      gpsTrail: routePointsGps,
    });
  }, [selected, selectedFleet, routePointsGps]);

  useEffect(() => {
    let cancelled = false;
    const { origin, destination, livePoint } = roadDisplay;
    if (!origin || !destination) {
      setOsrmPath([]);
      return undefined;
    }
    // Always fetch real road (ignore short GPS stubs)
    fetchOsrmRoadPath(origin, destination, livePoint).then((path) => {
      if (!cancelled && path?.length) setOsrmPath(path);
    });
    return () => {
      cancelled = true;
    };
  }, [
    roadDisplay.origin?.lat,
    roadDisplay.origin?.lng,
    roadDisplay.destination?.lat,
    roadDisplay.destination?.lng,
    roadDisplay.livePoint?.lat,
    roadDisplay.livePoint?.lng,
  ]);

  // Prefer OSRM road; never use 2-point GPS stub as the main route
  const routePoints =
    osrmPath.length >= 2
      ? osrmPath
      : roadDisplay.routePoints.length >= 3
        ? roadDisplay.routePoints
        : routePointsGps.length >= 8
          ? routePointsGps
          : roadDisplay.routePoints;
  const originPoint = roadDisplay.origin;
  const destinationPoint = roadDisplay.destination;
  const progress = displayProgress(
    selectedFleet?.activeTrip?.progress || selected?.progress || null
  );
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
            const active = gpsFilter === card.filter;
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => setGpsFilter(card.filter)}
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

      {canManage && liveTripCards.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-secondary-container/40 bg-surface-container-lowest shadow-[0px_4px_16px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Navigation size={18} className="text-secondary-container" />
              <h2 className="text-base font-semibold text-primary-container">Live trips</h2>
              <span className="rounded-full bg-secondary-fixed px-2 py-0.5 text-[11px] font-bold text-on-secondary-fixed">
                {liveTripCards.length}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              Assigned / in progress — tap to focus on the map
            </p>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 py-3 sm:px-5">
            {liveTripCards.map((card) => {
              const active = selectedId === card.tripId || selected?._truckId === card.truckId;
              return (
                <button
                  key={card.tripId}
                  type="button"
                  onClick={() => {
                    setSelectedId(card.tripId);
                    setGpsFilter("ACTIVE");
                  }}
                  className={`min-w-[260px] max-w-[320px] shrink-0 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-secondary-container bg-secondary-fixed/25 shadow-sm"
                      : "border-outline-variant bg-surface-container-low/50 hover:border-secondary-container/50"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-primary-container">
                      {card.plateNumber || card.truckNumber}
                      {card.plateNumber && card.truckNumber ? (
                        <span className="font-medium text-on-surface-variant"> · #{card.truckNumber}</span>
                      ) : null}
                    </span>
                    <StatusBadge status={card.status} />
                  </div>
                  <p className="truncate text-xs text-on-surface-variant">
                    {card.driver || "No driver"} · Trip {card.tripId}
                  </p>
                  <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-on-surface">
                    <MapPin size={12} className="mt-0.5 shrink-0 text-rose-600" />
                    <span className="line-clamp-2">
                      {card.pickup} → {card.destination}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                    <span className={`rounded-full px-2 py-0.5 ${gpsBadgeClass(card.gpsStatus)}`}>
                      {card.hasGps ? card.gpsStatus : "WAITING GPS"}
                    </span>
                    {card.hasGps && card.progress?.etaMinutes != null ? (
                      <span className="text-on-surface-variant">
                        ETA {formatEta(card.progress.etaMinutes)}
                      </span>
                    ) : (
                      <span className="text-amber-800">Driver app GPS pending</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : canManage ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low/40 px-4 py-3 text-sm text-on-surface-variant">
          No live trips yet — assign a driver to a cargo request to track here.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
          <Radio size={14} className={tripsQuery.isFetching || fleetQuery.isFetching ? "animate-pulse" : ""} />
          Live · Socket + {LIVE_POLL_MS / 1000}s refresh
        </span>
        <span>Last sync: {lastUpdated}</span>
        {canManage ? (
          <span>
            {liveTripCards.length} live trip{liveTripCards.length === 1 ? "" : "s"} · {mapTrips.length} GPS on map
          </span>
        ) : (
          <span>{liveTrips.length} GPS live</span>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.05)] lg:col-span-8">
          <div className="flex flex-col gap-3 border-b border-outline-variant px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-on-surface">Live Fleet Map</h2>
              <p className="text-xs text-on-surface-variant">
                {canManage
                  ? `${filteredFleet.length} of ${fleetRows.length} trucks · FROM → road → TO`
                  : `${mapTrips.length} live · red FROM · green TO · green road`}
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
                    <option value="ACTIVE">Active trips only</option>
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
              originPoint={originPoint}
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
                {gpsFilter === "ACTIVE"
                  ? " · active trips"
                  : gpsFilter !== "ALL"
                    ? ` · ${gpsFilter}`
                    : ""}
                {search.trim() ? ` · “${search.trim()}”` : ""}
              </p>
            ) : null}
          </div>

          {selected && canManage ? (
            <div className="space-y-2 border-b border-outline-variant bg-secondary-fixed/20 px-5 py-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-primary-container">
                    {selectedFleet?.plateNumber || selected.plateNumber || selectedFleet?.truckNumber || selected.truckNumber || "—"}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    Truck #{selectedFleet?.truckNumber || selected.truckNumber || "—"}
                    {routeTripId ? ` · Trip ${routeTripId}` : ""}
                  </p>
                </div>
                {(selectedFleet?.activeTrip?.status || selected.status) && (
                  <StatusBadge status={selectedFleet?.activeTrip?.status || selected.status} />
                )}
              </div>
              <p>Driver: {selected.driver || "—"}</p>
              <p>
                GPS:{" "}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${gpsBadgeClass(selected.gpsStatus)}`}>
                  {selectedHasGps ? selected.gpsStatus || "—" : "WAITING GPS"}
                </span>
                {selectedHasGps && selected.lastSeenLabel ? ` · ${selected.lastSeenLabel}` : null}
                {!selectedHasGps ? " · driver has not shared location yet" : null}
              </p>
              <p>
                Speed:{" "}
                {selectedHasGps && selected.lastLocation?.speedKmh != null
                  ? `${selected.lastLocation.speedKmh} km/h`
                  : "—"}
              </p>
              {(selected.pickup || selected.destination) && (
                <p className="text-sm font-medium">
                  {selected.pickup || "—"} → {selected.destination || "—"}
                </p>
              )}
              {progress ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-surface-container-lowest/80 p-2 text-xs">
                  <p>Distance: {formatDistanceKm(progress.plannedDistanceKm)}</p>
                  <p>Completed: {formatDistanceKm(progress.completedDistanceKm)}</p>
                  <p>Remaining: {formatDistanceKm(progress.remainingDistanceKm)}</p>
                  <p>
                    ETA:{" "}
                    {selectedHasGps
                      ? formatEta(progress.etaMinutes)
                      : "— (needs GPS)"}
                  </p>
                </div>
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
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-primary-container">
                          <Truck size={16} className="shrink-0 text-secondary-container" />
                          <span className="truncate">
                            {truck.plateNumber || truck.truckNumber}
                          </span>
                        </div>
                        {truck.plateNumber && truck.truckNumber ? (
                          <p className="pl-6 text-[11px] text-on-surface-variant">#{truck.truckNumber}</p>
                        ) : null}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${gpsBadgeClass(truck.gpsStatus)}`}>
                        {truck.activeTrip?.lastLocation?.lat != null || truck.lastLocation?.lat != null
                          ? truck.gpsStatus
                          : "NO GPS"}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      {truck.driver || "Unassigned"}
                      {truck.activeTrip ? (
                        <span className="ml-1 font-semibold text-secondary-container"> · Live trip</span>
                      ) : null}
                    </p>
                    {truck.activeTrip ? (
                      <>
                        <p className="mt-1 text-sm font-medium">
                          {truck.activeTrip.pickup} → {truck.activeTrip.destination}
                        </p>
                        <div className="mt-1">
                          <StatusBadge status={truck.activeTrip.status} />
                        </div>
                      </>
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
