import { useEffect, useMemo, useRef } from "react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { MapContainer, TileLayer, Marker as LeafletMarker, Polyline, Popup, useMap as useLeafletMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GOOGLE_MAPS_API_KEY, SOMALIA_BOUNDS, SOMALIA_CENTER, SOMALIA_ZOOM } from "../../constants/map";
import { tripsToMarkers } from "../../utils/geo";

const truckIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px">🚛</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const estimatedIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;border-radius:50%;background:#f97316;border:2px dashed #fff;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:13px;opacity:.9">🚛</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const selectedIcon = L.divIcon({
  className: "",
  html: `<div style="width:34px;height:34px;border-radius:50%;background:#ea4335;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:16px">🚛</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

function LeafletTripMarker({ marker, selectedId, onSelect, truckIcon, selectedIcon }) {
  const ref = useRef(null);
  const position = useMemo(() => [marker.lat, marker.lng], [marker.lat, marker.lng]);

  useEffect(() => {
    ref.current?.setLatLng(position);
  }, [position]);

  return (
    <LeafletMarker
      ref={ref}
      position={position}
      icon={marker.id === selectedId ? selectedIcon : truckIcon}
      eventHandlers={{ click: () => onSelect?.(marker.id) }}
    >
      <Popup>
        <strong>{marker.label}</strong>
        <br />
        {marker.subtitle}
        <br />
        <span className="text-xs">
          {marker.gpsStatus || "Live GPS"}
          {marker.speedKmh != null ? ` · ${marker.speedKmh} km/h` : ""}
        </span>
        {marker.driver ? (
          <>
            <br />
            <span className="text-xs">{marker.driver}</span>
          </>
        ) : null}
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

function GoogleFitBounds({ markers, selectedId }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google) return;

    if (selectedId) {
      const sel = markers.find((m) => m.id === selectedId);
      if (sel) {
        map.panTo({ lat: sel.lat, lng: sel.lng });
        return;
      }
    }

    if (markers.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
    } else if (markers.length === 1) {
      map.panTo({ lat: markers[0].lat, lng: markers[0].lng });
      map.setZoom(SOMALIA_ZOOM.tracking);
    } else {
      map.panTo(SOMALIA_CENTER);
      map.setZoom(SOMALIA_ZOOM.country);
    }
  }, [map, markers, selectedId]);

  return null;
}

function LeafletFitBounds({ markers, selectedId }) {
  const map = useLeafletMap();

  useEffect(() => {
    if (!map) return;

    if (selectedId) {
      const sel = markers.find((m) => m.id === selectedId);
      if (sel) {
        map.setView([sel.lat, sel.lng], map.getZoom(), { animate: true });
        return;
      }
    }

    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [48, 48] });
    } else if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], SOMALIA_ZOOM.tracking, { animate: true });
    } else {
      map.setView([SOMALIA_CENTER.lat, SOMALIA_CENTER.lng], SOMALIA_ZOOM.country);
    }
  }, [map, markers, selectedId]);

  return null;
}

const destIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;border-radius:50%;background:#16a34a;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:12px">📍</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

function GoogleRouteLayer({ routePoints, destinationPoint }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google) return;
    const overlays = [];

    if (routePoints.length > 1) {
      const line = new window.google.maps.Polyline({
        path: routePoints.map((p) => ({ lat: p.lat, lng: p.lng })),
        strokeColor: "#f97316",
        strokeOpacity: 0.9,
        strokeWeight: 4
      });
      line.setMap(map);
      overlays.push(line);
    }

    if (destinationPoint) {
      const marker = new window.google.maps.Marker({
        position: { lat: destinationPoint.lat, lng: destinationPoint.lng },
        map,
        title: "Destination",
        icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
      });
      overlays.push(marker);
    }

    return () => overlays.forEach((item) => item.setMap(null));
  }, [map, routePoints, destinationPoint]);

  return null;
}

function GoogleFleetMap({ markers, selectedId, onSelect, routePoints, destinationPoint, className }) {
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
          strictBounds: false
        }}
        style={{ width: "100%", height: "100%", minHeight: 360 }}
      >
        <GoogleFitBounds markers={markers} selectedId={selectedId} />
        <GoogleRouteLayer routePoints={routePoints} destinationPoint={destinationPoint} />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={{ lat: m.lat, lng: m.lng }}
            title={m.label}
            onClick={() => onSelect?.(m.id)}
            icon={{
              url: m.id === selectedId
                ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                : m.live
                  ? "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                  : "http://maps.google.com/mapfiles/ms/icons/orange-dot.png"
            }}
          />
        ))}
      </Map>
    </APIProvider>
  );
}

function LeafletFleetMap({ markers, selectedId, onSelect, routePoints, destinationPoint, className }) {
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
      <LeafletFitBounds markers={markers} selectedId={selectedId} />
      {routePath.length > 1 ? (
        <Polyline positions={routePath} pathOptions={{ color: "#f97316", weight: 4, opacity: 0.9 }} />
      ) : null}
      {destinationPoint ? (
        <LeafletMarker position={[destinationPoint.lat, destinationPoint.lng]} icon={destIcon}>
          <Popup>Destination</Popup>
        </LeafletMarker>
      ) : null}
      {markers.map((m) => (
        <LeafletTripMarker
          key={m.id}
          marker={m}
          selectedId={selectedId}
          onSelect={onSelect}
          truckIcon={truckIcon}
          selectedIcon={selectedIcon}
        />
      ))}
    </MapContainer>
  );
}

/**
 * Interactive GPS fleet map centered on Somalia.
 * Uses OpenStreetMap by default; set VITE_MAP_PROVIDER=google to use Google Maps.
 */
export function FleetMap({
  trips = [],
  selectedId,
  onSelect,
  routePoints = [],
  destinationPoint = null,
  className = "h-full w-full"
}) {
  const markers = useMemo(() => tripsToMarkers(trips), [trips]);
  const liveCount = markers.length;
  const useGoogle =
    import.meta.env.VITE_MAP_PROVIDER === "google" && Boolean(GOOGLE_MAPS_API_KEY);

  return (
    <div className={`relative min-h-[360px] overflow-hidden ${className}`}>
      {useGoogle ? (
        <GoogleFleetMap
          markers={markers}
          selectedId={selectedId}
          onSelect={onSelect}
          routePoints={routePoints}
          destinationPoint={destinationPoint}
          className="h-full w-full"
        />
      ) : (
        <LeafletFleetMap
          markers={markers}
          selectedId={selectedId}
          onSelect={onSelect}
          routePoints={routePoints}
          destinationPoint={destinationPoint}
          className="h-full w-full z-0"
        />
      )}
      {!markers.length ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-container-low/60">
          <p className="rounded-lg bg-surface-container-lowest/90 px-4 py-2 text-sm text-on-surface-variant shadow">
            No active trips to show on the map
          </p>
        </div>
      ) : null}
      {markers.length ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-surface-container-lowest/90 px-2 py-1 text-[10px] text-on-surface-variant shadow">
          {liveCount} live GPS
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
