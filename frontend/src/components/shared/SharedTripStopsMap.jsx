import { useEffect } from "react";
import { MapContainer, TileLayer, Popup, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { SOMALIA_CENTER, SOMALIA_ZOOM } from "../../constants/map";

function FitGps({ driverPos }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (driverPos?.lat != null && driverPos?.lng != null) {
      map.setView([driverPos.lat, driverPos.lng], SOMALIA_ZOOM.city);
      return;
    }
    map.setView([SOMALIA_CENTER.lat, SOMALIA_CENTER.lng], SOMALIA_ZOOM.country);
  }, [map, driverPos]);
  return null;
}

/**
 * Shared trip map — live GPS only. No estimated from/to city markers.
 */
export function SharedTripStopsMap({
  driverPosition = null,
  className = "h-80 w-full rounded-xl",
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <MapContainer
        center={[SOMALIA_CENTER.lat, SOMALIA_CENTER.lng]}
        zoom={SOMALIA_ZOOM.country}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitGps driverPos={driverPosition} />
        {driverPosition ? (
          <CircleMarker
            center={[driverPosition.lat, driverPosition.lng]}
            radius={8}
            pathOptions={{ color: "#ea4335", fillColor: "#ea4335", fillOpacity: 1, weight: 2 }}
          >
            <Popup>Your GPS (live)</Popup>
          </CircleMarker>
        ) : null}
      </MapContainer>
      {!driverPosition ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-container-low/70">
          <p className="rounded-lg bg-surface-container-lowest px-4 py-2 text-sm text-on-surface-variant">
            GPS live kaliya — oggolow location access
          </p>
        </div>
      ) : null}
    </div>
  );
}
