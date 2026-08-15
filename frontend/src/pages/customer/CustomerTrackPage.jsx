import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Copy, MapPin, Navigation, Phone, Share2, Truck } from "lucide-react";
import { FleetMap } from "../../components/map/FleetMap";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { useTrips } from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { LIVE_MAP_STATUSES } from "../../utils/helpers";
import { buildTripRoadDisplay, fetchOsrmRoadPath } from "../../utils/geo";
import { api } from "../../services/api";
import { useLanguage } from "../../contexts/LanguageContext";

const LIVE_POLL_MS = 5_000;

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

/** Build a dialable tel: href from the driver phone stored in the system. */
function toTelHref(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) {
    if (digits.startsWith("0") && digits.length >= 9) {
      digits = `+252${digits.slice(1)}`;
    } else if (/^(?:6[1-9]|7\d|9\d)\d{7}$/.test(digits)) {
      digits = `+252${digits}`;
    } else {
      digits = `+${digits}`;
    }
  }
  const only = digits.replace(/[^\d+]/g, "");
  if (only.replace(/\D/g, "").length < 7) return null;
  return `tel:${only}`;
}

function displayPhone(phone) {
  return String(phone || "").trim() || null;
}

export function CustomerTrackPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tripIdParam = searchParams.get("trip") || searchParams.get("tripId");

  const tripsQuery = useTrips({}, { refetchInterval: LIVE_POLL_MS });
  const [osrmPath, setOsrmPath] = useState([]);
  const [shareMsg, setShareMsg] = useState("");
  const [sharing, setSharing] = useState(false);

  const myTrips = useMemo(
    () =>
      (tripsQuery.data?.data || []).filter(
        (trip) => !user?.id || trip.customerId === user.id
      ),
    [tripsQuery.data?.data, user?.id]
  );

  const activeTrips = useMemo(
    () => myTrips.filter((trip) => LIVE_MAP_STATUSES.includes(trip.status)),
    [myTrips]
  );

  const selected =
    myTrips.find((trip) => trip.id === tripIdParam) ||
    activeTrips[0] ||
    myTrips.find((trip) => !["Delivered", "Cancelled"].includes(trip.status)) ||
    null;

  useEffect(() => {
    if (selected?.id && tripIdParam !== selected.id) {
      setSearchParams({ trip: selected.id }, { replace: true });
    }
  }, [selected?.id, tripIdParam, setSearchParams]);

  const roadDisplay = useMemo(
    () => buildTripRoadDisplay({ trip: selected }),
    [selected]
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

  const routePoints =
    osrmPath.length >= 2
      ? osrmPath
      : roadDisplay.routePoints.length >= 2
        ? roadDisplay.routePoints
        : [];

  const progress = selected?.progress || {};
  const canShare =
    selected && !["Cancelled"].includes(selected.status);

  async function shareTrackingLink() {
    if (!selected?.id) return;
    setSharing(true);
    setShareMsg("");
    try {
      const link = await api.createTripTrackingLink(selected.id);
      const url =
        link.url ||
        `${window.location.origin}${link.path || `/track/${link.token}`}`;
      if (navigator.share) {
        await navigator.share({
          title: "Live trip tracking",
          text: `Track your shipment (${selected.customerStatus || selected.status})`,
          url,
        });
        setShareMsg("Share sheet opened");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMsg("Tracking link copied");
      } else {
        setShareMsg(url);
      }
    } catch (err) {
      setShareMsg(err.message || "Could not create link");
    } finally {
      setSharing(false);
    }
  }

  async function copyTrackingLink() {
    if (!selected?.id) return;
    setSharing(true);
    setShareMsg("");
    try {
      const link = await api.createTripTrackingLink(selected.id);
      const url =
        link.url ||
        `${window.location.origin}${link.path || `/track/${link.token}`}`;
      await navigator.clipboard.writeText(url);
      setShareMsg("Tracking link copied");
    } catch (err) {
      setShareMsg(err.message || "Could not create link");
    } finally {
      setSharing(false);
    }
  }

  if (tripsQuery.isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-on-surface-variant">
        Loading trips…
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
        <Navigation className="mx-auto text-secondary-container" size={32} />
        <h1 className="text-xl font-semibold text-primary-container">No trip to track</h1>
        <p className="text-sm text-on-surface-variant">
          When a driver is assigned, live tracking appears here.
        </p>
        <Link to="/customer/trips">
          <Button>View my trips</Button>
        </Link>
      </div>
    );
  }

  const phone = displayPhone(selected.driverPhone);
  const telHref = toTelHref(phone);

  return (
    <div className="relative -mx-4 -mt-2 flex min-h-[calc(100dvh-7.5rem)] flex-col sm:-mx-6 lg:min-h-[calc(100dvh-5.5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 py-2">
        <select
          className="stitch-input max-w-full flex-1 text-sm"
          value={selected.id}
          onChange={(e) => setSearchParams({ trip: e.target.value })}
          aria-label="Select trip"
        >
          {myTrips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.pickup} → {trip.destination} ({trip.customerStatus || trip.status})
            </option>
          ))}
        </select>
        <StatusBadge status={selected.customerStatus || selected.status} />
      </div>

      <div className="relative min-h-[48vh] flex-1">
        <FleetMap
          trips={LIVE_MAP_STATUSES.includes(selected.status) ? [selected] : []}
          selectedId={selected.id}
          routePoints={routePoints}
          originPoint={roadDisplay.origin}
          destinationPoint={roadDisplay.destination}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <section className="z-10 rounded-t-2xl border border-outline-variant bg-surface-container-lowest px-4 pb-4 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />

        <div className="grid gap-2 sm:grid-cols-2">
          <Info icon={Truck} label="Driver" value={selected.driver || "Waiting for driver"} />
          <Info
            icon={Navigation}
            label="Vehicle"
            value={
              [selected.truckType, selected.plateNumber || selected.truck].filter(Boolean).join(" · ") ||
              "—"
            }
          />
          <Info icon={MapPin} label="Pickup" value={selected.pickup || "—"} />
          <Info icon={MapPin} label="Destination" value={selected.destination || "—"} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low p-3 text-center text-sm">
          <Metric label="ETA" value={formatEta(progress.etaMinutes)} />
          <Metric label="Remaining" value={formatDistance(progress.remainingDistanceKm)} />
          <Metric
            label="Updated"
            value={formatUpdatedAt(selected.lastLocation?.updatedAt)}
          />
        </div>

        {progress.percentComplete != null ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-on-surface-variant">
              <span>Trip progress</span>
              <span>{progress.percentComplete}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-secondary-container transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progress.percentComplete))}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {telHref ? (
            <a
              href={telHref}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-surface-container-low sm:flex-none"
              aria-label={`Call driver ${phone}`}
            >
              <Phone size={16} />
              Contact driver
            </a>
          ) : (
            <span className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant px-4 py-2.5 text-sm text-on-surface-variant sm:flex-none">
              <Phone size={16} />
              No driver phone
            </span>
          )}
          {canShare ? (
            <>
              <Button className="flex-1 sm:flex-none" onClick={shareTrackingLink} disabled={sharing}>
                <Share2 size={16} /> Share tracking
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                variant="secondary"
                onClick={copyTrackingLink}
                disabled={sharing}
              >
                <Copy size={16} /> Copy link
              </Button>
            </>
          ) : null}
        </div>
        {telHref && phone ? (
          <p className="mt-1.5 text-center text-xs text-on-surface-variant">
            Calls {phone}
          </p>
        ) : null}
        {shareMsg ? (
          <p className="mt-2 text-center text-xs text-on-surface-variant">{shareMsg}</p>
        ) : null}
        <p className="mt-2 text-center text-[11px] text-on-surface-variant">
          {t("nav.liveTracking")} · updates every few seconds
        </p>
      </section>
    </div>
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
