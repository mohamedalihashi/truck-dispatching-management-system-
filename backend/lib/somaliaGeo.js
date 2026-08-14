import { DISTRICT_COORDS, REGION_COORDS } from "./somaliaDistrictCoords.js";

/** Legacy city aliases for free-text places. */
const CITY_ALIASES = [
  { lat: 2.0469, lng: 45.3182, names: ["mogadishu", "muqdisho", "xamar", "hamar", "banaadir"] },
  { lat: 9.5624, lng: 44.077, names: ["hargeisa", "hargeysa"] },
  { lat: -0.3557, lng: 42.5457, names: ["kismayo", "kismaayo"] },
  { lat: 3.1167, lng: 43.65, names: ["baidoa", "baydhabo"] },
  { lat: 11.2842, lng: 49.1816, names: ["bosaso", "boosaaso"] },
  { lat: 8.4021, lng: 48.4847, names: ["garowe", "garoowe"] },
  { lat: 9.5221, lng: 45.5336, names: ["burco", "burao"] },
  { lat: 4.736, lng: 45.203, names: ["beledweyne", "beletweyne"] },
  { lat: 6.7697, lng: 47.4308, names: ["gaalkacyo", "galkayo"] },
  { lat: 8.4774, lng: 47.3597, names: ["laascaanood", "lasanod"] },
  { lat: 1.7159, lng: 44.7717, names: ["marka", "merka"] },
  { lat: 2.7809, lng: 45.5005, names: ["jowhar"] },
  { lat: 10.4396, lng: 45.0143, names: ["berbera"] }
];

const DEFAULT_CENTER = { lat: 2.0469, lng: 45.3182 };
/** Roads are longer than straight-line distance. */
export const ROAD_DISTANCE_FACTOR = 1.3;

function normalizeKey(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupDistrict(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  if (DISTRICT_COORDS[key]) return DISTRICT_COORDS[key];
  for (const [district, coords] of Object.entries(DISTRICT_COORDS)) {
    if (key.includes(district) || district.includes(key)) return coords;
  }
  return null;
}

function lookupRegion(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  if (REGION_COORDS[key]) return REGION_COORDS[key];
  for (const [region, coords] of Object.entries(REGION_COORDS)) {
    if (key.includes(region) || region.includes(key)) return coords;
  }
  return null;
}

function lookupCityAlias(text) {
  const normalized = normalizeKey(text);
  for (const city of CITY_ALIASES) {
    if (city.names.some((name) => normalized.includes(name))) {
      return { lat: city.lat, lng: city.lng };
    }
  }
  return null;
}

/**
 * Resolve coordinates from booking location text or structured region/district.
 * Prefers district centroid, then region, then known city aliases.
 */
export function resolveLocationCoords(input = {}) {
  if (typeof input === "string") {
    return coordsFromPlaceName(input);
  }

  const district = input.district || input.fromDistrict || input.toDistrict;
  const region = input.region || input.fromRegion || input.toRegion;
  const text = input.text || input.place || input.pickup || input.destination || "";

  const byDistrict = lookupDistrict(district);
  if (byDistrict) return { ...byDistrict, source: "district" };

  // "neighborhood, district, region"
  const parts = String(text)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const maybeDistrict = lookupDistrict(parts[parts.length - 2]);
    if (maybeDistrict) return { ...maybeDistrict, source: "district" };
    const maybeRegion = lookupRegion(parts[parts.length - 1]);
    if (maybeRegion) return { ...maybeRegion, source: "region" };
  }

  const byRegion = lookupRegion(region);
  if (byRegion) return { ...byRegion, source: "region" };

  const byAlias = lookupCityAlias(text) || lookupCityAlias(district) || lookupCityAlias(region);
  if (byAlias) return { ...byAlias, source: "city" };

  for (const part of parts) {
    const hit = lookupDistrict(part) || lookupRegion(part) || lookupCityAlias(part);
    if (hit) return { ...hit, source: "text" };
  }

  return { ...DEFAULT_CENTER, source: "default" };
}

/** @deprecated Prefer resolveLocationCoords — kept for callers. */
export function coordsFromPlaceName(text = "") {
  const resolved = resolveLocationCoords({ text });
  return { lat: resolved.lat, lng: resolved.lng };
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Road-adjusted distance between two places (km).
 * Same-district trips keep a small local floor so pricing is never ~0.
 */
export function roadDistanceKm(from, to, { roadFactor = ROAD_DISTANCE_FACTOR } = {}) {
  const straight = haversineKm(from.lat, from.lng, to.lat, to.lng);
  if (straight < 3) {
    // Same town / district: local delivery corridor
    return Math.max(5, Math.round(straight * 10) / 10 || 5);
  }
  const road = straight * Number(roadFactor || ROAD_DISTANCE_FACTOR);
  return Math.round(road * 10) / 10;
}

/** Skip GPS points closer than minKm (default ~50 m) to reduce phone GPS jitter. */
export function shouldRecordPoint(lastLat, lastLng, lat, lng, minKm = 0.05) {
  if (lastLat == null || lastLng == null) return true;
  return haversineKm(lastLat, lastLng, lat, lng) >= minKm;
}
