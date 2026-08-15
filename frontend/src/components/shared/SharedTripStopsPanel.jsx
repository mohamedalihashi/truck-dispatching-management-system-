import { ChevronDown, ChevronUp, MapPin, Phone } from "lucide-react";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { fareAfterDelivered } from "../../utils/helpers";

export function SharedTripStopsPanel({
  stops = [],
  kind = "pickup",
  canReorder = false,
  canDeliver = false,
  canPickup = false,
  onMove,
  onDeliver,
  onPickup,
  deliveringId = null,
  pickingId = null,
}) {
  if (!stops.length) {
    return (
      <p className="text-sm text-on-surface-variant">Ma jiraan stops.</p>
    );
  }

  const pickupDone = (status) => ["Pickup", "In Transit", "Delivered"].includes(status);

  return (
    <ol className="space-y-3">
      {stops.map((stop, index) => (
        <li
          key={stop.id}
          className={`rounded-xl border px-4 py-3 ${
            stop.status === "Delivered" || (kind === "pickup" && pickupDone(stop.status))
              ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
              : "border-outline-variant bg-surface-container-low"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    kind === "pickup" ? "bg-blue-600" : "bg-emerald-600"
                  }`}
                >
                  {stop.order}
                </span>
                <p className="font-semibold text-on-surface">{stop.label}</p>
                <StatusBadge status={stop.status} />
              </div>
              <p className="mt-2 flex items-start gap-1 text-sm text-on-surface">
                <MapPin size={14} className="mt-0.5 shrink-0 text-secondary-container" />
                <span>{stop.address}</span>
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {stop.cargoRequestId || "—"}
                {stop.weight ? ` · ${stop.weight}` : ""}
                {` · ${fareAfterDelivered(stop.status, stop.fare)}`}
              </p>
              {kind === "pickup" && stop.senderPhone ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                  <Phone size={12} /> {stop.senderPhone}
                </p>
              ) : null}
              {kind === "delivery" && stop.receiverPhone ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                  <Phone size={12} /> {stop.receiverPhone}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {canReorder ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMove?.(stop.bookingId, -1)}
                    className="rounded-lg border border-outline-variant p-1.5 disabled:opacity-40"
                    title="Kor u qaad"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={index === stops.length - 1}
                    onClick={() => onMove?.(stop.bookingId, 1)}
                    className="rounded-lg border border-outline-variant p-1.5 disabled:opacity-40"
                    title="Hoos u dhig"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              ) : null}
              {canPickup && kind === "pickup" && !pickupDone(stop.status) ? (
                <Button
                  className="px-2 py-1 text-xs"
                  disabled={pickingId === stop.bookingId}
                  onClick={() => onPickup?.(stop.bookingId)}
                >
                  {pickingId === stop.bookingId ? "…" : "Pickup"}
                </Button>
              ) : null}
              {canDeliver && stop.status !== "Delivered" ? (
                <Button
                  className="px-2 py-1 text-xs"
                  disabled={deliveringId === stop.bookingId}
                  onClick={() => onDeliver?.(stop.bookingId)}
                >
                  {deliveringId === stop.bookingId ? "…" : "Delivered"}
                </Button>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
