import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Weight } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { SharedTripJourney } from "../../components/SharedTripJourney";
import { api } from "../../services/api";
import { money } from "../../utils/helpers";
import { useLanguage } from "../../contexts/LanguageContext";

function formatDuration(amount, unit) {
  if (amount == null || !unit) return null;
  const n = Number(amount);
  if (!(n > 0)) return null;
  const label = unit === "days" ? (n === 1 ? "day" : "days") : n === 1 ? "hour" : "hours";
  return `${n} ${label}`;
}

export function SharedTripDetailPage() {
  const { id } = useParams();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { data: trip, isLoading } = useQuery({
    queryKey: ["shared-trip", id],
    queryFn: () => api.getSharedTrip(id)
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["shared-trip", id] });
    qc.invalidateQueries({ queryKey: ["shared-trips-me"] });
    qc.invalidateQueries({ queryKey: ["shared-trips-summary"] });
    qc.invalidateQueries({ queryKey: ["my-shared-trips-dashboard"] });
  }

  const startPickup = useMutation({
    mutationFn: () => api.startSharedTripPickup(id),
    onSuccess: refresh
  });

  const markInTransit = useMutation({
    mutationFn: () => api.markSharedTripInTransit(id),
    onSuccess: refresh
  });

  const markDelivered = useMutation({
    mutationFn: () => api.markSharedTripDelivered(id),
    onSuccess: refresh
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelSharedTrip(id),
    onSuccess: refresh
  });

  if (isLoading) return <p className="py-16 text-center text-sm text-on-surface-variant">Loading…</p>;
  if (!trip) return <p className="py-16 text-center text-sm text-error">Trip not found</p>;

  const canPickup = ["Open for booking", "Full"].includes(trip.status);
  const canInTransit = trip.status === "Pickup";
  const canDeliver = ["In Transit", "Departed"].includes(trip.status);
  const canEdit = trip.status === "Open for booking";
  const canCancel = ["Open for booking", "Full"].includes(trip.status);
  const durationLabel = formatDuration(trip.durationAmount, trip.durationUnit);
  const actionError =
    startPickup.error?.message ||
    markInTransit.error?.message ||
    markDelivered.error?.message ||
    cancel.error?.message;

  return (
    <div className="space-y-8">
      <PageHeader
        title={trip.id}
        subtitle="Shared load — customers pay the full fare once before pickup, then In Transit, then Delivered."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/driver/shared-trips">
              <Button variant="secondary">{t("common.back")}</Button>
            </Link>
            {canEdit ? (
              <Link to={`/driver/shared-trips/${trip.id}/edit`}>
                <Button variant="secondary">{t("common.edit")}</Button>
              </Link>
            ) : null}
            {canPickup ? (
              <Button onClick={() => startPickup.mutate()} disabled={startPickup.isPending}>
                {startPickup.isPending ? t("common.loading") : t("driver.startPickup")}
              </Button>
            ) : null}
            {canInTransit ? (
              <Button onClick={() => markInTransit.mutate()} disabled={markInTransit.isPending}>
                {markInTransit.isPending ? t("common.loading") : t("driver.markInTransit")}
              </Button>
            ) : null}
            {canDeliver ? (
              <Button onClick={() => markDelivered.mutate()} disabled={markDelivered.isPending}>
                {markDelivered.isPending ? t("common.loading") : t("driver.markDelivered")}
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

      {actionError ? (
        <p className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{actionError}</p>
      ) : null}

      <SharedTripJourney status={trip.status} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-on-surface">Route</h2>
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
          <h2 className="text-lg font-semibold text-on-surface">Customer bookings</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Customers must pay the full fare after booking. You can start pickup only when every payment is complete.
          </p>
          {!trip.bookings?.length ? (
            <p className="mt-3 text-sm text-on-surface-variant">No bookings yet — trip is waiting for customers.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {trip.bookings.map((b) => (
                <li key={b.id} className="rounded-lg border border-outline-variant px-3 py-2 text-sm">
                  <p className="font-semibold text-on-surface">{b.customer || "Customer"} · {b.weightTons}t</p>
                  <p className="text-on-surface-variant">
                    {b.cargoRequestId || "—"} · <StatusBadge status={b.status} />
                    {b.cargoRequest?.finalPrice != null ? ` · ${money(b.cargoRequest.finalPrice)}` : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {trip.bookings?.length ? (
            <Link to="/driver/jobs" className="mt-4 inline-block text-sm font-semibold text-secondary hover:underline">
              Open Bookings / payments →
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
