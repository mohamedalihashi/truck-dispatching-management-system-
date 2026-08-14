import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SOMALIA_CENTER, SOMALIA_ZOOM } from "../../constants/map";
import { useTripReplay } from "../../hooks/useApi";

const truckIcon = L.divIcon({
  className: "",
  html: `<div style="width:30px;height:30px;border-radius:50%;background:#ea4335;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px">🚛</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function FollowMarker({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position);
  }, [map, position]);
  return null;
}

/**
 * Trip Replay — plays back stored GPS points on a map.
 */
export function TripReplayModal({ tripId, open, onClose }) {
  const { data, isLoading } = useTripReplay(tripId, { enabled: open && Boolean(tripId) });
  const points = data?.points || [];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setPlaying(false);
    }
  }, [open, tripId]);

  useEffect(() => {
    if (!playing || !points.length) return undefined;
    const timer = setInterval(() => {
      setIndex((prev) => {
        if (prev >= points.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, Math.max(80, 400 / speed));
    return () => clearInterval(timer);
  }, [playing, points.length, speed]);

  const current = points[index];
  const path = useMemo(
    () => points.slice(0, index + 1).map((p) => [p.lat, p.lng]),
    [points, index]
  );

  if (!open) return null;

  return (
    <Modal title={`Trip Replay — ${tripId}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-on-surface-variant">
          {data?.driver || "Driver"} · {data?.truck || "Truck"} · {data?.pickup} → {data?.destination}
        </p>
        <div className="h-72 overflow-hidden rounded-lg border border-outline-variant">
          {isLoading ? (
            <p className="p-6 text-sm text-on-surface-variant">Loading route…</p>
          ) : !points.length ? (
            <p className="p-6 text-sm text-on-surface-variant">No GPS history for this trip.</p>
          ) : (
            <MapContainer
              center={current ? [current.lat, current.lng] : SOMALIA_CENTER}
              zoom={SOMALIA_ZOOM.city}
              className="h-full w-full"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline positions={points.map((p) => [p.lat, p.lng])} color="#94a3b8" weight={3} />
              {path.length > 1 ? <Polyline positions={path} color="#1a73e8" weight={4} /> : null}
              {current ? (
                <>
                  <Marker position={[current.lat, current.lng]} icon={truckIcon} />
                  <FollowMarker position={[current.lat, current.lng]} />
                </>
              ) : null}
            </MapContainer>
          )}
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          className="w-full"
          disabled={!points.length}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setIndex(0)} disabled={!points.length}>
            Start
          </Button>
          <Button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={!points.length}
          >
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIndex(Math.max(0, points.length - 1))}
            disabled={!points.length}
          >
            End
          </Button>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                speed === s ? "bg-secondary-container text-white" : "bg-surface-container-low"
              }`}
            >
              {s}x
            </button>
          ))}
          <span className="ml-auto text-xs text-on-surface-variant">
            {current?.at ? new Date(current.at).toLocaleString() : "—"}
            {current?.speedKmh != null ? ` · ${current.speedKmh} km/h` : ""}
            {` · ${points.length ? index + 1 : 0}/${points.length}`}
          </span>
        </div>
      </div>
    </Modal>
  );
}
