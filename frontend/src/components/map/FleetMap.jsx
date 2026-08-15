import { useEffect, useMemo, useRef } from "react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { MapContainer, TileLayer, Marker as LeafletMarker, Polyline, Popup, useMap as useLeafletMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GOOGLE_MAPS_API_KEY, SOMALIA_BOUNDS, SOMALIA_CENTER, SOMALIA_ZOOM } from "../../constants/map";
import { tripsToMarkers } from "../../utils/geo";

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
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

/** Live truck pin with driver name always visible under the icon. */
function truckMarkerIcon({ driverName = "", selected = false, estimated = false } = {}) {
  const label = shortDriverName(driverName);
  const size = selected ? 34 : estimated ? 26 : 28;
  const bg = selected ? "#ea4335" : estimated ? "#f97316" : "#1a73e8";
  const border = estimated ? "2px dashed #fff" : "3px solid #fff";
  const safe = escapeHtml(label);
  const labelHtml = safe
    ? `<div style="margin-top:3px;max-width:110px;padding:2px 6px;border-radius:999px;background:rgba(15,23,42,.92);color:#fff;font:600 10px/1.2 system-ui,sans-serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.35)">${safe}</div>`
    : "";

  return L.divIcon({
    className: "fleet-truck-marker",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:${border};box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:${selected ? 16 : 14}px">🚛</div>
      ${labelHtml}
    </div>`,
    iconSize: [120, label ? 52 : size],
    iconAnchor: [60, label ? 40 : size / 2],
  });
}

/** Red origin pin (mesha gaariga ka soo baxayo). */
const originIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#dc2626;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
    <div style="margin-top:2px;padding:1px 6px;border-radius:999px;background:#dc2626;color:#fff;font:700 9px/1.2 system-ui,sans-serif">FROM</div>
  </div>`,
  iconSize: [48, 36],
  iconAnchor: [24, 28],
});

/** Green destination pin (mesha uu u socdo). */
const destIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#16a34a;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
    <div style="margin-top:2px;padding:1px 6px;border-radius:999px;background:#16a34a;color:#fff;font:700 9px/1.2 system-ui,sans-serif">TO</div>
  </div>`,
  iconSize: [48, 36],
  iconAnchor: [24, 28],
});

function LeafletTripMarker({ marker, selectedId, onSelect }) {
  const ref = useRef(null);
  const lat = Number(marker.lat);
  const lng = Number(marker.lng);
  const position = useMemo(() => [lat, lng], [lat, lng]);
  const selected = marker.id === selectedId;
  const icon = useMemo(
    () =>
      truckMarkerIcon({
        driverName: marker.driver,
        selected,
        estimated: marker.live === false,
      }),
    [marker.driver, marker.live, selected]
  );

  useEffect(() => {
    if (!ref.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const current = ref.current.getLatLng?.();
    if (
      current &&
      Math.abs(current.lat - lat) < 1e-7 &&
      Math.abs(current.lng - lng) < 1e-7
    ) {
      return;
    }
    ref.current.setLatLng(position);
  }, [position, lat, lng]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return (
    <LeafletMarker
      ref={ref}
      position={position}
      icon={icon}
      eventHandlers={{ click: () => onSelect?.(marker.id) }}
    >
      <Popup>
        <strong>{marker.driver || "Darawal"}</strong>
        <br />
        {marker.label}
        <br />
        {marker.subtitle}
        <br />
        <span className="text-xs">
          {marker.gpsStatus || "Live GPS"}
          {marker.speedKmh != null ? ` · ${marker.speedKmh} km/h` : ""}
        </span>
        {marker.lastSeenLabel ? (
          <>
            <br />
            <span className="text-xs">{marker.lastSeenLabel}</span>
          </>
        ) : null}
      </Popup>
    </LeafletMarker>
  );
}

function LeafletResizeFix() {
  const map = useLeafletMap();

  useEffect(() => {
    if (!map) return;
    const fix = () => map.invalidateSize();
    fix();
    const timer = setTimeout(fix, 150);
    window.addEventListener("resize", fix);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", fix);
    };
  }, [map]);

  return null;
}

function GoogleFitBounds({ markers, selectedId, routePoints, originPoint, destinationPoint }) {
  const map = useMap();
  const fittedRouteKey = useRef("");
  const lastFollowKey = useRef("");
  const userPausedFollow = useRef(false);
  const resumeTimer = useRef(null);

  useEffect(() => {
    if (!map || !window.google) return undefined;
    const pause = () => {
      userPausedFollow.current = true;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        userPausedFollow.current = false;
      }, 12_000);
    };
    const dragListener = map.addListener("dragstart", pause);
    return () => {
      window.google.maps.event.removeListener(dragListener);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !window.google) return;
    const routeKey = [
      selectedId || "",
      originPoint?.lat,
      originPoint?.lng,
      destinationPoint?.lat,
      destinationPoint?.lng,
    ].join("|");
    if (fittedRouteKey.current === routeKey) return;
    fittedRouteKey.current = routeKey;
    lastFollowKey.current = "";

    const roadPts = collectRoadBounds([], routePoints, originPoint, destinationPoint);
    if (roadPts.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      roadPts.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
      map.fitBounds(bounds, { top: 56, right: 56, bottom: 56, left: 56 });
      return;
    }

    const sel = markers.find((m) => m.id === selectedId) || markers[0];
    if (sel) {
      map.panTo({ lat: sel.lat, lng: sel.lng });
      map.setZoom(Math.max(map.getZoom() || SOMALIA_ZOOM.city, SOMALIA_ZOOM.city));
    } else {
      map.panTo(SOMALIA_CENTER);
      map.setZoom(SOMALIA_ZOOM.country);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId, originPoint?.lat, originPoint?.lng, destinationPoint?.lat, destinationPoint?.lng]);

  useEffect(() => {
    if (!map || !window.google || userPausedFollow.current) return;
    const sel =
      (selectedId && markers.find((m) => m.id === selectedId)) ||
      (markers.length === 1 ? markers[0] : null);
    if (!sel || !Number.isFinite(Number(sel.lat)) || sel.live === false) return;

    const key = `${sel.id}:${Number(sel.lat).toFixed(5)},${Number(sel.lng).toFixed(5)}`;
    if (lastFollowKey.current === key) return;
    lastFollowKey.current = key;

    map.panTo({ lat: sel.lat, lng: sel.lng });
    if ((map.getZoom() || 0) < SOMALIA_ZOOM.city) {
      map.setZoom(SOMALIA_ZOOM.city);
    }
  }, [map, markers, selectedId]);

  return null;
}

function collectRoadBounds(markers, routePoints, originPoint, destinationPoint) {
  const pts = [];
  markers.forEach((m) => pts.push([m.lat, m.lng]));
  (routePoints || []).forEach((p) => {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) pts.push([p.lat, p.lng]);
  });
  if (originPoint) pts.push([originPoint.lat, originPoint.lng]);
  if (destinationPoint) pts.push([destinationPoint.lat, destinationPoint.lng]);
  return pts;
}

function LeafletFitBounds({ markers, selectedId, routePoints, originPoint, destinationPoint }) {
  const map = useLeafletMap();
  const fittedRouteKey = useRef("");
  const lastFollowKey = useRef("");
  const userPausedFollow = useRef(false);
  const resumeTimer = useRef(null);

  // Pause auto-follow while the admin pans/zooms; resume after idle.
  useEffect(() => {
    if (!map) return undefined;
    const pause = () => {
      userPausedFollow.current = true;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        userPausedFollow.current = false;
      }, 12_000);
    };
    map.on("dragstart", pause);
    return () => {
      map.off("dragstart", pause);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [map]);

  // Fit FROM→TO route only when the selected trip/route changes (not on every GPS tick).
  useEffect(() => {
    if (!map) return;
    const routeKey = [
      selectedId || "",
      originPoint?.lat,
      originPoint?.lng,
      destinationPoint?.lat,
      destinationPoint?.lng,
    ].join("|");

    if (fittedRouteKey.current === routeKey) return;
    fittedRouteKey.current = routeKey;
    lastFollowKey.current = "";

    const roadPts = collectRoadBounds([], routePoints, originPoint, destinationPoint);
    if (roadPts.length > 1) {
      map.fitBounds(L.latLngBounds(roadPts), { padding: [56, 56], maxZoom: 14 });
      return;
    }

    const sel = markers.find((m) => m.id === selectedId) || markers[0];
    if (sel) {
      map.setView([sel.lat, sel.lng], Math.max(map.getZoom(), SOMALIA_ZOOM.city), { animate: true });
    } else if (originPoint) {
      map.setView([originPoint.lat, originPoint.lng], SOMALIA_ZOOM.city, { animate: true });
    } else {
      map.setView([SOMALIA_CENTER.lat, SOMALIA_CENTER.lng], SOMALIA_ZOOM.country);
    }
    // routePoints omitted from key so OSRM refreshes / GPS ticks do not re-frame the map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId, originPoint?.lat, originPoint?.lng, destinationPoint?.lat, destinationPoint?.lng]);

  // Keep the map following the selected truck as GPS updates arrive.
  useEffect(() => {
    if (!map || userPausedFollow.current) return;

    const sel =
      (selectedId && markers.find((m) => m.id === selectedId)) ||
      (markers.length === 1 ? markers[0] : null);
    if (!sel || !Number.isFinite(Number(sel.lat)) || !Number.isFinite(Number(sel.lng))) return;
    if (sel.live === false) return;

    const key = `${sel.id}:${Number(sel.lat).toFixed(5)},${Number(sel.lng).toFixed(5)}`;
    if (lastFollowKey.current === key) return;
    lastFollowKey.current = key;

    const target = L.latLng(sel.lat, sel.lng);
    const zoom = Math.max(map.getZoom(), SOMALIA_ZOOM.city);
    // Pan so the truck stays in view (and roughly centered while moving).
    if (map.getZoom() < SOMALIA_ZOOM.city) {
      map.setView(target, zoom, { animate: true });
    } else {
      map.panTo(target, { animate: true, duration: 0.55 });
    }
  }, [map, markers, selectedId]);

  return null;
}

function GoogleRouteLayer({ routePoints, originPoint, destinationPoint }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google) return;
    const overlays = [];

    if (routePoints.length > 1) {
      const line = new window.google.maps.Polyline({
        path: routePoints.map((p) => ({ lat: p.lat, lng: p.lng })),
        strokeColor: "#16a34a",
        strokeOpacity: 0.95,
        strokeWeight: 6,
      });
      line.setMap(map);
      overlays.push(line);
    }

    if (originPoint) {
      overlays.push(
        new window.google.maps.Marker({
          position: { lat: originPoint.lat, lng: originPoint.lng },
          map,
          title: originPoint.label || "From",
          icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
        })
      );
    }

    if (destinationPoint) {
      overlays.push(
        new window.google.maps.Marker({
          position: { lat: destinationPoint.lat, lng: destinationPoint.lng },
          map,
          title: destinationPoint.label || "To",
          icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
        })
      );
    }

    return () => overlays.forEach((item) => item.setMap(null));
  }, [map, routePoints, originPoint, destinationPoint]);

  return null;
}

function GoogleFleetMap({
  markers,
  selectedId,
  onSelect,
  routePoints,
  originPoint,
  destinationPoint,
  className,
}) {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <Map
        className={className}
        defaultCenter={SOMALIA_CENTER}
        defaultZoom={SOMALIA_ZOOM.country}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        restriction={{
          latLngBounds: SOMALIA_BOUNDS,
          strictBounds: false,
        }}
        style={{ width: "100%", height: "100%", minHeight: 360 }}
      >
        <GoogleFitBounds
          markers={markers}
          selectedId={selectedId}
          routePoints={routePoints}
          originPoint={originPoint}
          destinationPoint={destinationPoint}
        />
        <GoogleRouteLayer
          routePoints={routePoints}
          originPoint={originPoint}
          destinationPoint={destinationPoint}
        />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={{ lat: m.lat, lng: m.lng }}
            title={[m.driver, m.label].filter(Boolean).join(" · ") || m.id}
            label={
              m.driver
                ? {
                    text: shortDriverName(m.driver),
                    color: "#0f172a",
                    fontSize: "11px",
                    fontWeight: "700",
                    className: "fleet-driver-label",
                  }
                : undefined
            }
            onClick={() => onSelect?.(m.id)}
            icon={{
              url:
                m.id === selectedId
                  ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                  : m.live
                    ? "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                    : "http://maps.google.com/mapfiles/ms/icons/orange-dot.png",
            }}
          />
        ))}
      </Map>
    </APIProvider>
  );
}

function LeafletFleetMap({
  markers,
  selectedId,
  onSelect,
  routePoints,
  originPoint,
  destinationPoint,
  className,
}) {
  const routePath = routePoints.map((p) => [p.lat, p.lng]);

  return (
    <MapContainer
      className={className}
      center={[SOMALIA_CENTER.lat, SOMALIA_CENTER.lng]}
      zoom={SOMALIA_ZOOM.country}
      style={{ width: "100%", height: "100%", minHeight: 360 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LeafletResizeFix />
      <LeafletFitBounds
        markers={markers}
        selectedId={selectedId}
        routePoints={routePoints}
        originPoint={originPoint}
        destinationPoint={destinationPoint}
      />
      {routePath.length > 1 ? (
        <Polyline
          positions={routePath}
          pathOptions={{ color: "#16a34a", weight: 6, opacity: 0.95 }}
        />
      ) : null}
      {originPoint ? (
        <LeafletMarker position={[originPoint.lat, originPoint.lng]} icon={originIcon}>
          <Popup>
            <strong>From</strong>
            <br />
            {originPoint.label || "Pickup"}
          </Popup>
        </LeafletMarker>
      ) : null}
      {destinationPoint ? (
        <LeafletMarker position={[destinationPoint.lat, destinationPoint.lng]} icon={destIcon}>
          <Popup>
            <strong>To</strong>
            <br />
            {destinationPoint.label || "Destination"}
          </Popup>
        </LeafletMarker>
      ) : null}
      {markers.map((m) => (
        <LeafletTripMarker
          key={m.id}
          marker={m}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </MapContainer>
  );
}

/**
 * Interactive GPS fleet map centered on Somalia.
 * Road map: red FROM pin, green TO pin, green route, live truck.
 * Uses OpenStreetMap by default; set VITE_MAP_PROVIDER=google to use Google Maps.
 */
export function FleetMap({
  trips = [],
  selectedId,
  onSelect,
  routePoints = [],
  originPoint = null,
  destinationPoint = null,
  className = "h-full w-full",
}) {
  const markers = useMemo(() => tripsToMarkers(trips), [trips]);
  const liveCount = markers.length;
  const useGoogle =
    import.meta.env.VITE_MAP_PROVIDER === "google" && Boolean(GOOGLE_MAPS_API_KEY);
  const hasRoad = Boolean(originPoint || destinationPoint || routePoints.length > 1);

  return (
    <div className={`relative min-h-[360px] overflow-hidden ${className}`}>
      {useGoogle ? (
        <GoogleFleetMap
          markers={markers}
          selectedId={selectedId}
          onSelect={onSelect}
          routePoints={routePoints}
          originPoint={originPoint}
          destinationPoint={destinationPoint}
          className="h-full w-full"
        />
      ) : (
        <LeafletFleetMap
          markers={markers}
          selectedId={selectedId}
          onSelect={onSelect}
          routePoints={routePoints}
          originPoint={originPoint}
          destinationPoint={destinationPoint}
          className="h-full w-full z-0"
        />
      )}
      {!markers.length && !hasRoad ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-container-low/60">
          <p className="rounded-lg bg-surface-container-lowest/90 px-4 py-2 text-sm text-on-surface-variant shadow">
            No active trips to show on the map
          </p>
        </div>
      ) : null}
      {markers.length || hasRoad ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-surface-container-lowest/90 px-2 py-1 text-[10px] text-on-surface-variant shadow">
          {liveCount ? `${liveCount} live GPS` : "Road map"}
          {routePoints.length > 1 ? ` · route ${routePoints.length} pts` : ""}
        </div>
      ) : null}
      {!useGoogle && markers.length ? (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-surface-container-lowest/80 px-2 py-1 text-[10px] text-on-surface-variant">
          Somalia · OpenStreetMap
        </div>
      ) : null}
    </div>
  );
}
