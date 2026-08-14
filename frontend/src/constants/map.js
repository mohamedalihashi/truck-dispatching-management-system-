/** Somalia map defaults — centered on Mogadishu */
export const SOMALIA_CENTER = { lat: 2.0469, lng: 45.3182 };

export const SOMALIA_ZOOM = {
  country: 6,
  city: 12,
  tracking: 8,
};

export const SOMALIA_BOUNDS = {
  north: 11.99,
  south: -1.67,
  east: 51.41,
  west: 40.98,
};

export const SOMALIA_CITIES = {
  mogadishu: { lat: 2.0469, lng: 45.3182, name: "Mogadishu" },
  hargeisa: { lat: 9.5624, lng: 44.077, name: "Hargeisa" },
  kismayo: { lat: -0.3557, lng: 42.5457, name: "Kismayo" },
  baidoa: { lat: 3.1167, lng: 43.65, name: "Baidoa" },
  bosaso: { lat: 11.2842, lng: 49.1816, name: "Bosaso" },
  garowe: { lat: 8.4021, lng: 48.4847, name: "Garowe" },
};

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
