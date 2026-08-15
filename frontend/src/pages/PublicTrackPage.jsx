import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, MapPin, Navigation, Truck } from "lucide-react";
import { api } from "../services/api";
import { FleetMap } from "../components/map/FleetMap";
import { BrandLogo } from "../components/BrandLogo";
import { StatusBadge } from "../components/ui/StatusBadge";
import { buildTripRoadDisplay, fetchOsrmRoadPath } from "../utils/geo";

const POLL_MS = 5_000;

function formatEta(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return "—";
  const m = Math.max(0, Math.round(Number(minutes)));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem} min`;
  return `${h}h ${rem}m`;
}

function formatDistance(km) {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return `${Number(km).toFixed(1)} km`;
}

function formatUpdatedAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return "—";
  }
}

/** Map public tracking payload → FleetMap trip shape. */
function toMapTrip(data) {
  if (!data) return null;
  return {
    id: data.tripId,
    driver: data.driver?.name || null,
    truck: data.vehicle?.truckNumber || null,
    plateNumber: data.vehicle?.plateNumber || null,
    pickup: data.pickup,
    destination: data.destination,
    status: data.status,
    lastLocation: data.lastLocation,
  };
}

export function PublicTrackPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [osrmPath, setOsrmPath] = useState([]);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function load() {
      try {
        const next = await api.getPublicTrack(token);
        if (!cancelled) {
          setData(next);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Tracking unavailable");
          setData(null);
        }
      }
    }

    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  const mapTrip = useMemo(() => toMapTrip(data), [data]);
  const roadDisplay = useMemo(
    () =>
      buildTripRoadDisplay({
        trip: mapTrip
          ? {
              ...mapTrip,
              pickup: data?.pickup,
              destination: data?.destination,
            }
          : null,
      }),
    [mapTrip, data?.pickup, data?.destination]
  );

  useEffect(() => {
    let cancelled = false;
    const { origin, destination, livePoint } = roadDisplay;
    if (!origin || !destination) {
      setOsrmPath([]);
      return undefined;
    }
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

  if (error && !data) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 text-on-surface">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 text-error" size={36} />
          <h1 className="text-xl font-bold text-primary-container">Tracking link unavailable</h1>
          <p className="mt-2 text-sm text-on-surface-variant">{error}</p>
          <Link to="/" className="mt-6 inline-block text-sm font-semibold text-secondary-container underline">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-on-surface-variant">
        Loading live tracking…
      </div>
    );
  }

  const progress = data.progress || {};
  const routePoints =
    osrmPath.length >= 2
      ? osrmPath
      : roadDisplay.routePoints.length >= 2
        ? roadDisplay.routePoints
        : [];

  return (
    <main className="relative flex min-h-screen flex-col bg-background text-on-surface">
      <header className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <BrandLogo size="sm" layout="row" />
        <StatusBadge status={data.customerLabel || data.status} />
      </header>

      <div className="relative min-h-[52vh] flex-1 lg:min-h-[62vh]">
        <FleetMap
          trips={mapTrip && data.trackingAllowed ? [mapTrip] : []}
          selectedId={mapTrip?.id}
          routePoints={routePoints}
          originPoint={data.pickupPoint || roadDisplay.origin}
          destinationPoint={data.destinationPoint || roadDisplay.destination}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <section className="z-10 -mt-4 rounded-t-2xl border border-outline-variant bg-surface-container-lowest px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Info
            icon={Truck}
            label="Driver"
            value={data.driver?.name || "Awaiting assignment"}
          />
          <Info
            icon={Navigation}
            label="Vehicle"
            value={
              data.vehicle
                ? [data.vehicle.truckType, data.vehicle.plateNumber || data.vehicle.truckNumber]
                    .filter(Boolean)
                    .join(" · ") || "—"
                : "—"
            }
          />
          <Info icon={MapPin} label="Pickup" value={data.pickup || "—"} />
          <Info icon={MapPin} label="Destination" value={data.destination || "—"} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low p-3 text-center text-sm">
          <Metric label="ETA" value={formatEta(progress.etaMinutes)} />
          <Metric label="Remaining" value={formatDistance(progress.remainingDistanceKm)} />
          <Metric
            label="Updated"
            value={data.lastLocation?.lastSeenLabel || formatUpdatedAt(data.lastLocation?.updatedAt)}
          />
        </div>

        {!data.trackingAllowed ? (
          <p className="mt-3 text-center text-xs text-on-surface-variant">
            Live driver location is only shown while tracking is authorized for this trip.
          </p>
        ) : null}

        <p className="mt-4 text-center text-[11px] text-on-surface-variant">
          Secure tracking link · expires {data.expiresAt ? new Date(data.expiresAt).toLocaleString() : "—"}
        </p>
      </section>
    </main>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-2 rounded-lg border border-outline-variant/60 bg-surface-container-low/40 px-3 py-2">
      <Icon size={16} className="mt-0.5 shrink-0 text-secondary-container" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="truncate text-sm font-medium text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-0.5 font-semibold text-primary-container">{value}</p>
    </div>
  );
}
