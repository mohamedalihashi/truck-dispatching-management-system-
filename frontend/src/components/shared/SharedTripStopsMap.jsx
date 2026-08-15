import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SOMALIA_CENTER, SOMALIA_ZOOM } from "../../constants/map";
import { buildTripRoadDisplay, fetchOsrmRoadPath } from "../../utils/geo";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortDriverName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Darawal";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function liveDriverIcon(driverName) {
  const label = escapeHtml(shortDriverName(driverName));
  return L.divIcon({
    className: "shared-live-driver-marker",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
      <div style="width:30px;height:30px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px">🚛</div>
      <div style="margin-top:3px;max-width:120px;padding:2px 7px;border-radius:999px;background:rgba(15,23,42,.92);color:#fff;font:600 11px/1.2 system-ui,sans-serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</div>
    </div>`,
    iconSize: [130, 54],
    iconAnchor: [65, 42],
  });
}

const originIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#dc2626;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
    <div style="margin-top:2px;padding:1px 6px;border-radius:999px;background:#dc2626;color:#fff;font:700 9px/1.2 system-ui,sans-serif">FROM</div>
  </div>`,
  iconSize: [48, 36],
  iconAnchor: [24, 28],
});

const destIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#16a34a;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
    <div style="margin-top:2px;padding:1px 6px;border-radius:999px;background:#16a34a;color:#fff;font:700 9px/1.2 system-ui,sans-serif">TO</div>
  </div>`,
  iconSize: [48, 36],
  iconAnchor: [24, 28],
});

function FitRoad({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: SOMALIA_ZOOM.city });
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], SOMALIA_ZOOM.city);
      return;
    }
    map.setView([SOMALIA_CENTER.lat, SOMALIA_CENTER.lng], SOMALIA_ZOOM.country);
  }, [map, points]);
  return null;
}

/**
 * Shared trip road map — FROM (red) → green road → TO (green) + live truck.
 */
export function SharedTripStopsMap({
  driverPosition = null,
  driverName = "",
  pickup = "",
  destination = "",
  className = "h-80 w-full max-w-full rounded-xl",
}) {
  const icon = useMemo(() => liveDriverIcon(driverName), [driverName]);
  const [osrmPath, setOsrmPath] = useState([]);

  const tripLike = useMemo(
    () => ({
      pickup,
      destination,
      lastLocation: driverPosition
        ? { lat: driverPosition.lat, lng: driverPosition.lng }
        : null,
    }),
    [pickup, destination, driverPosition]
  );

  const road = useMemo(() => buildTripRoadDisplay({ trip: tripLike }), [tripLike]);

  useEffect(() => {
    let cancelled = false;
    if (!road.origin || !road.destination) {
      setOsrmPath([]);
      return undefined;
    }
    fetchOsrmRoadPath(road.origin, road.destination, road.livePoint).then((path) => {
      if (!cancelled && path?.length) setOsrmPath(path);
    });
    return () => {
      cancelled = true;
    };
  }, [
    road.origin?.lat,
    road.origin?.lng,
    road.destination?.lat,
    road.destination?.lng,
    road.livePoint?.lat,
    road.livePoint?.lng,
  ]);

  const routePoints = osrmPath.length >= 2 ? osrmPath : road.routePoints;
  const origin = road.origin;
  const dest = road.destination;

  const fitPoints = useMemo(() => {
    const pts = [];
    if (origin) pts.push([origin.lat, origin.lng]);
    if (dest) pts.push([dest.lat, dest.lng]);
    if (driverPosition) pts.push([driverPosition.lat, driverPosition.lng]);
    routePoints.forEach((p) => pts.push([p.lat, p.lng]));
    return pts;
  }, [origin, dest, driverPosition, routePoints]);

  const hasRoad = Boolean(origin || dest || routePoints.length > 1 || driverPosition);

  return (
    <div className={`relative z-0 max-w-full overflow-hidden isolate ${className}`}>
      <MapContainer
        center={[SOMALIA_CENTER.lat, SOMALIA_CENTER.lng]}
        zoom={SOMALIA_ZOOM.country}
        className="h-full w-full max-w-full"
        scrollWheelZoom
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoad points={fitPoints} />
        {routePoints.length > 1 ? (
          <Polyline
            positions={routePoints.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: "#16a34a", weight: 6, opacity: 0.95 }}
          />
        ) : null}
        {origin ? (
          <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
            <Popup>
              <strong>From</strong>
              <br />
              {pickup || origin.label || "Pickup"}
            </Popup>
          </Marker>
        ) : null}
        {dest ? (
          <Marker position={[dest.lat, dest.lng]} icon={destIcon}>
            <Popup>
              <strong>To</strong>
              <br />
              {destination || dest.label || "Destination"}
            </Popup>
          </Marker>
        ) : null}
        {driverPosition ? (
          <Marker position={[driverPosition.lat, driverPosition.lng]} icon={icon}>
            <Popup>
              <strong>{driverName || "Darawal"}</strong>
              <br />
              GPS live
            </Popup>
          </Marker>
        ) : null}
      </MapContainer>
      {!hasRoad ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-container-low/70">
          <p className="rounded-lg bg-surface-container-lowest px-4 py-2 text-sm text-on-surface-variant">
            Road map lama heli karo — hubi pickup / destination
          </p>
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-surface-container-lowest/90 px-2 py-1 text-[10px] text-on-surface-variant shadow">
        {pickup || "From"} → {destination || "To"}
        {driverPosition ? " · live" : ""}
        {routePoints.length > 1 ? ` · ${routePoints.length} pts` : ""}
      </div>
    </div>
  );
}
