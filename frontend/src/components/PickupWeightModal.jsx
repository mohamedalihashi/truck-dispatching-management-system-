import { useEffect, useMemo, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import {
  resolveCargoMeasurement,
  weightInputToKg,
  validateMeasuredQuantity,
  resolvePickupMeasurements,
} from "../utils/cargoMeasurement";

/**
 * Driver pickup form — adapts to cargo type (KG, Liters, Head).
 * For "Others": show three optional boxes; at least one must be filled.
 */
export function PickupWeightModal({ trip, open, onClose, onConfirm, pending = false }) {
  const cargoType = trip?.cargoType || trip?.cargo || "";
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
  }, [open, trip?.id]);

  if (!open || !trip) return null;

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
      measuredQuantity = resolved.measuredQuantity;
      measurementUnit = resolved.measurementUnit;
      // Keep measurements for mixed cargo persistence on the API.
      setError("");
      await onConfirm({
        id: trip.id,
        status: "Picked Up",
        measuredQuantity,
        measurementUnit,
        measurements: Object.keys(measurements).length ? measurements : undefined,
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
      id: trip.id,
      status: "Picked Up",
      measuredQuantity,
      measurementUnit,
    });
  }

  return (
    <Modal title={`Picked Up — ${trip.id}`} onClose={onClose}>
      <p className="mb-1 text-sm text-on-surface-variant">
        {trip.pickup} → {trip.destination}
      </p>
      {cargoType ? (
        <p className="mb-3 text-xs font-medium text-secondary-container">
          Cargo type: {cargoType}
          {allowUnitChoice ? " (Others — ugu yaraan mid buuxi)" : ""}
        </p>
      ) : (
        <p className="mb-3 text-xs font-medium text-secondary-container">
          Cargo type lama cayimin — ugu yaraan mid ka mid ah KG / Liter / Head.
        </p>
      )}
      <form className="space-y-3" onSubmit={handleSubmit}>
        {allowUnitChoice ? (
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              Saddex box — mid mid optional. Haddii alaabo kala duwan tahay, buuxi kuwa aad u
              baahan tahay (ugu yaraan <strong>hal</strong>). Qiimaha waa la isu daraa.
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
              <p className="mt-1 text-[11px] text-on-surface-variant/70">
                Geel / ari / lo&apos; — tiro dhan kaliya (1, 2, 10…).
              </p>
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
            {unit === "HEAD" ? (
              <p className="mt-1 text-[11px] text-on-surface-variant/70">
                Geel / ari / lo&apos; — geli tiro dhan (1, 2, 10…). Lama oggola 0.1.
              </p>
            ) : null}
            {isWeight ? (
              <p className="mt-1 text-[11px] text-on-surface-variant/70">
                Waxaa lagu kaydinayaa KG. 1 ton = 1,000 kg.
              </p>
            ) : null}
          </label>
        )}
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Confirm Picked Up"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
