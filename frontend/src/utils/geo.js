import { SOMALIA_CITIES, SOMALIA_CENTER } from "../constants/map";

const CITY_LIST = Object.values(SOMALIA_CITIES);

const CITY_ALIASES = [
  { lat: 2.0469, lng: 45.3182, names: ["mogadishu", "muqdisho", "xamar", "hamar"] },
  { lat: 9.5624, lng: 44.077, names: ["hargeisa", "hargeysa"] },
  { lat: -0.3557, lng: 42.5457, names: ["kismayo", "kismaayo"] },
  { lat: 3.1167, lng: 43.65, names: ["baidoa", "baydhabo"] },
  { lat: 11.2842, lng: 49.1816, names: ["bosaso", "boosaaso"] },
  { lat: 8.4021, lng: 48.4847, names: ["garowe", "garoowe"] }
];

/** Random coordinates near a major Somali city (for demo / GPS fallback). */
export function randomSomaliaCoords() {
  const base = CITY_LIST[Math.floor(Math.random() * CITY_LIST.length)];
  return {
    lat: base.lat + (Math.random() - 0.5) * 0.12,
    lng: base.lng + (Math.random() - 0.5) * 0.12
  };
}

export function matchSomaliaCity(text = "") {
  const normalized = String(text).toLowerCase();
  for (const city of CITY_ALIASES) {
    if (city.names.some((name) => normalized.includes(name))) {
      return city;
    }
  }
  for (const city of CITY_LIST) {
    if (normalized.includes(city.name.toLowerCase())) {
      return city;
    }
  }
  return null;
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
  if (trip?.lastLocation?.lat != null && trip?.lastLocation?.lng != null) {
    const lat = Number(trip.lastLocation.lat);
    const lng = Number(trip.lastLocation.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const updatedAt = trip.lastLocation.updatedAt
        ? new Date(trip.lastLocation.updatedAt).getTime()
        : 0;
      // Treat location as live GPS only when a recent driver update exists.
      const live = Boolean(updatedAt) && Date.now() - updatedAt < 10 * 60 * 1000;
      return { lat, lng, live };
    }
  }

  const city =
    matchSomaliaCity(trip?.pickup) ||
    matchSomaliaCity(trip?.destination) ||
    SOMALIA_CENTER;
  const offset = stableOffset(trip?.id || trip?.pickup);
  return {
    lat: city.lat + offset.lat,
    lng: city.lng + offset.lng,
    live: false
  };
}

/** Build map markers from trip list (includes trips without live GPS). */
export function tripsToMarkers(trips = []) {
  return (trips || []).map((trip) => {
    const position = resolveTripMapPosition(trip);
    return {
      id: trip.id,
      lat: position.lat,
      lng: position.lng,
      live: position.live,
      label: trip.id,
      subtitle: `${trip.pickup} → ${trip.destination}`,
      driver: trip.driver,
      status: trip.status
    };
  });
}
