import { useEffect, useMemo, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { resolveCargoMeasurement, weightInputToKg } from "../utils/cargoMeasurement";

const UNIT_OPTIONS = [
  { value: "KG", label: "KG / Tons", inputLabel: "Actual Weight", placeholder: "850" },
  { value: "LITER", label: "Liters", inputLabel: "Actual Volume", placeholder: "5000" },
  { value: "HEAD", label: "Head / Neef", inputLabel: "Number of Animals", placeholder: "35" },
];

function labelsForUnit(unit) {
  return UNIT_OPTIONS.find((o) => o.value === unit) || UNIT_OPTIONS[0];
}

/**
 * Driver pickup form — adapts to cargo type (KG, Liters, Head).
 * For "Others" / unknown cargo, driver chooses the measurement unit.
 */
export function PickupWeightModal({ trip, open, onClose, onConfirm, pending = false }) {
  const baseConfig = useMemo(
    () => resolveCargoMeasurement(trip?.cargoType || trip?.cargo || ""),
    [trip?.cargoType, trip?.cargo]
  );
  const allowUnitChoice = Boolean(baseConfig.unitChoice);
  const [selectedUnit, setSelectedUnit] = useState(baseConfig.unit || "KG");
  const [amount, setAmount] = useState("");
  const [inputUnit, setInputUnit] = useState("kg");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedUnit(baseConfig.unit || "KG");
    setAmount("");
    setInputUnit("kg");
    setError("");
  }, [open, trip?.id, baseConfig.unit]);

  if (!open || !trip) return null;

  const unit = allowUnitChoice ? selectedUnit : baseConfig.unit;
  const isWeight = unit === "KG";
  const unitMeta = labelsForUnit(unit);
  const label = allowUnitChoice ? unitMeta.inputLabel : baseConfig.label;
  const placeholder = allowUnitChoice ? unitMeta.placeholder : baseConfig.placeholder;

  async function handleSubmit(event) {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) {
      setError(`Gali ${String(label).toLowerCase()} (number > 0)`);
      return;
    }

    setError("");
    const measuredQuantity = isWeight ? weightInputToKg(value, inputUnit) : value;

    await onConfirm({
      id: trip.id,
      status: "Picked Up",
      measuredQuantity,
      measurementUnit: unit,
    });
  }

  return (
    <Modal title={`Picked Up — ${trip.id}`} onClose={onClose}>
      <p className="mb-1 text-sm text-on-surface-variant">
        {trip.pickup} → {trip.destination}
      </p>
      {trip.cargoType ? (
        <p className="mb-3 text-xs font-medium text-secondary-container">
          Cargo type: {trip.cargoType}
          {allowUnitChoice ? " (Others — dooro cabbirka)" : ""}
        </p>
      ) : (
        <p className="mb-3 text-xs font-medium text-secondary-container">
          Cargo type lama cayimin — dooro cabbirka (KG / Liter / Head).
        </p>
      )}
      <form className="space-y-3" onSubmit={handleSubmit}>
        {allowUnitChoice ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
              Nooca cabbirka *
            </span>
            <select
              className="stitch-input"
              value={selectedUnit}
              onChange={(e) => {
                setSelectedUnit(e.target.value);
                setAmount("");
                setInputUnit("kg");
              }}
            >
              {UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-on-surface-variant">
            {label} *
          </span>
          <div className={isWeight ? "grid grid-cols-[1fr_100px] gap-2" : ""}>
            <input
              className="stitch-input"
              type="number"
              min="0.01"
              step={unit === "HEAD" ? "1" : "0.01"}
              placeholder={isWeight && inputUnit === "tons" ? "e.g. 12" : placeholder}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus={!allowUnitChoice}
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
                {unit === "LITER" ? "Liters" : "Head / Neef"}
              </p>
            )}
          </div>
          {isWeight ? (
            <p className="mt-1 text-[11px] text-on-surface-variant/70">
              Waxaa lagu kaydinayaa KG. 1 ton = 1,000 kg.
            </p>
          ) : null}
        </label>
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
