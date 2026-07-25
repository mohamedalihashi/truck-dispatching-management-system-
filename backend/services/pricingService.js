import { coordsFromPlaceName, haversineKm } from "../lib/somaliaGeo.js";

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

export function estimateDistanceKm(pickup, destination) {
  const from = coordsFromPlaceName(pickup);
  const to = coordsFromPlaceName(destination);
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
  // Same-city / unknown places can yield ~0; keep a small floor for pricing.
  return Math.max(1, Math.round(km * 10) / 10);
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Rough road ETA for Somalia corridors (~40 km/h average). */
export function estimateEtaLabel(distanceKm) {
  const km = Math.max(1, Number(distanceKm) || 1);
  const hours = Math.max(1, Math.ceil(km / 40));
  const minutes = hours === 1 && km < 40 ? Math.max(30, Math.round((km / 40) * 60)) : 0;
  if (hours === 1 && minutes > 0 && minutes < 60) return `0h ${minutes}m`;
  return `${hours}h 00m`;
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
