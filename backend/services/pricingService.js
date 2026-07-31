import { resolveLocationCoords, roadDistanceKm } from "../lib/somaliaGeo.js";

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

/**
 * Rough road ETA for Somalia corridors (~40 km/h average).
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
