import { resolveLocationCoords, roadDistanceKm } from "../lib/somaliaGeo.js";

export const DEFAULT_PRICING = {
  baseFee: 20,
  pricePerKm: 10,
  pricePerTon: 5,
  minimumCharge: 50,
  maximumCharge: null,
  automaticPricing: true,
};

export function parseWeightTons(weight) {
  const numeric = Number.parseFloat(String(weight || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

/**
 * Estimate road distance (km) between pickup and destination.
 * Accepts free-text places and/or structured region/district fields.
 */
export function estimateDistanceKm(pickup, destination, options = {}) {
  const from = resolveLocationCoords({
    text: pickup,
    region: options.fromRegion,
    district: options.fromDistrict,
  });
  const to = resolveLocationCoords({
    text: destination,
    region: options.toRegion,
    district: options.toDistrict,
  });
  return roadDistanceKm(from, to);
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Rough road ETA for Somalia corridors (~40 km/h average).
 * Short trips → minutes/hours; longer trips → days (24h calendar days).
 */
export function estimateEtaLabel(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  if (km <= 0) return "1 hour";

  const hoursExact = km / 40;
  if (hoursExact < 1) {
    const minutes = Math.max(15, Math.round(hoursExact * 60));
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }

  if (hoursExact < 24) {
    const hours = Math.max(1, Math.ceil(hoursExact));
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  const days = Math.max(1, Math.ceil(hoursExact / 24));
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * Total = base + (distance × perKm) + (weight × perTon), clamped to min/max.
 */
export function calculateTransportPrice({
  distanceKm,
  weightTons,
  baseFee,
  pricePerKm,
  pricePerTon,
  minimumCharge,
  maximumCharge,
}) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const weight = Math.max(0, Number(weightTons) || 0);
  let raw =
    Number(baseFee || 0) +
    distance * Number(pricePerKm || 0) +
    weight * Number(pricePerTon || 0);

  raw = roundMoney(raw);
  const min = Number(minimumCharge || 0);
  if (raw < min) raw = roundMoney(min);
  if (maximumCharge != null && maximumCharge !== "" && Number(maximumCharge) > 0) {
    raw = Math.min(raw, roundMoney(Number(maximumCharge)));
  }

  return {
    distanceKm: roundMoney(distance),
    weightTons: roundMoney(weight),
    calculatedPrice: raw,
    breakdown: {
      baseFee: roundMoney(baseFee),
      distanceCharge: roundMoney(distance * Number(pricePerKm || 0)),
      weightCharge: roundMoney(weight * Number(pricePerTon || 0)),
      minimumCharge: roundMoney(min),
      maximumCharge:
        maximumCharge != null && maximumCharge !== "" ? roundMoney(Number(maximumCharge)) : null,
    },
  };
}

/**
 * Apply dispatcher adjustment on top of calculated price.
 * @param {"Increase"|"Discount"|"Fixed"} adjustmentType
 */
export function applyPriceAdjustment({
  calculatedPrice,
  adjustmentType,
  adjustmentAmount,
}) {
  const base = roundMoney(calculatedPrice);
  const amount = roundMoney(adjustmentAmount);
  let finalPrice = base;

  if (adjustmentType === "Increase") {
    finalPrice = roundMoney(base + amount);
  } else if (adjustmentType === "Discount") {
    finalPrice = roundMoney(Math.max(0, base - amount));
  } else if (adjustmentType === "Fixed") {
    finalPrice = amount;
  } else {
    finalPrice = base;
  }

  return {
    calculatedPrice: base,
    adjustmentType: adjustmentType || null,
    adjustmentAmount: adjustmentType ? amount : null,
    finalPrice,
    changed: roundMoney(finalPrice) !== base,
  };
}

export function mapPricingSettings(row) {
  if (!row) return { ...DEFAULT_PRICING };
  return {
    id: row.id,
    baseFee: Number(row.baseFee),
    pricePerKm: Number(row.pricePerKm),
    pricePerTon: Number(row.pricePerTon),
    minimumCharge: Number(row.minimumCharge),
    maximumCharge: row.maximumCharge != null ? Number(row.maximumCharge) : null,
    automaticPricing: Boolean(row.automaticPricing),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
