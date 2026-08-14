import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

function toKg(amount, unit) {
  const n = Number(amount);
  if (!(n > 0)) return 0;
  return unit === "tons" ? n * 1000 : n;
}

/**
 * Shared trip pickup: driver enters weight (kg or tons) for each assigned load.
 */
export function SharedPickupWeightModal({ trip, open, onClose, onConfirm, pending = false }) {
  const bookings = trip?.bookings || [];
  const [weights, setWeights] = useState({});
  const [units, setUnits] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !trip) return;
    const nextWeights = {};
    const nextUnits = {};
    for (const b of trip.bookings || []) {
      nextWeights[b.id] = "";
      nextUnits[b.id] = "kg";
    }
    setWeights(nextWeights);
    setUnits(nextUnits);
    setError("");
  }, [open, trip]);

  if (!open || !trip) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const weightsByBookingId = {};
    for (const b of bookings) {
      const unit = units[b.id] === "tons" ? "tons" : "kg";
      const kg = toKg(weights[b.id], unit);
      if (!(kg > 0)) {
        setError(`Gali culeyska load-ka ${b.cargoRequestId || b.id} (kg ama tons)`);
        return;
      }
      weightsByBookingId[b.id] = Math.round(kg * 1000) / 1000;
    }
    setError("");
    await onConfirm({ weightsByBookingId });
  }

  return (
    <Modal title={`Start pickup — ${trip.id}`} onClose={onClose}>
      <p className="mb-3 text-sm text-on-surface-variant">
        Marka aad rarayso alaabta, gali culeyska load kasta — dooro <strong>kg</strong> ama <strong>tons</strong>.
        Qiimaha waxaa loo xisaabinayaa ka dib.
      </p>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <ul className="max-h-64 space-y-3 overflow-y-auto">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-lg border border-outline-variant px-3 py-2">
              <p className="text-sm font-semibold text-on-surface">
                {b.customer || "Customer"} · {b.cargoRequestId || b.id}
              </p>
              <p className="text-xs text-on-surface-variant">
                {b.cargoRequest?.pickup || trip.pickup} → {b.cargoRequest?.destination || trip.destination}
              </p>
              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
                  Culeyska alaabta *
                </span>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <input
                    className="stitch-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={units[b.id] === "tons" ? "e.g. 0.25" : "e.g. 250"}
                    value={weights[b.id] ?? ""}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    required
                  />
                  <select
                    className="stitch-input"
                    value={units[b.id] || "kg"}
                    onChange={(e) => setUnits((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  >
                    <option value="kg">kg</option>
                    <option value="tons">tons</option>
                  </select>
                </div>
              </label>
            </li>
          ))}
        </ul>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !bookings.length}>
            {pending ? "Saving…" : "Confirm pickup"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
