import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { SharedPickupWeightModal } from "../../components/SharedPickupWeightModal";
import { SharedDeliverCodeModal } from "../../components/SharedDeliverCodeModal";
import { SharedTripDecision } from "../../components/SharedTripDecision";
import { SharedTripStopsMap } from "../../components/shared/SharedTripStopsMap";
import { SharedTripStopsPanel } from "../../components/shared/SharedTripStopsPanel";
import { api } from "../../services/api";
import { fareAfterDelivered } from "../../utils/helpers";
import { useAuth } from "../../contexts/AuthContext";
import {
  bookingIdsInOrder,
  buildSharedStops,
  formatStopAddress,
} from "../../utils/sharedTripStops";
import { useLanguage } from "../../contexts/LanguageContext";

function formatBookingWeight(b) {
  const raw = b.cargoRequest?.weight;
  if (raw && !/^(tbd|pending|n\/a)$/i.test(String(raw).trim())) return raw;
  if (Number(b.weightTons) > 0) return `${Number(b.weightTons)} t`;
  return "—";
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

/** Compact 4-step driver progress */
function DriverStepBar({ phase }) {
  const steps = [
    { id: "accept", label: "1. Accept" },
    { id: "pickup", label: "2. Pickup" },
    { id: "transit", label: "3. Transit" },
    { id: "deliver", label: "4. Deliver" },
  ];
  const order = { accept: 0, pickup: 1, transit: 2, deliver: 3, done: 4 };
  const current = order[phase] ?? 0;

  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const done = current > index;
        const active = current === index;
        return (
          <li
            key={step.id}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              active
                ? "bg-secondary-container text-on-secondary"
                : done
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export function SharedTripDetailPage() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pickupBookingId, setPickupBookingId] = useState(null);
  const [deliverBookingId, setDeliverBookingId] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);
  const [deliveringId, setDeliveringId] = useState(null);
  const [pickingId, setPickingId] = useState(null);
  const [showMap, setShowMap] = useState(false);

  const { data: trip, isLoading, error } = useQuery({
    queryKey: ["shared-trip", id],
    queryFn: () => api.getSharedTrip(id),
    retry: false,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["shared-trip", id] });
    qc.invalidateQueries({ queryKey: ["shared-trips-me"] });
    qc.invalidateQueries({ queryKey: ["shared-trips-summary"] });
    qc.invalidateQueries({ queryKey: ["my-shared-trips-dashboard"] });
  }

  const pickupBooking = useMutation({
    mutationFn: ({ bookingId, measuredQuantity, measurementUnit, weightKg, measurements }) =>
      api.pickupSharedBooking(id, bookingId, {
        measuredQuantity,
        measurementUnit,
        weightKg,
        measurements,
      }),
    onSuccess: () => {
      setPickupBookingId(null);
      setPickingId(null);
      refresh();
    },
    onError: () => setPickingId(null),
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
    mutationFn: ({ bookingId, deliveryConfirmCode }) =>
      api.deliverSharedBooking(id, bookingId, { deliveryConfirmCode }),
    onSuccess: () => {
      setDeliveringId(null);
      setDeliverBookingId(null);
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
    if (!navigator.geolocation || !showMap) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setDriverPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [showMap]);

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-on-surface-variant">Loading…</p>;
  }
  if (error || !trip) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-sm text-error">{error?.message || "Trip not found"}</p>
        <Link to="/driver/shared-trips">
          <Button variant="secondary">{t("common.back")}</Button>
        </Link>
      </div>
    );
  }
  if (user?.id && trip.driverId && String(trip.driverId) !== String(user.id)) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-sm text-error">Safarkan wuxuu u yaallaa darawal kale.</p>
        <Link to="/driver/shared-trips">
          <Button variant="secondary">{t("common.back")}</Button>
        </Link>
      </div>
    );
  }

  const needsAccept = trip.status === "Assigned";
  const isFinished = ["Delivered", "Completed", "Cancelled"].includes(trip.status);
  const pendingPickupCount = (trip.bookings || []).filter(
    (b) => !["Pickup", "In Transit", "Delivered"].includes(b.status)
  ).length;
  const allLoadsPickedUp = (trip.bookings || []).length > 0 && pendingPickupCount === 0;
  const canGatherPickup = ["Open for booking", "Full", "Pickup"].includes(trip.status);
  const canInTransit = trip.status === "Pickup" && allLoadsPickedUp;
  const canDeliverLoads = ["In Transit", "Departed"].includes(trip.status);
  const canReorderPickup = canGatherPickup && pendingPickupCount > 1;
  const canCancel = ["Open for booking", "Full"].includes(trip.status);

  const phase = needsAccept
    ? "accept"
    : canDeliverLoads
      ? "deliver"
      : canInTransit || trip.status === "Pickup"
        ? allLoadsPickedUp
          ? "transit"
          : "pickup"
        : isFinished
          ? "done"
          : "pickup";

  const activePickupBooking =
    (trip.bookings || []).find((b) => b.id === pickupBookingId) || null;
  const activeDeliverBooking =
    (trip.bookings || []).find((b) => b.id === deliverBookingId) || null;

  const actionError =
    pickupBooking.error?.message ||
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={trip.id}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={trip.status} />
            <span className="text-on-surface-variant">
              {trip.bookings?.length || 0} load(s)
            </span>
          </span>
        }
        actions={
          <Link to="/driver/shared-trips">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />

      <p className="flex items-start gap-2 text-sm text-on-surface">
        <MapPin size={16} className="mt-0.5 shrink-0 text-secondary-container" />
        <span>
          {trip.pickup} → {trip.destination}
        </span>
      </p>

      {!isFinished ? <DriverStepBar phase={phase} /> : null}

      {actionError ? (
        <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {actionError}
        </p>
      ) : null}

      {/* Step 1 — Accept */}
      {needsAccept ? (
        <section className="rounded-xl border border-secondary-container/40 bg-secondary-fixed/25 p-5">
          <h2 className="text-lg font-semibold text-on-surface">Accept shaqada</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Hal Accept = dhammaan loads-ka. Magacyada = macmiil.
          </p>
          <ul className="mt-4 divide-y divide-outline-variant/50 rounded-lg border border-outline-variant bg-surface-container-lowest">
            {(trip.bookings || []).map((b) => (
              <li key={b.id} className="px-3 py-2.5 text-sm">
                <p className="font-medium text-on-surface">
                  {b.customer || "Macmiil"} · {b.cargoRequestId || "—"}
                </p>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  {formatStopAddress(b.cargoRequest, "pickup")} →{" "}
                  {formatStopAddress(b.cargoRequest, "delivery")}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <SharedTripDecision trip={trip} />
          </div>
        </section>
      ) : null}

      {/* Step 2 — Pickup per load */}
      {!needsAccept && !canDeliverLoads && !isFinished ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-on-surface">Pickup — mid mid</h2>
            {canInTransit ? (
              <Button onClick={() => markInTransit.mutate()} disabled={markInTransit.isPending}>
                {markInTransit.isPending ? "…" : "In Transit"}
              </Button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            Markaad load qaadato → <strong>Pickup</strong> + cabbirka (kg / liter / neef). Dhammaan
            ka dib → In Transit.
          </p>
          <p className="mt-2 text-xs font-medium text-secondary-container">
            {pendingPickupCount > 0
              ? `${pendingPickupCount} load(s) weli lama qaadin`
              : "Dhammaan waa la qaaday — riix In Transit"}
          </p>
          <div className="mt-4">
            <SharedTripStopsPanel
              stops={pickupStops}
              kind="pickup"
              canReorder={canReorderPickup && pickupStops.length > 1}
              canPickup={canGatherPickup}
              pickingId={pickingId}
              onMove={(bookingId, delta) => handleMoveStop("pickup", bookingId, delta)}
              onPickup={(bookingId) => {
                setPickingId(bookingId);
                setPickupBookingId(bookingId);
              }}
            />
          </div>
          {canCancel ? (
            <div className="mt-4 border-t border-outline-variant pt-3">
              <Button
                variant="danger"
                className="px-3 py-1 text-xs"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
              >
                Cancel trip
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Step 4 — Deliver per load */}
      {canDeliverLoads ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <h2 className="text-lg font-semibold text-on-surface">Geeyn — mid mid</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Markaad geeyso load → riix <strong>Delivered</strong>.
          </p>
          <div className="mt-4">
            <SharedTripStopsPanel
              stops={deliveryStops}
              kind="delivery"
              canReorder={deliveryStops.length > 1}
              canDeliver
              deliveringId={deliveringId}
              onMove={(bookingId, delta) => handleMoveStop("delivery", bookingId, delta)}
              onDeliver={(bookingId) => {
                setDeliveringId(bookingId);
                setDeliverBookingId(bookingId);
              }}
            />
          </div>
        </section>
      ) : null}

      {/* Done */}
      {isFinished ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-on-surface">Dhamaaday</h2>
            <StatusBadge status={trip.status} />
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            Macmiilku wuxuu bixiyaa 100% ka dib Delivered.
          </p>
          <ul className="mt-4 space-y-2">
            {(trip.bookings || []).map((b) => (
              <li key={b.id} className="rounded-lg border border-outline-variant px-3 py-2 text-sm">
                <p className="font-medium text-on-surface">
                  {b.customer || "Macmiil"} · {b.cargoRequestId || "—"} · {formatBookingWeight(b)}
                  {" · "}
                  {fareAfterDelivered(
                    b.status || b.cargoRequest?.status,
                    b.cargoRequest?.finalPrice ?? b.cargoRequest?.quotedPrice
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Map — optional, collapsed by default */}
      {!needsAccept && !isFinished ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-semibold text-on-surface"
            onClick={() => setShowMap((v) => !v)}
          >
            GPS live · Road map
            <span className="text-xs font-normal text-on-surface-variant">
              {showMap ? "Qari" : "Fur"}
            </span>
          </button>
          {showMap && !pickupBookingId ? (
            <div className="mt-3 max-w-full overflow-hidden">
              <SharedTripStopsMap
                driverPosition={driverPosition}
                driverName={trip.driver || user?.name || ""}
                pickup={trip.pickup || ""}
                destination={trip.destination || ""}
                className="h-56 w-full max-w-full rounded-xl"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <SharedPickupWeightModal
        trip={trip}
        booking={activePickupBooking}
        open={Boolean(pickupBookingId && activePickupBooking)}
        onClose={() => {
          setPickupBookingId(null);
          setPickingId(null);
        }}
        pending={pickupBooking.isPending}
        onConfirm={(payload) => pickupBooking.mutateAsync(payload)}
      />

      <SharedDeliverCodeModal
        booking={activeDeliverBooking}
        open={Boolean(deliverBookingId && activeDeliverBooking)}
        onClose={() => {
          setDeliverBookingId(null);
          setDeliveringId(null);
        }}
        pending={deliverBooking.isPending}
        onConfirm={(payload) => deliverBooking.mutateAsync(payload)}
      />
    </div>
  );
}
