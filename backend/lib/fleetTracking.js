import { haversineKm } from "./somaliaGeo.js";

/** Configurable fleet tracking thresholds (seconds / km/h / meters). */
export const FLEET_DEFAULTS = {
  onlineWithinSec: 90,
  idleSpeedKmh: 3,
  idleAfterSec: 180,
  trackingIntervalSec: 10,
  routeDeviationM: 800,
  overspeedKmh: 100,
};

export function getFleetSettings(raw = {}) {
  return {
    onlineWithinSec: Number(raw.onlineWithinSec) > 0 ? Number(raw.onlineWithinSec) : FLEET_DEFAULTS.onlineWithinSec,
    idleSpeedKmh: Number(raw.idleSpeedKmh) >= 0 ? Number(raw.idleSpeedKmh) : FLEET_DEFAULTS.idleSpeedKmh,
    idleAfterSec: Number(raw.idleAfterSec) > 0 ? Number(raw.idleAfterSec) : FLEET_DEFAULTS.idleAfterSec,
    trackingIntervalSec:
      Number(raw.trackingIntervalSec) > 0 ? Number(raw.trackingIntervalSec) : FLEET_DEFAULTS.trackingIntervalSec,
    routeDeviationM:
      Number(raw.routeDeviationM) > 0 ? Number(raw.routeDeviationM) : FLEET_DEFAULTS.routeDeviationM,
    overspeedKmh: Number(raw.overspeedKmh) > 0 ? Number(raw.overspeedKmh) : FLEET_DEFAULTS.overspeedKmh,
  };
}

/**
 * Derive GPS presence status from last ping + speed.
 * ONLINE is used as MOVING | IDLE when connected; OFFLINE when stale.
 */
export function resolveGpsStatus({
  lastLocationAt,
  speedKmh = 0,
  now = Date.now(),
  settings = FLEET_DEFAULTS,
} = {}) {
  if (!lastLocationAt) return "OFFLINE";
  const ageSec = Math.max(0, (now - new Date(lastLocationAt).getTime()) / 1000);
  if (ageSec > settings.onlineWithinSec) return "OFFLINE";
  const speed = Number(speedKmh) || 0;
  if (speed <= settings.idleSpeedKmh) return "IDLE";
  return "MOVING";
}

export function metersBetween(lat1, lng1, lat2, lng2) {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000;
}

export function pointInGeofence({ lat, lng }, fence) {
  const d = metersBetween(lat, lng, fence.centerLat, fence.centerLng);
  return d <= Number(fence.radiusM);
}

/** Rough ETA from remaining km and recent speed (fallback 40 km/h). */
export function estimateEta({ remainingKm, speedKmh, avgSpeedKmh }) {
  const rem = Number(remainingKm);
  if (!Number.isFinite(rem) || rem <= 0) {
    return { etaMinutes: 0, etaAt: new Date().toISOString() };
  }
  const speed = Number(speedKmh) > 5 ? Number(speedKmh) : Number(avgSpeedKmh) > 5 ? Number(avgSpeedKmh) : 40;
  const hours = rem / speed;
  const etaMinutes = Math.round(hours * 60);
  return {
    etaMinutes,
    etaAt: new Date(Date.now() + etaMinutes * 60_000).toISOString(),
    assumedSpeedKmh: Math.round(speed * 10) / 10,
  };
}

export function tripProgress({
  plannedDistanceKm,
  completedDistanceKm,
  currentLat,
  currentLng,
  destinationLat,
  destinationLng,
  speedKmh,
}) {
  const planned = Number(plannedDistanceKm);
  const completed = Number(completedDistanceKm) || 0;
  let remaining =
    currentLat != null &&
    currentLng != null &&
    destinationLat != null &&
    destinationLng != null
      ? haversineKm(currentLat, currentLng, destinationLat, destinationLng) * 1.3
      : Number.isFinite(planned)
        ? Math.max(0, planned - completed)
        : null;

  if (remaining != null) remaining = Math.round(remaining * 10) / 10;
  const total =
    Number.isFinite(planned) && planned > 0
      ? planned
      : remaining != null
        ? Math.round((completed + remaining) * 10) / 10
        : null;

  const eta = remaining != null ? estimateEta({ remainingKm: remaining, speedKmh }) : null;

  return {
    plannedDistanceKm: total,
    completedDistanceKm: Math.round(completed * 10) / 10,
    remainingDistanceKm: remaining,
    percentComplete:
      total > 0 ? Math.min(100, Math.round((completed / total) * 1000) / 10) : null,
    etaMinutes: eta?.etaMinutes ?? null,
    etaAt: eta?.etaAt ?? null,
  };
}

/** Max distance from polyline (simple point-to-segment) in meters. */
export function maxDeviationFromRouteM(point, routePoints = []) {
  if (!point || routePoints.length < 2) return 0;
  let min = Infinity;
  for (let i = 0; i < routePoints.length - 1; i += 1) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const d = distancePointToSegmentM(point, a, b);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : 0;
}

function distancePointToSegmentM(p, a, b) {
  const toRad = Math.PI / 180;
  const ax = a.lng * toRad;
  const ay = a.lat * toRad;
  const bx = b.lng * toRad;
  const by = b.lat * toRad;
  const px = p.lng * toRad;
  const py = p.lat * toRad;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return metersBetween(p.lat, p.lng, a.lat, a.lng);
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const lat = a.lat + t * (b.lat - a.lat);
  const lng = a.lng + t * (b.lng - a.lng);
  return metersBetween(p.lat, p.lng, lat, lng);
}

export function msToAgoLabel(lastLocationAt, now = Date.now()) {
  if (!lastLocationAt) return "never";
  const sec = Math.max(0, Math.round((now - new Date(lastLocationAt).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}
