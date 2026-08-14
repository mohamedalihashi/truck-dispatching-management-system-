import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Weight } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { SharedTripJourney } from "../../components/SharedTripJourney";
import { SharedPickupWeightModal } from "../../components/SharedPickupWeightModal";
import { SharedTripDecision } from "../../components/SharedTripDecision";
import { SharedTripStopsMap } from "../../components/shared/SharedTripStopsMap";
import { SharedTripStopsPanel } from "../../components/shared/SharedTripStopsPanel";
import { api } from "../../services/api";
import { money, fareAfterDelivered } from "../../utils/helpers";
import {
  bookingIdsInOrder,
  buildSharedStops,
  formatStopAddress,
} from "../../utils/sharedTripStops";
import { useLanguage } from "../../contexts/LanguageContext";

function formatDuration(amount, unit) {
  if (amount == null || !unit) return null;
  const n = Number(amount);
  if (!(n > 0)) return null;
  const label = unit === "days" ? (n === 1 ? "day" : "days") : n === 1 ? "hour" : "hours";
  return `${n} ${label}`;
}

function formatBookingWeight(b) {
  const raw = b.cargoRequest?.weight;
  if (raw && !/^(tbd|pending|n\/a)$/i.test(String(raw).trim())) return raw;
  if (Number(b.weightTons) > 0) return `${Number(b.weightTons)} t`;
  return "Weight at pickup";
}

function moveBookingId(ids, bookingId, delta) {
  const idx = ids.indexOf(bookingId);
  if (idx < 0) return ids;
  const next = idx + delta;
  if (next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy;
}

export function SharedTripDetailPage() {
  const { id } = useParams();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [pickupOpen, setPickupOpen] = useState(false);
  const [driverPosition, setDriverPosition] = useState(null);
  const [deliveringId, setDeliveringId] = useState(null);

  const { data: trip, isLoading } = useQuery({
    queryKey: ["shared-trip", id],
    queryFn: () => api.getSharedTrip(id),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["shared-trip", id] });
    qc.invalidateQueries({ queryKey: ["shared-trips-me"] });
    qc.invalidateQueries({ queryKey: ["shared-trips-summary"] });
    qc.invalidateQueries({ queryKey: ["my-shared-trips-dashboard"] });
  }

  const startPickup = useMutation({
    mutationFn: (payload) => api.startSharedTripPickup(id, payload),
    onSuccess: () => {
      setPickupOpen(false);
      refresh();
    },
  });

  const markInTransit = useMutation({
    mutationFn: () => api.markSharedTripInTransit(id),
    onSuccess: refresh,
  });

  const reorderStops = useMutation({
    mutationFn: (payload) => api.reorderSharedTripStops(id, payload),
    onSuccess: refresh,
  });

  const deliverBooking = useMutation({
    mutationFn: (bookingId) => api.deliverSharedBooking(id, bookingId),
    onSuccess: () => {
      setDeliveringId(null);
      refresh();
    },
    onError: () => setDeliveringId(null),
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelSharedTrip(id),
    onSuccess: refresh,
  });

  const pickupStops = useMemo(
    () => buildSharedStops(trip?.bookings, "pickup"),
    [trip?.bookings]
  );
  const deliveryStops = useMemo(
    () => buildSharedStops(trip?.bookings, "delivery"),
    [trip?.bookings]
  );

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setDriverPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (isLoading) return <p className="py-16 text-center text-sm text-on-surface-variant">Loading…</p>;
  if (!trip) return <p className="py-16 text-center text-sm text-error">Trip not found</p>;

  const canPickup = ["Open for booking", "Full"].includes(trip.status);
  const canInTransit = trip.status === "Pickup";
  const canDeliverLoads = ["In Transit", "Departed"].includes(trip.status);
  const canReorder = !["Assigned", "Delivered", "Completed", "Cancelled"].includes(trip.status);
  const canCancel = ["Open for booking", "Full"].includes(trip.status);
  const needsAccept = trip.status === "Assigned";
  const durationLabel = formatDuration(trip.durationAmount, trip.durationUnit);
  const actionError =
    startPickup.error?.message ||
    markInTransit.error?.message ||
    reorderStops.error?.message ||
    deliverBooking.error?.message ||
    cancel.error?.message;

  function handleMoveStop(kind, bookingId, delta) {
    const pickupOrder =
      kind === "pickup"
        ? moveBookingId(bookingIdsInOrder(trip.bookings, "pickup"), bookingId, delta)
        : bookingIdsInOrder(trip.bookings, "pickup");
    const deliveryOrder =
      kind === "delivery"
        ? moveBookingId(bookingIdsInOrder(trip.bookings, "delivery"), bookingId, delta)
        : bookingIdsInOrder(trip.bookings, "delivery");
    reorderStops.mutate({ pickupOrder, deliveryOrder });
  }

  function handleDeliverBooking(bookingId) {
    setDeliveringId(bookingId);
    deliverBooking.mutate(bookingId);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={trip.id}
        subtitle={
          needsAccept
            ? "Admin wuxuu kuu qoondeeyay dhammaan loads-ka mid ahaan — Accept ama Reject."
            : "Qaadis → miisaanka → In Transit → geeyn booking kasta. Macaamiisha waxay bixiyaan 100% ka dib Delivered."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/driver/shared-trips">
              <Button variant="secondary">{t("common.back")}</Button>
            </Link>
            {canPickup ? (
              <Button onClick={() => setPickupOpen(true)} disabled={startPickup.isPending}>
                {t("driver.startPickup")}
              </Button>
            ) : null}
            {canInTransit ? (
              <Button onClick={() => markInTransit.mutate()} disabled={markInTransit.isPending}>
                {markInTransit.isPending ? t("common.loading") : t("driver.markInTransit")}
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                {t("driver.cancelTrip")}
              </Button>
            ) : null}
          </div>
        }
      />

      {needsAccept ? (
        <section className="rounded-xl border border-secondary-container/40 bg-secondary-fixed/30 p-5">
          <h2 className="text-lg font-semibold text-on-surface">Accept shared job</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {trip.bookings?.length || trip.bookingsCount || 0} load(s) · {trip.pickup} → {trip.destination} · isku corridor — mid Accept.
          </p>
          <div className="mt-4">
            <SharedTripDecision trip={trip} />
          </div>
        </section>
      ) : null}

      {actionError ? (
        <p className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{actionError}</p>
      ) : null}

      <SharedTripJourney status={trip.status} />

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-on-surface">Khariidad — GPS live</h2>
        </div>
        <div className="mt-4">
          <SharedTripStopsMap driverPosition={driverPosition} />
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          Cas = GPS-kaaga (live). From/to addresses waxaa ka eeg liiska hoose — calaamado qiyaas ah lama isticmaalo.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="text-lg font-semibold text-on-surface">Qaadis — taxanaha</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Kor/hoos u dhaq si aad u beddesho taxanaha qaadista.
          </p>
          <div className="mt-4">
            <SharedTripStopsPanel
              stops={pickupStops}
              kind="pickup"
              canReorder={canReorder && pickupStops.length > 1}
              onMove={(bookingId, delta) => handleMoveStop("pickup", bookingId, delta)}
            />
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="text-lg font-semibold text-on-surface">Geeyn — taxanaha</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Marka In Transit, riix Delivered booking kasta markaad geeyso.
          </p>
          <div className="mt-4">
            <SharedTripStopsPanel
              stops={deliveryStops}
              kind="delivery"
              canReorder={canReorder && deliveryStops.length > 1}
              canDeliver={canDeliverLoads}
              deliveringId={deliveringId}
              onMove={(bookingId, delta) => handleMoveStop("delivery", bookingId, delta)}
              onDeliver={handleDeliverBooking}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-on-surface">Route (guud)</h2>
            <StatusBadge status={trip.status} />
          </div>
          <p className="mt-3 flex items-center gap-1 text-sm text-on-surface">
            <MapPin size={14} /> {trip.pickup} → {trip.destination}
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            <Weight size={14} className="inline" /> {trip.availableTons}t available of {trip.totalCapacityTons}t
          </p>
          {trip.pricePerTon != null ? <p className="mt-1 text-sm">{money(trip.pricePerTon)} per ton</p> : null}
          {trip.departureDate ? (
            <p className="mt-1 text-sm text-on-surface-variant">
              Departure: {new Date(trip.departureDate).toLocaleDateString()}
            </p>
          ) : null}
          {durationLabel ? (
            <p className="mt-1 text-sm text-on-surface-variant">Duration: {durationLabel}</p>
          ) : null}
          {trip.notes ? <p className="mt-3 text-sm text-on-surface-variant">{trip.notes}</p> : null}
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="text-lg font-semibold text-on-surface">Alaab kasta — pickup & destination</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Booking kasta wuxuu leeyahay pickup iyo destination u gaar ah.
          </p>
          {!trip.bookings?.length ? (
            <p className="mt-3 text-sm text-on-surface-variant">No loads assigned yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {trip.bookings.map((b) => (
                <li key={b.id} className="rounded-lg border border-outline-variant px-3 py-3 text-sm">
                  <p className="font-semibold text-on-surface">
                    {b.customer || "Customer"} · {formatBookingWeight(b)}
                  </p>
                  <p className="mt-1 text-on-surface-variant">
                    {b.cargoRequestId || "—"} · <StatusBadge status={b.status} />
                    {` · ${fareAfterDelivered(b.status || b.cargoRequest?.status, b.cargoRequest?.finalPrice ?? b.cargoRequest?.quotedPrice)}`}
                  </p>
                  <p className="mt-2 text-on-surface">
                    <span className="font-medium text-blue-700 dark:text-blue-300">Qaadis:</span>{" "}
                    {formatStopAddress(b.cargoRequest, "pickup")}
                  </p>
                  <p className="mt-1 text-on-surface">
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">Geeyn:</span>{" "}
                    {formatStopAddress(b.cargoRequest, "delivery")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SharedPickupWeightModal
        trip={trip}
        open={pickupOpen}
        onClose={() => setPickupOpen(false)}
        pending={startPickup.isPending}
        onConfirm={(payload) => startPickup.mutateAsync(payload)}
      />
    </div>
  );
}
