import { useEffect, useMemo, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { formatStopAddress } from "../utils/sharedTripStops";
import {
  resolveCargoMeasurement,
  weightInputToKg,
  validateMeasuredQuantity,
  resolvePickupMeasurements,
} from "../utils/cargoMeasurement";

/**
 * Pickup one shared load — measurement follows cargo type (KG / LITER / HEAD).
 * For Others: three optional boxes, at least one required.
 */
export function SharedPickupWeightModal({
  trip,
  booking = null,
  open,
  onClose,
  onConfirm,
  pending = false,
}) {
  const cargoType =
    booking?.cargoRequest?.cargoType || booking?.cargoType || booking?.cargo || "";
  const baseConfig = useMemo(() => resolveCargoMeasurement(cargoType), [cargoType]);
  const allowUnitChoice = Boolean(baseConfig.unitChoice);

  const [amount, setAmount] = useState("");
  const [inputUnit, setInputUnit] = useState("kg");
  const [kgAmount, setKgAmount] = useState("");
  const [kgUnit, setKgUnit] = useState("kg");
  const [literAmount, setLiterAmount] = useState("");
  const [headAmount, setHeadAmount] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setInputUnit("kg");
    setKgAmount("");
    setKgUnit("kg");
    setLiterAmount("");
    setHeadAmount("");
    setError("");
  }, [open, booking?.id]);

  if (!open || !trip || !booking) return null;

  const unit = baseConfig.unit;
  const isWeight = !allowUnitChoice && unit === "KG";
  const label = baseConfig.label;
  const placeholder = baseConfig.placeholder;

  async function handleSubmit(event) {
    event.preventDefault();

    let measuredQuantity;
    let measurementUnit;

    if (allowUnitChoice) {
      const kg = weightInputToKg(Number(kgAmount), kgUnit);
      const liters = Number(literAmount);
      const heads = Number(headAmount);
      const measurements = {
        ...(kg > 0 ? { kg } : {}),
        ...(liters > 0 ? { liter: liters } : {}),
        ...(heads > 0 ? { head: heads } : {}),
      };
      const resolved = resolvePickupMeasurements({ measurements }, cargoType);
      if (!resolved.ok) {
        setError(resolved.message);
        return;
      }
      setError("");
      await onConfirm({
        bookingId: booking.id,
        measuredQuantity: resolved.measuredQuantity,
        measurementUnit: resolved.measurementUnit,
        measurements: Object.keys(measurements).length ? measurements : undefined,
        weightKg: resolved.measurementUnit === "KG" ? resolved.measuredQuantity : undefined,
      });
      return;
    } else {
      const value = Number(amount);
      measuredQuantity = isWeight ? weightInputToKg(value, inputUnit) : value;
      const check = validateMeasuredQuantity(measuredQuantity, unit, cargoType);
      if (!check.ok) {
        setError(check.message);
        return;
      }
      measuredQuantity = check.quantity;
      measurementUnit = check.unit;
    }

    setError("");
    await onConfirm({
      bookingId: booking.id,
      measuredQuantity,
      measurementUnit,
      weightKg: measurementUnit === "KG" ? measuredQuantity : undefined,
    });
  }

  return (
    <Modal title={`Pickup — ${booking.cargoRequestId || booking.id}`} onClose={onClose}>
      <p className="mb-3 text-sm text-on-surface-variant">
        Status-ka <strong>Pickup</strong> wuxuu u baahan yahay cabbirka dhabta ah ee load-kan.
      </p>
      <div className="mb-3 rounded-lg border border-outline-variant px-3 py-2 text-sm">
        <p className="font-semibold text-on-surface">
          Macmiil: {booking.customer || "—"} · {booking.cargoRequestId || booking.id}
        </p>
        {cargoType ? (
          <p className="mt-1 text-xs font-medium text-secondary-container">
            Cargo: {cargoType}
            {allowUnitChoice ? " (Others — ugu yaraan mid buuxi)" : ""}
          </p>
        ) : null}
        <p className="mt-1 text-on-surface-variant">
          Qaadis: {formatStopAddress(booking.cargoRequest, "pickup") || trip.pickup}
        </p>
        <p className="mt-1 text-on-surface-variant">
          Geeyn: {formatStopAddress(booking.cargoRequest, "delivery") || trip.destination}
        </p>
      </div>
      <form className="space-y-3" onSubmit={handleSubmit}>
        {allowUnitChoice ? (
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              Saddex box — mid mid optional. Alaabo kala duwan? Buuxi kuwa aad u baahan tahay (ugu
              yaraan <strong>hal</strong>). Qiimaha waa la isu daraa.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
                Weight (KG / Tons)
              </span>
              <div className="grid grid-cols-[1fr_100px] gap-2">
                <input
                  className="stitch-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 850"
                  value={kgAmount}
                  onChange={(e) => setKgAmount(e.target.value)}
                />
                <select
                  className="stitch-input"
                  value={kgUnit}
                  onChange={(e) => setKgUnit(e.target.value)}
                >
                  <option value="kg">kg</option>
                  <option value="tons">tons</option>
                </select>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
                Volume (Liters)
              </span>
              <input
                className="stitch-input w-full"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 5000"
                value={literAmount}
                onChange={(e) => setLiterAmount(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
                Head / Neef (tiro dhan)
              </span>
              <input
                className="stitch-input w-full"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="e.g. 35"
                value={headAmount}
                onChange={(e) => setHeadAmount(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
              {label} *
            </span>
            <div className={isWeight ? "grid grid-cols-[1fr_100px] gap-2" : ""}>
              <input
                className="stitch-input"
                type="number"
                min={unit === "HEAD" ? "1" : "0.01"}
                step={unit === "HEAD" ? "1" : "0.01"}
                inputMode={unit === "HEAD" ? "numeric" : "decimal"}
                placeholder={isWeight && inputUnit === "tons" ? "e.g. 12" : placeholder}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
              {isWeight ? (
                <select
                  className="stitch-input"
                  value={inputUnit}
                  onChange={(e) => setInputUnit(e.target.value)}
                >
                  <option value="kg">kg</option>
                  <option value="tons">tons</option>
                </select>
              ) : (
                <p className="mt-2 text-xs text-on-surface-variant">
                  {unit === "LITER" ? "Liters" : "Head / Neef (tiro dhan kaliya)"}
                </p>
              )}
            </div>
          </label>
        )}
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Confirm Pickup"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
