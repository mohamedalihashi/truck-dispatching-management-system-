import { SOMALIA_BOUNDS, SOMALIA_CITIES, SOMALIA_CENTER } from "../constants/map";
import { DISTRICT_COORDS, REGION_COORDS } from "../data/somaliaDistrictCoords";

const CITY_LIST = Object.values(SOMALIA_CITIES);

/** City-level only — do NOT put Mogadishu districts here (they collapse FROM/TO). */
const CITY_ALIASES = [
  { lat: 2.0469, lng: 45.3182, names: ["mogadishu", "muqdisho", "xamar", "hamar"] },
  { lat: 9.5624, lng: 44.077, names: ["hargeisa", "hargeysa"] },
  { lat: -0.3557, lng: 42.5457, names: ["kismayo", "kismaayo"] },
  { lat: 3.1167, lng: 43.65, names: ["baidoa", "baydhabo"] },
  { lat: 11.2842, lng: 49.1816, names: ["bosaso", "boosaaso"] },
  { lat: 8.4021, lng: 48.4847, names: ["garowe", "garoowe"] },
  { lat: 6.7697, lng: 47.4308, names: ["galkayo", "gaalkacyo"] },
  { lat: 4.7358, lng: 45.2036, names: ["beledweyne", "beled weyne"] },
  { lat: 1.7159, lng: 44.7717, names: ["marka", "merca"] },
  { lat: 9.5221, lng: 45.5336, names: ["burao", "burco"] },
  { lat: 10.4396, lng: 45.0143, names: ["berbera"] },
  { lat: 2.7809, lng: 45.5005, names: ["jowhar", "jawhar"] },
  { lat: 2.15, lng: 45.1167, names: ["afgooye", "afgoi"] },
];

/** Extra spellings → DISTRICT_COORDS keys */
const DISTRICT_SPELLINGS = {
  daynile: "dayniile",
  dayniile: "dayniile",
  medina: "wadajir",
  "warta nabada": "warta nabadda",
  karan: "kaaraan",
  kaaran: "kaaraan",
  dharkenley: "dharkeenley",
};

/** Mogadishu-only districts — never win when the address names another region/district far away. */
const BANAADIR_DISTRICTS = new Set([
  "cabdicasiis",
  "boondheere",
  "dayniile",
  "dharkeenley",
  "garasbaaley",
  "heliwaa",
  "hodan",
  "howlwadaag",
  "kaaraan",
  "kaxda",
  "shangaani",
  "shibis",
  "waaberi",
  "wadajir",
  "warta nabadda",
  "xamar jajab",
  "xamar weyne",
  "yaaqshiid",
]);

const DISTRICT_KEYS = Object.keys(DISTRICT_COORDS).sort((a, b) => b.length - a.length);
const REGION_KEYS = Object.keys(REGION_COORDS).sort((a, b) => b.length - a.length);

export function isInSomalia(lat, lng) {
  return (
    lat >= SOMALIA_BOUNDS.south &&
    lat <= SOMALIA_BOUNDS.north &&
    lng >= SOMALIA_BOUNDS.west &&
    lng <= SOMALIA_BOUNDS.east
  );
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function normalizePlaceText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupDistrictKey(fragment = "") {
  const normalized = normalizePlaceText(fragment);
  if (!normalized) return null;

  for (const [spell, key] of Object.entries(DISTRICT_SPELLINGS)) {
    if (normalized === spell || normalized.includes(spell)) {
      if (DISTRICT_COORDS[key]) return key;
    }
  }
  for (const key of DISTRICT_KEYS) {
    if (normalized === key || normalized.includes(key)) return key;
  }
  return null;
}

function coordsForDistrictKey(key, level = "district") {
  const c = DISTRICT_COORDS[key];
  if (!c) return null;
  return { lat: c.lat, lng: c.lng, name: key, level };
}

function lookupRegionCoords(fragment = "") {
  const normalized = normalizePlaceText(fragment);
  if (!normalized) return null;
  for (const key of REGION_KEYS) {
    if (normalized === key || normalized.includes(key)) {
      const c = REGION_COORDS[key];
      return { lat: c.lat, lng: c.lng, name: key, level: "region" };
    }
  }
  return null;
}

function lookupCityCoords(fragment = "") {
  const normalized = normalizePlaceText(fragment);
  if (!normalized) return null;
  for (const city of CITY_ALIASES) {
    if (city.names.some((name) => normalized.includes(name))) {
      return { lat: city.lat, lng: city.lng, name: city.names[0], level: "city" };
    }
  }
  for (const city of CITY_LIST) {
    if (normalized.includes(city.name.toLowerCase())) {
      return { lat: city.lat, lng: city.lng, name: city.name, level: "city" };
    }
  }
  return null;
}

/**
 * Prefer district/region from structured "neighborhood, district, region".
 * Stops Mogadishu neighborhoods (e.g. Dayniile) winning when the trip is in Boorama/Awdal.
 */
function matchStructuredPlace(text = "") {
  const parts = String(text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  // Standard booking format: neighborhood, district, region
  const districtPart = parts.length >= 2 ? parts[parts.length - 2] : "";
  const regionPart = parts.length >= 3 ? parts[parts.length - 1] : parts[parts.length - 1];

  const districtKey = lookupDistrictKey(districtPart);
  if (districtKey) return coordsForDistrictKey(districtKey);

  const city = lookupCityCoords(districtPart);
  if (city) return city;

  const region = lookupRegionCoords(regionPart);
  if (region) return region;

  return null;
}

/** If text also names a distant region/district, ignore Banaadir-only hits. */
function conflictsWithContext(candidate, fullText) {
  if (!candidate || !BANAADIR_DISTRICTS.has(String(candidate.name || "").toLowerCase())) {
    return false;
  }
  const normalized = normalizePlaceText(fullText);
  // Explicit other regions / districts in the same string → reject Mogadishu pin
  for (const key of REGION_KEYS) {
    if (key === "banaadir") continue;
    if (normalized.includes(key)) {
      const region = REGION_COORDS[key];
      if (region && haversineKm(candidate, region) > 80) return true;
    }
  }
  for (const key of DISTRICT_KEYS) {
    if (BANAADIR_DISTRICTS.has(key)) continue;
    if (normalized.includes(key)) {
      const district = DISTRICT_COORDS[key];
      if (district && haversineKm(candidate, district) > 80) return true;
    }
  }
  return false;
}

/**
 * Match district → city → region from free text (pickup / destination).
 * For "neighborhood, district, region" always prefer district/region over neighborhood.
 */
export function matchSomaliaPlace(text = "", { district, region } = {}) {
  // Explicit structured fields from trip/cargo beat free-text neighborhood names.
  if (district) {
    const key = lookupDistrictKey(district);
    if (key) return coordsForDistrictKey(key);
    const city = lookupCityCoords(district);
    if (city) return city;
  }
  if (region) {
    const byRegion = lookupRegionCoords(region);
    if (byRegion) return byRegion;
  }

  const structured = matchStructuredPlace(text);
  if (structured) return structured;

  const normalized = normalizePlaceText(text);
  if (!normalized) return null;

  for (const [spell, key] of Object.entries(DISTRICT_SPELLINGS)) {
    if (normalized.includes(spell) && DISTRICT_COORDS[key]) {
      const hit = coordsForDistrictKey(key);
      if (hit && !conflictsWithContext(hit, text)) return hit;
    }
  }

  for (const key of DISTRICT_KEYS) {
    if (normalized.includes(key) && DISTRICT_COORDS[key]) {
      const hit = coordsForDistrictKey(key);
      if (hit && !conflictsWithContext(hit, text)) return hit;
    }
  }

  const city = lookupCityCoords(normalized);
  if (city) return city;

  const regionHit = lookupRegionCoords(normalized);
  if (regionHit) return regionHit;

  return null;
}

/** @deprecated prefer matchSomaliaPlace — kept for callers */
export function matchSomaliaCity(text = "") {
  return matchSomaliaPlace(text);
}

function stableOffset(id, scale = 0.06) {
  const key = String(id || "trip");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const angle = ((hash % 1000) / 1000) * Math.PI * 2;
  const radius = (((hash >> 10) % 1000) / 1000) * scale;
  return { lat: Math.cos(angle) * radius, lng: Math.sin(angle) * radius };
}

/** Prefer live GPS; otherwise place the trip near its pickup/destination city. */
export function resolveTripMapPosition(trip) {
  const candidates = [
    trip?.lastLocation,
    trip?.activeTrip?.lastLocation,
    trip?.lastLat != null && trip?.lastLng != null
      ? { lat: trip.lastLat, lng: trip.lastLng }
      : null,
  ];

  for (const loc of candidates) {
    if (loc?.lat == null || loc?.lng == null) continue;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, live: true };
    }
  }

  const city =
    matchSomaliaPlace(trip?.pickup, {
      district: trip?.fromDistrict,
      region: trip?.fromRegion,
    }) ||
    matchSomaliaPlace(trip?.destination, {
      district: trip?.toDistrict,
      region: trip?.toRegion,
    }) ||
    SOMALIA_CENTER;
  const offset = stableOffset(trip?.id || trip?.pickup);
  return {
    lat: city.lat + offset.lat,
    lng: city.lng + offset.lng,
    live: false,
  };
}

/** Pickup / origin pin for road map. */
export function resolveOriginPoint(trip, gpsTrail = []) {
  const pickup = trip?.pickup || trip?.activeTrip?.pickup;
  const place = matchSomaliaPlace(pickup, {
    district: trip?.fromDistrict || trip?.activeTrip?.fromDistrict,
    region: trip?.fromRegion || trip?.activeTrip?.fromRegion,
  });
  if (place) return { lat: place.lat, lng: place.lng, label: pickup || place.name };

  // First GPS breadcrumb as start if place text did not resolve
  if (Array.isArray(gpsTrail) && gpsTrail.length) {
    const first = gpsTrail.find(
      (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
    );
    if (first) {
      return {
        lat: Number(first.lat),
        lng: Number(first.lng),
        label: pickup || "Start",
      };
    }
  }
  return null;
}

/** Destination pin for road map. */
export function resolveDestinationPoint(trip) {
  const dest = trip?.destination || trip?.activeTrip?.destination;
  const place = matchSomaliaPlace(dest, {
    district: trip?.toDistrict || trip?.activeTrip?.toDistrict,
    region: trip?.toRegion || trip?.activeTrip?.toRegion,
  });
  if (place) return { lat: place.lat, lng: place.lng, label: dest || place.name };
  return null;
}

/** Curved fallback path when OSRM is unavailable. */
export function buildFallbackRoadPath(origin, destination, steps = 32) {
  if (!origin || !destination) return [];
  if (haversineKm(origin, destination) < 0.05) return [];
  const points = [];
  const midLat = (origin.lat + destination.lat) / 2;
  const midLng = (origin.lng + destination.lng) / 2;
  const dx = destination.lng - origin.lng;
  const dy = destination.lat - origin.lat;
  const bendLat = midLat + dx * 0.12;
  const bendLng = midLng - dy * 0.12;

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      lat: u * u * origin.lat + 2 * u * t * bendLat + t * t * destination.lat,
      lng: u * u * origin.lng + 2 * u * t * bendLng + t * t * destination.lng,
    });
  }
  return points;
}

/**
 * Pins + fallback corridor. Do NOT use short GPS trails as the “road”
 * (that caused the 2-point red stub). OSRM fills the real road separately.
 */
export function buildTripRoadDisplay({ trip, gpsTrail = [] } = {}) {
  const origin = resolveOriginPoint(trip, gpsTrail);
  const destination = resolveDestinationPoint(trip);
  const live = resolveTripMapPosition(trip);
  const livePoint =
    live?.live && Number.isFinite(live.lat) ? { lat: live.lat, lng: live.lng } : null;

  let routePoints = [];
  if (origin && destination && haversineKm(origin, destination) >= 0.05) {
    routePoints = buildFallbackRoadPath(origin, destination);
  } else if (origin && livePoint) {
    routePoints = buildFallbackRoadPath(origin, livePoint);
  } else if (livePoint && destination) {
    routePoints = buildFallbackRoadPath(livePoint, destination);
  }

  return { origin, destination, livePoint, routePoints };
}

/**
 * Fetch driving geometry from public OSRM.
 * Optional `via` (live truck) so the road bends through current position.
 */
export async function fetchOsrmRoadPath(origin, destination, via = null) {
  if (!origin || !destination) return null;
  if (haversineKm(origin, destination) < 0.05) return null;

  const parts = [`${origin.lng},${origin.lat}`];
  if (via && Number.isFinite(via.lat) && Number.isFinite(via.lng)) {
    // Skip via if too close to ends
    if (haversineKm(origin, via) > 0.15 && haversineKm(via, destination) > 0.15) {
      parts.push(`${via.lng},${via.lat}`);
    }
  }
  parts.push(`${destination.lng},${destination.lat}`);

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${parts.join(";")}` +
    `?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return null;
  }
}

/** Build map markers from trips that have real GPS only. */
export function tripsToMarkers(trips = []) {
  const markers = [];
  for (const trip of trips || []) {
    const position = resolveTripMapPosition(trip);
    if (!position.live) continue;
    markers.push({
      id: trip.id,
      lat: position.lat,
      lng: position.lng,
      live: true,
      label: trip.truckNumber || trip.truck || trip.plateNumber || trip.id,
      subtitle: `${trip.pickup || trip.activeTrip?.pickup || "—"} → ${trip.destination || trip.activeTrip?.destination || "—"}`,
      driver: trip.driver || trip.driverName || null,
      status: trip.status || trip.activeTrip?.status,
      gpsStatus: trip.gpsStatus || trip.lastLocation?.gpsStatus || null,
      speedKmh: trip.lastLocation?.speedKmh ?? trip.speedKmh ?? null,
      lastSeenLabel: trip.lastSeenLabel || null,
    });
  }
  return markers;
}
